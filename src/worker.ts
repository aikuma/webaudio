import { Observable } from 'rxjs/Observable'

// worker is a tweaked version of the one from RecorderJS - assumes mono, removed wav writing
export function aikumicWorker() {
  let recLength: number = 0, recBuffers: Float32Array[] = [], tempLength: number = 0,
      sampleRate: number, db: IDBDatabase, experimentalStorage: boolean = false
  this.onmessage = function (e) {
    // worker commands
    switch (e.data.command) {
      case 'init':
        init(e.data.config)
        break
      case 'record':
        record(e.data.buffer, e.data.type)
        break
      case 'getBuffer':
        getBuffer()
        break
      case 'streamBuffer':
        sendBuffers()
        break
      case 'clear':
        clear()
        break
    }
  }
  function init(config: {sampleRate: number, experimentalStorage: boolean}) {
    sampleRate = config.sampleRate
    experimentalStorage = config.experimentalStorage ? true: false
    if (experimentalStorage) {
      db_open()
      .then((d) => {
        db = d
        return clear()
      })
      .then(() => {
        this.postMessage({command: 'ready', data: null})
      })
    } else {
      this.postMessage({command: 'ready', data: null})
    }
  }
  function record(inputBuffer: Float32Array, dtype: number) {
    if (dtype === 1) {
      //console.log('fade in')
      fade('in', inputBuffer)
    } else if (dtype === 2) {
      //console.log('fade out')
      fade('out', inputBuffer)
    }
    recBuffers.push(inputBuffer)
    recLength += inputBuffer.length
    tempLength += inputBuffer.length
    if (experimentalStorage) {
      if (recBuffers.length > 15) {
        let mb = mergeBuffers(recBuffers, tempLength)
        tempLength = 0
        recBuffers = [] // zero this out because it might take a while to persist to disk
        db_add('rawdata', mb)
      }
    }
  }

  function fade(type: string, fa: Float32Array) {
    if (type === 'in') {
      for (let i = 0; i < 2000; ++i) {
        fa[i] = (i / 2000) * fa[i]
      }
    } else if (type === 'out') {
      for (let i = 0; i < 2000; ++i) {
        fa[-i] = (i / 2000) * fa[-i]
      }
    }
  }

  function getBuffer() {
    let buffer = mergeBuffers(recBuffers, recLength)
    this.postMessage({command: 'getBuffer', data: buffer})
  }

  function sendBuffers() {
    if (experimentalStorage) {
      let objectStore = db.transaction("rawdata").objectStore("rawdata")
      let tdatalen: number = 0
      let self = this
      objectStore.openCursor().onsuccess = function(event) {
        let cursor = this.result
        if (cursor) {
          let fdata: Float32Array = cursor.value.data
          tdatalen += fdata.length
          self.postMessage({command: 'streamBuffer', data: fdata, remaining: recLength - tdatalen})
          cursor.continue()
        }
        else {
          //console.log('tempLength', tempLength)
          if (tempLength > 0) {
            let tdata = mergeBuffers(recBuffers, tempLength)
            self.postMessage({command: 'streamBuffer', data: tdata, remaining: 0})
          }
        }
      }
    } else {
      let buffer = mergeBuffers(recBuffers, recLength)
      this.postMessage({command: 'streamBuffer', data: buffer, remaining: 0})
    }
  }
  
  function clear(): Promise<any> {
    recLength = 0
    tempLength = 0
    recBuffers = []
    if (experimentalStorage) {
      return db_clear('rawdata')
    } else {
      return Promise.resolve()
    }
  }
  function mergeBuffers(recBuffers: Float32Array[], recLength: number): Float32Array {
    let result = new Float32Array(recLength)
    let offset = 0
    for (let i = 0; i < recBuffers.length; i++) {
      result.set(recBuffers[i], offset)
      offset += recBuffers[i].length
    }
    return result
  }

  function db_open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let req = indexedDB.open('aikumic', 1)
      req.onsuccess = function() {
        //console.log('db open success')
        resolve(this.result)
      }
      req.onerror = function(evt: ErrorEvent) {
        //console.log('db open fail', evt.target)
        reject(evt.target)
      }
      req.onupgradeneeded = function(ev: IDBVersionChangeEvent) {
        //console.log('upgrade needed')
        let d = this.result
        let oStore1 = d.createObjectStore("rawdata", { autoIncrement : true })
        Promise.all([
          db_req(oStore1.transaction)
        ]).then(() => {
          resolve(d)
        })
      }
    })
  }
  function db_add(store: string, fdata: Float32Array): Promise<any> {
    let objectStore = db.transaction([store], "readwrite").objectStore(store)
    return db_req(objectStore.put({data: fdata}))
  }
  function db_clear(store: string): Promise<any> {
    let objectStore = db.transaction([store], "readwrite").objectStore(store)
    return db_req(objectStore.clear())
  }
  function db_req(req): Promise<any> {
    return new Promise((resolve, reject) => {
      req.onsuccess = function() {
        resolve(this.result)
      }
      req.onerror = function(evt: ErrorEvent) {
        reject(evt.target)
      }
    })
  }
}

