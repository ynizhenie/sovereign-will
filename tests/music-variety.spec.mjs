import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The music varies as it plays (#252)
test('a track goes A A B A, its key moves, some phrases drop parts; the ambient changes after a while (#252)', async ({ page }) => {
  await openGame(page);
  await page.mouse.click(5, 5);
  const r = await page.evaluate(() => {
    const track = GAME_CONFIG.music.humans_harvest;
    // what plays: the pitches scheduled for each phrase's first eighth, recorded as the oscillators are set
    const sink = audio.ctx.createGain(); sink.gain.value = 0; sink.connect(audio.ctx.destination);
    const phraseLen = 8 * track.chords.length;
    const firstNotes = [];
    const realOsc = audio.ctx.createOscillator.bind(audio.ctx);
    audio.ctx.createOscillator = () => { const o = realOsc(); const set = o.frequency.setValueAtTime.bind(o.frequency); o.frequency.setValueAtTime = (v, t) => { firstNotes.push(Math.round(v)); return set(v, t); }; return o; };
    const bars = [];
    for (let phrase = 0; phrase < 12; phrase++) {
      firstNotes.length = 0;
      playTrack(track, sink, audio.ctx.currentTime + 0.1, phrase * phraseLen, 0.5);
      bars.push(firstNotes.slice());
    }
    audio.ctx.createOscillator = realOsc;
    // ambient after three minutes: another
    musicPick.ambient = 'humans_meadow'; musicPick.ambientFaction = 'humans'; musicPick.fighting = false; musicPick.ambientSince = performance.now() / 1000 - 200;
    gameStarted = true; gameMode = 'endless'; enemies = []; enemyTents = []; enemyTentBlueprints = [];
    const next = Object.keys(musicMix())[0];
    gameStarted = false;
    return { bPhrase: bars[2].join() !== bars[0].join(), aAgain: bars[3].join() === bars[0].join() || bars[3].length !== bars[0].length, keyMoved: bars[8].join() !== bars[0].join(), next };
  });
  expect(r.bPhrase).toBe(true);
  expect(r.keyMoved).toBe(true);
  expect(r.next).not.toBe('humans_meadow');
  expect(r.next.startsWith('humans_')).toBe(true);
});
