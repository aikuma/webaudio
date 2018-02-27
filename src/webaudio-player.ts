import { Subject } from 'rxjs/Subject'
import { Observable } from 'rxjs/Observable'

// Typecript doesn't know about window.fetch 
// https://github.com/Microsoft/TypeScript/issues/8966
declare var fetch

export class WebAudioPlayer {
  audioContext: AudioContext
  updateRateMs: number = 100
  onProgressEvent: Function = null
  onEndEvent: Function = null
  playing: boolean = false
  ended: boolean = false
  currentTime: number = 0
  framesPlayed: number = 0
  sampleRate: number
  frames: number
  channels: number
  buffer: AudioBuffer
  duration: number
  scriptBufferLength: number
  updateInterval: number
  source: AudioBufferSourceNode
  progressSubject: Subject<number> = new Subject()
  startPlay: Date
  startOffset: number
  debugMode: boolean = false
  pinterval: number = null
  constructor(config?: {audioContext?: AudioContext, debug?: boolean}) {
    this.audioContext = config && config.audioContext ? config.audioContext : new AudioContext()
    this.debugMode = config && config.debug ? config.debug : false
  }
  debug(...args) {
    if (this.debugMode) {
      console.log('aikuplaya:', ...args)
    }
  }
  load(sourceURL: string): Promise<any>  {
    return fetch(sourceURL, {mode: 'cors'}).then((response) => {
      return response.arrayBuffer().then((buffer) => {
        return this._decodeAndInitialize(buffer)
      })
    })
  }
  // because the new record with review may as well just pass the array buffer instead of the wav
  loadFromBlob(source: Blob): Promise<any> {
    return new Promise((resolve) => {
      let fileReader = new FileReader()
      fileReader.onloadend = () => {
        this._decodeAndInitialize(fileReader.result)
        .then(() => {
          resolve()
        })
      }
      fileReader.readAsArrayBuffer(source)
    })
  }
  async _decodeAndInitialize(buffer: ArrayBuffer): Promise<any> {
    this.pause() // in case we're reloading
    this.source = null
    let decodedData = await this.audioContext.decodeAudioData(buffer)
    this.currentTime = 0
    this.buffer = decodedData
    this.sampleRate = decodedData.sampleRate
    this.frames = decodedData.length
    this.channels = decodedData.numberOfChannels
    this.duration = decodedData.duration
    let buffLen = this.sampleRate * (this.updateRateMs / 1000)
    this.scriptBufferLength = this._pow2floor(buffLen)
    this.updateInterval = this.scriptBufferLength / this.sampleRate
  }

  _pow2floor(v){
    v++
    var p = 1
    while (v >>= 1) {p <<= 1}
    return p
  }
  play (startPos: number = 0) {
    this.currentTime = startPos
    this.startOffset = this.currentTime // stash this
    this.source = this.audioContext.createBufferSource()
    this.source.buffer = this.buffer
    this.source.connect(this.audioContext.destination)
    this.ended = false
    this.source.onended = () => {
      this.playing = false
      this.debug('ended')
      this.ended = true
      this.progressSubject.next(-1)
    }
    this.source.start(this.audioContext.currentTime, this.currentTime)
    this.startPlay = new Date()
    this.playing = true
    this.startProgress()
  }
  playMs(startPos: number = 0) {
    this.play(startPos/1000)
  }
  startProgress() {
    if (this.pinterval) {
      return
    }
    this.pinterval = setInterval(() => {
      if (!this.playing || this.ended) {
        clearInterval(this.pinterval)
        this.pinterval = null
      } else {
        let now = new Date()
        let elapsed = (now.valueOf() - this.startPlay.valueOf() ) / 1000
        this.currentTime = this.startOffset + elapsed
        this.progressSubject.next(this.currentTime)
      }
    }, 100)
  }

  pause (): void {
    if (this.playing) {
      this.playing = false
      this.source.onended = null // will stop onended event firing as above
      this.source.stop()
    }
  }
  isPlaying () {
    return this.playing
  }
  hasEnded () {
    return this.ended
  }
  pos () {
    return this.currentTime
  }
  setPos (position) {
    this.currentTime = position
  }
  // observer emits -1 for media ended
  observeProgress(): Subject<number> {
    return this.progressSubject
  }

  playBuffer(audioBuf: Float32Array, sampleRate: number): void {
    var newSource = this.audioContext.createBufferSource()
    var newBuffer = this.audioContext.createBuffer(1, audioBuf.length, sampleRate)
    newBuffer.getChannelData(0).set(audioBuf)
    newSource.buffer = newBuffer
    newSource.connect(this.audioContext.destination)
    newSource.start()
  }

  destroy() {
    this.pause()
  }

}
