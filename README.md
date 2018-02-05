# Aikumic

A microphone service.

### project features
 - Web Audio microphone 
 - Stores raw PCM audio to indexeddb to minimize RAM usage (with service worker)
 - Records segments to support undo operations
 - Segments are resampled to given supplied sample rate
 - Supports wav export of segments or entire recording (all segments)
 - simple fade in/out to minimize start stop clicking
 - microphone recording time observable (decoupled from script processor node)
 - playback features

## developer documentation
how to build and test:
 - clone the repository
 - in the cloned folder, run `npm install`
 - run `npm test` to build and test the code in both nodejs and browser

how to debug (browser):
 - run `npm start` to run a development server
 - open `http://localhost:8080/webtest.bundle` to run live tests that will update while you change the source code

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
