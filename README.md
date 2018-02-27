# Aikuma Web Audio javascript library

Web Audio-based library created for use with language apps/sites.

 - Microphone library
 - Web Audio player library
 - ES6 module with Typescript definitions
 - Repo has client testing framework (work in progress)

## Microphone
 - Web Audio microphone 
 - Stores raw PCM audio to indexeddb to minimize RAM usage (with service worker)
 - Records audio segments to support undo operations
 - Segments are resampled to given supplied sample rate
 - Supports wav export of segments or entire recording (all segments)
 - Simple fade in/out to avoid start/stop clicking
 - Microphone recording time observable (decoupled from script processor node)
 - Exports as Wav Blob
 - Basic playback

## Web Audio Player
 - Web Audio player service
 - Intended for large files and random playback seek position
 - Playback progress time observable (decoupled from script processor node)

## Developer documentation
how to build and test:
 - clone the repository
 - in the cloned folder, run `npm install`
 - run `npm test` to build and test the code in both nodejs and browser

how to debug (browser):
 - run `npm start` to run a development server
 - open `http://localhost:8080/webtest.bundle` to run live tests that will update while you change the source code

Based on https://github.com/wix/typescript-boilerplate

## API example

```
import { Microphone } from 'aikumic'
const mic = new Microphone({debug: true, resampleRate: 16000})
mic.observeProgress().subscribe((time) => {
  console.log('time:',time)
})
mic.record()
...
mic.stop().then(() => {
  wavblob = mic.exportAllWav()
})
```

