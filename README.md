# Aikuma Web Audio javascript library

Web Audio-based library created for use with language apps/sites.

 - Microphone library
 - Web Audio player library
 - ES6 module with Typescript definitions
 - Repo has client testing framework (work in progress)

## Microphone
 - Web Audio microphone 
 - Records audio segments to support undo operations
 - Segments are resampled to given supplied sample rate
 - Supports wav export of segments or entire recording (all segments)
 - Simple fade in/out to avoid start/stop clicking
 - Microphone recording time observable (decoupled from script processor node)
 - Exports as Wav Blob
 - Basic playback
 - Experimental: Stores raw PCM audio to indexeddb to minimize RAM usage (with service worker)

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

## Microphone documentation

### API example

```
import { Microphone } from '@aikuma/webaudio'
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

### Constructor

`const mic = new Microphone(config)`

Config is optional. Valid config properties are bufferLen (number) defaulting to 8192, numChannels (number) defaulting to 1, and sampleRate (number) defaulting to 16,000, debug (boolean) defaulting to false and experimentalStorage (boolean) defaulting to false.

### Methods

`connect()`

Requests microphone access via getUserMedia() and creates a MediaStreamSourceNode. Throws an error if either operation fails. `connect()` must be performed before other methods.

`record()`

Begins recording audio. A service worker will write raw pcm audio to persistent storage. This data will be the native sample rate of the audio context, usually 48,000.

record() will throw an error if the service is not ready to record (you should check `canRecord()` first), or there is no source node (usually because `connect()` has not been called yet).

`destroy()`

Stops the audio stream and completes the progress observable.

`getElapsed()`

Returns a number in milliseconds which is calculated from the samples in the final buffers plus a temporary timer for temporary buffers.

`isRecording()`

Returns a boolean representing current recording state.

`isPlaying()`

Returns a boolean that is true if the built-in player is currently playing.

`hasRecordedData()`

Returns a boolean which is true if there is some recorded data.

`observeProgress()`

Returns an RXJS Observable which emits record progress in milliseconds as recording progresses. 

`pause()`

Returns a Promise which completes if not currently recording, or otherwise when the recorder is finished recording. This is an async operation because buffers need to be emptied.

`canRecord()`

Returns a boolean which is true if the recorder can record. It will be false if, for example, the recorder is currently waiting to stop, e.g. following `pause()`.

`resume()`

This continues recording of the *same segment*.

`stop()`

Stop recording the current segment. Returns a Promise that resolves when the operation is complete. This is asynchronous because buffers needed to be cleared and because the raw samples will be fetched from the service worker and resampled. The list of recording segments will have this resampled segment appended.

`getLastLength()`

Returns information on the last recorded segment. The object has offset, frames and ms properties which are all numbers. Offset represents the offset time from the beginning of the first segment, in milliseconds. frames and ms represent duration in absolute frames (samples) and milliseconds respectively.

`getTotalLength()`

Returns an object with frames and ms properties. frames and ms represent duration of all segments in absolute frames (samples) and milliseconds respectively.

`getSegmentCount()`

Returns the number if recorded segments.

`clear()`

Resets the microphone service. Recording is stopped. All temporary buffers and segments are cleared.

`playSegment(segment: number)`

Plays the given segment. Throws an error if the segment is out of range. Returns a Promise that resolves when the playback is complete.

`exportSegmentWav(segment: number)`

A synchronous operation that returns an audio Wav Blob of the given recorded segment. Throws an error if the segment is out of range.

`exportAllWav()`

A synchronous operation that returns a Wav Blob of all of the segments concatenated.

## To Do

- Add web audio player docs
- Add tests for web audio player
