import { Microphone } from "../src/microphone";
import {expect} from 'chai';
import * as sinon from 'sinon';

import { Observable } from 'rxjs/Observable'
import 'rxjs/add/operator/take'

describe('microphone', () => {
    // simple unit test
    let mic: Microphone
    it('connects as promised', () => {
      mic = new Microphone({debug: true})
      return expect(mic.connect()).to.eventually.equal(undefined);
    })

    it('can start recording', () => {
      expect(mic.record()).to.equal(undefined)
      expect(mic.isRecording()).to.equal(true)
    })

    it('should emit recording progress', (done) => {
      let rcv: number
      mic.observeProgress().take(1).subscribe(
          data => rcv = data,
          error => console.error(error),
          () => {
            if (typeof rcv !== 'number') {
              return done(new Error("Failed match"))
            } else {
              return done()
            }
          }  
        )
    })

    it('can pause',  async function() {
      this.timeout(3000)
      await delayms(1500)
      await mic.pause()
      expect(mic.isRecording()).to.equal(false)
      expect(mic.canRecord()).to.equal(true)
    })

    it('can resume', async () => {
      while (!mic.resume()) {
        console.log('waiting')
        await delayms(10)
      }
    })

    it('can stop', async function() {
      let rs = await mic.stop()
      expect(mic.isRecording()).to.be.false
      expect(mic.hasRecordedData()).to.be.true
      expect(rs.frames).to.exist
      expect(rs.frames).to.be.above(0)
      expect(rs.offset).to.exist
      expect(rs.ms).to.exist
      expect(rs.ms).to.be.above(0)
    })

    it('can be destroyed', () => {
      expect(mic.destroy()).to.equal(undefined)
    })

    // mic = new microphone({debug: true})
    it('can record segments', async function() {
      this.timeout(3000)
      mic = new Microphone({debug: true})
      await mic.connect()
      mic.record()
      await delayms(500)
      await mic.stop()
      mic.record()
      await delayms(1250)
      await mic.stop()
      expect(mic.getSegmentCount()).to.equal(2)
    })

    it('can provide getLastLength()', () => {
      let ll = mic.getLastLength()
      expect(ll).to.exist
      expect(ll.offset).to.be.a('number')
      expect(ll.frames).to.be.a('number')
      expect(ll.ms).to.be.a('number')
    })

    it('can provide getTotalLength()', () => {
      let ll = mic.getTotalLength()
      expect(ll).to.exist
      expect(ll.frames).to.be.a('number')
      expect(ll.ms).to.be.a('number')
    })

    it('can play a segment', async function() {
      this.timeout(3000)
      await mic.playSegment(1)
      expect(mic.isPlaying()).to.equal(false)
     })

    it('can play all segments', async function() {
      this.timeout(3000)
      await mic.playAll()
      expect(mic.isPlaying()).to.equal(false)
    })

    it('can clear', function() {
      mic.clear()
      expect(mic.getSegmentCount()).to.equal(0)
      mic.destroy()
    })

})

function delayms(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(function() {
      resolve()
    }, ms)
  })
}
