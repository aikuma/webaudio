import { Subject } from 'rxjs/Subject'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/operator/takeWhile'
import 'rxjs/add/operator/map'
import { aikumicWorker } from './worker'

export interface RecordStats {
  frames: number
  offset: number
  ms: number
}
/**
 * Microphone Service.
 *
 * ### Example (es module)
 * ```js
 * import { microphone } from 'aikumic'
 * const mic = new microphone()
 * mic.connect()
 * ```
 *
 * @param value   Comment describing the `value` parameter.
 * @returns       Comment describing the return type.
 * @anotherNote   Some other value.
 */
export class Microphone {
  audioContext: AudioContext
  sourceNode: MediaStreamAudioSourceNode
  stream: MediaStream
  progressSubject: Subject<any> = new Subject()
  node: ScriptProcessorNode
  config: {bufferLen: number, numChannels: number, sampleRate: number} = {bufferLen: 8192, numChannels: 1, sampleRate: 16000}
  recording: boolean = false
  playing: boolean = false
  hasData: boolean = false
  stopping: boolean = false
  stopTick: number = 0
  startFlag: boolean = false
  worker: Worker
  startRecording: Date = null
  tempElapsed: number = 0
  finalBuffers: Float32Array[] = []
  callbacks: {getBuffer: Function[]} = {
    getBuffer: []
  }
  debugMode: boolean
  obsWorker: Subject<any>
  processing: boolean = false
  constructor(config?: {audioContext?: AudioContext, debug?: boolean, resampleRate?: number}) {
    this.audioContext = config && config.audioContext ? config.audioContext : new AudioContext()
    this.debugMode = config && config.debug ? config.debug : false
    if (config && config.resampleRate ) {
      if (config.resampleRate < 3000 || config.resampleRate >= this.audioContext.sampleRate) {
        throw new Error('Invalid reSample rate')
      } else {
        this.config.sampleRate = config.resampleRate
      }
    }
    this._init()
  }
  _init() {
    this.debug('init()')
    this.recording = false
    this.finalBuffers = []
    this.hasData = false
    this._initWorker()
  }
  debug(...args) {
    if (this.debugMode) {
      console.log('aikumic:', ...args)
    }
  }
  async connect() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('No getUserMedia')
    }
    let ms: MediaStream
    try {
      ms = await navigator.mediaDevices.getUserMedia({audio: true, video: false})
    } catch(e) {
      throw new Error("Can't get microphone stream "+e)
    }
    this.sourceNode = this.audioContext.createMediaStreamSource(ms)
    this.stream = ms
  }
  record(): void {
    if (!this.sourceNode) {
      throw new Error('No source node, did you call .connect() first?')
    }
    if (!this.canRecord()) {
      throw new Error('Cannot start recording, check canRecord() first.')
    }
    this.node = this.audioContext.createScriptProcessor(this.config.bufferLen, this.config.numChannels, this.config.numChannels)
    this.node.onaudioprocess = (e) => {
      if (!this.recording) {
        return
      } else if (this.stopping) {
        this.debug('stopping recording', this.stopTick)
        // This deals with some latency which would otherwise cut off a recording early
        if (this.stopTick === 1) {
          this.recording = false
          this.stopping = false
          this.hasData = true
          this.stopTick = 0
        } else {
          ++this.stopTick
        }
      }
      let cdat = e.inputBuffer.getChannelData(0)
      let fa = new Float32Array(cdat.length)
      fa.set(cdat, 0)
      let rtype: number = 0
      if (!this.recording) {
        rtype = 2 // fade out
      } else if (this.startFlag) {
        rtype = 1 // fade in
        this.startFlag = false
      }
      this.worker.postMessage({
        command: 'record',
        type: rtype,
        buffer: fa
      })
    }
    this.sourceNode.connect(this.node)
    this.node.connect(this.audioContext.destination) 
    this.startRecording = new Date()
    this.tempElapsed = 0
    this.startFlag = true
    this.recording = true
    this.stopping = false
    this._progressTick()
  }
  destroy(): void {
    if (this.stream) {
      for (let track of this.stream.getAudioTracks()) {
        track.stop()
      }
    }
    this.progressSubject.complete()
  }
  // construct elapsed from the samples we have in final buffers plus
  // a temporary timer. 
  getElapsed(): number {
    let tl: number = 0
    for (let f of this.finalBuffers) {
      tl += f.length
    }
    return ~~((tl / this.config.sampleRate) * 1000) + this.tempElapsed
  }
  isRecording(): boolean {
    return this.recording
  }
  isPlaying(): boolean {
    return this.playing
  }
  hasRecordedData(): boolean {
    return this.hasData
  }
  observeProgress(): Observable<number> {
    return this.progressSubject.asObservable()
  }
  async pause() { 
    if (this.recording) {
      this.stopping = true // this will stop the recording
      this.debug('pausing')
      while (this.recording) {
        await this._waitMilliseconds(100)
      }
    }
  }
  canRecord(): boolean {
    return !this.stopping && !this.recording && !this.processing
  }

  resume(): boolean {
    if (!this.recording) {
      this.recording = true
      this.stopping = false
      return true
    } else {
      return false
    }
  }
  // Promise resolves to number of frames saved in resampled buffer
  async stop(): Promise<RecordStats> {
    this.debug('stopping')
    // pausing will cause one extra buffer to be dumped, when recording = 
    this.stopping = true
    while (this.recording) {
      await this._waitMilliseconds(100)
    }
    this.sourceNode.disconnect(this.node)
    this.node.disconnect(this.audioContext.destination)
    //return this._saveSegment(await this._getBufferFromWorker())
    return this._saveSegment()
  }

  getLastLength(): { offset: number, frames: number, ms: number} {
    if (this.finalBuffers.length === 0) {
      return { offset: 0, frames: 0, ms: 0}
    } else {
      let tl = 0
      let offset: number = 0, frames: number = 0, ms: number = 0
      for (let bi = 0; bi < this.finalBuffers.length; ++bi) {
        if (bi < this.finalBuffers.length - 1) {
          tl += this.finalBuffers[bi].length
        } else {
          offset = tl
          frames = this.finalBuffers[bi].length
          ms = Math.floor((frames / this.config.sampleRate) * 1000)
        }
      }
      return { offset: offset, frames: frames, ms: ms }
    }
  }
  getTotalLength(): { frames: number, ms: number } {
    let frames: number = 0
    for (let bi = 0; bi < this.finalBuffers.length; ++bi) {
      frames += this.finalBuffers[bi].length
    }
    return {
      ms: Math.floor((frames / this.config.sampleRate) * 1000),
      frames: frames
    }
  }
  getSegmentCount(): number {
    return this.finalBuffers.length
  }

  _waitMilliseconds(ms: number) {
    return new Promise((resolve) => {
      setTimeout(() =>  {
        resolve()
      }, ms)
    })
  }

  _saveSegment(): Promise<RecordStats> {
    const reSampleBuffer = (inputBuffer: Float32Array): Promise<Float32Array> => {
      let numFrames = ~~((inputBuffer.length / this.audioContext.sampleRate) * this.config.sampleRate)
      let offCont = new OfflineAudioContext(1, numFrames, this.config.sampleRate)
      let newBuffer = offCont.createBuffer(1, inputBuffer.length, this.audioContext.sampleRate)
      newBuffer.copyToChannel(inputBuffer, 0)
      let source = offCont.createBufferSource()
      source.buffer = newBuffer
      source.connect(offCont.destination)
      source.start()
      return offCont.startRendering().then((ab: AudioBuffer) => {
        let fa = new Float32Array(ab.getChannelData(0))
        return fa
      })
    }

    return new Promise((resolve) => {
      //let numFrames = ~~((rawbuffer.length / this.audioContext.sampleRate) * this.config.sampleRate)
      //this.debug('numframes',numFrames, 'from', rawbuffer.length, this.audioContext.sampleRate, this.config.sampleRate)
      this.processing = true
      let rTotalLen: number = 0
      let rProms: Promise<Float32Array>[] = []
      this._getBufferFromWorker().subscribe(
        (d) => {
          this.debug('getBufferFromWorker2() returned',d)
          rProms.push(reSampleBuffer(d))
        },
        null,
        () => {
          this.debug('*** getBufferFromWorker2() completed')
          Promise.all(rProms).then((results) => {
            for (let r of results) {
              rTotalLen += r.length
            }
            this.finalBuffers.push(this.mergeBuffers(results, rTotalLen))
            this.tempElapsed = 0
            this.startRecording = null
            console.log('finalbuff', this.finalBuffers)
            this.processing = false
            this.worker.postMessage({command: 'clear'})
            resolve(this.getLastLength())
          })
        }
      )
    })
  }

  clear() {
    this.recording = false
    this.finalBuffers = []
    this.hasData = false
    this.worker.postMessage({command: 'clear'})
  }

  async playSegment(segment: number): Promise<any> {
    if (segment > this.finalBuffers.length -1) {
      throw new Error('segment out of range')
    }
    await this._playBuffers([this.finalBuffers[segment]])
  }

  async playAll() {
    if (this.finalBuffers.length === 0) {
      return
    }
    await this._playBuffers(this.finalBuffers)
  }

  exportSegmentWav(segment: number): Blob {
    if (segment > this.finalBuffers.length -1) {
      throw new Error('segment out of range')
    }
    return this._arraysToWav([this.finalBuffers[segment]])
  }

  exportAllWav(): Blob | null {
    if (this.finalBuffers.length === 0) {
      return null
    }
    return this._arraysToWav(this.finalBuffers)
  }

  _playBuffers(buffers: Float32Array[]): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.playing) {
        reject('already playing')
      }
      let rTotalLen: number = 0
      for (let r of buffers) {
        rTotalLen += r.length
      }
      let ab = this.audioContext.createBuffer(1, rTotalLen, this.config.sampleRate)
      let offset: number = 0
      for (let x = 0; x < buffers.length; ++x) {
        ab.getChannelData(0).set(buffers[x], offset)
        offset += buffers[x].length
      }
      let source = this.audioContext.createBufferSource()
      source.buffer = ab
      source.connect(this.audioContext.destination)
      source.start()
      this.playing = true
      source.onended = () => {
        this.playing = false
        resolve()
      }
    })
  }

  _getBufferFromWorker(): Observable<Float32Array> {
    const takeUntilInclusive = (inner$, predicate) => {
      return Observable.create(observer => {
        let subscription = inner$.subscribe(item => {
          observer.next(item)
          if (predicate(item)) {
            observer.complete()
          }
        }, observer.onError, observer.onCompleted)
          return () => {
            subscription.unsubscribe()
          }
      })
    }
    this.worker.postMessage({command: 'streamBuffer'})
    let o = this.obsWorker.takeWhile(msg => msg.command === 'streamBuffer')
    return takeUntilInclusive(o, val => val.remaining === 0)
      .map(val => val.data)
  }

  // remove the progress subject from the onaudioprocess event
  _progressTick() {
    let now = new Date()
    this.tempElapsed = (now.valueOf() - this.startRecording.valueOf() )
    if (this.recording) {
      this.progressSubject.next(this.getElapsed())
      setTimeout(() => {
        this._progressTick()
      },10)
    }
  }

  mergeBuffers(recBuffers: Float32Array[], recLength: number): Float32Array {
    let result = new Float32Array(recLength)
    let offset = 0
    for (let i = 0; i < recBuffers.length; i++) {
      result.set(recBuffers[i], offset)
      offset += recBuffers[i].length
    }
    return result
  }

  _initWorker() {
    const makeInlineWorker = (func: any): Worker => {
      let functionBody = func.toString().trim().match(
        /^function\s*\w*\s*\([\w\s,]*\)\s*{([\w\W]*?)}$/
      )[1]
      return new Worker(URL.createObjectURL(
        new Blob([ functionBody ], { type: "text/javascript" })
      ))
    }
    this.worker = makeInlineWorker(aikumicWorker)
    this.obsWorker = new Subject()
    this.worker.onmessage = (e) => {
      this.obsWorker.next(e.data)
    }
    this.worker.postMessage({
      command: 'init',
      config: {
        sampleRate: this.audioContext.sampleRate
      }
    })
  }
  // Wave writing stuff
  //
  _arraysToWav (audioData: Float32Array[], channels = 1 , sampleRate = this.config.sampleRate): Blob {
    const floatTo16Bit = (samples: Float32Array): Int16Array => {
      var buffer = new ArrayBuffer(samples.length * 2)
      var view = new DataView(buffer)
      floatTo16BitPCM(view, 0, samples)
      return new Int16Array(buffer)
    }
    const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
      for (let i = 0; i < input.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, input[i]))
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      }
    }
    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }
    const encodeWAV = (inputArrays: Float32Array[], numChannels: number, sampleRate: number): DataView => {
      let rTotalLen: number = 0
      for (let r of inputArrays) {
        rTotalLen += r.length
      }
      var buffer = new ArrayBuffer(44 + rTotalLen * 2)
      var view = new DataView(buffer)
      /* RIFF identifier */
      writeString(view, 0, 'RIFF')
      /* RIFF chunk length */
      view.setUint32(4, 36 + rTotalLen * 2, true)
      /* RIFF type */
      writeString(view, 8, 'WAVE')
      /* format chunk identifier */
      writeString(view, 12, 'fmt ')
      /* format chunk length */
      view.setUint32(16, 16, true)
      /* sample format (raw) */
      view.setUint16(20, 1, true)
      /* channel count */
      view.setUint16(22, numChannels, true)
      /* sample rate */
      view.setUint32(24, sampleRate, true)
      /* byte rate (sample rate * block align) */
      view.setUint32(28, sampleRate * 4, true)
      /* block align (channel count * bytes per sample) */
      view.setUint16(32, numChannels * 2, true)
      /* bits per sample */
      view.setUint16(34, 16, true)
      /* data chunk identifier */
      writeString(view, 36, 'data')
      /* data chunk length */
      view.setUint32(40, rTotalLen * 2, true)
      let offset: number = 0
      for (let r of inputArrays) {
        floatTo16BitPCM(view, 44 + (offset * 2), r)
        offset += r.length
      }
      return view
    }

    var blob = new Blob([encodeWAV(audioData, channels, sampleRate)], {
      type: 'audio/wav'
    })
    return blob
  }

}
