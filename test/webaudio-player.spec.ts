import { WebAudioPlayer } from "../src/webaudio-player";
import {expect} from 'chai';
import * as sinon from 'sinon';

import { Observable } from 'rxjs/Observable'
import 'rxjs/add/operator/take'

describe('webaudio-player', () => {
    // simple unit test
    let player: WebAudioPlayer
    it('creates a new instance', () => {
      player = new WebAudioPlayer({debug: true})
    })
})

function delayms(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(function() {
      resolve()
    }, ms)
  })
}
