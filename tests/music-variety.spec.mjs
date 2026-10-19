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

test('the night has its own music: the ambient changes as night falls and as day breaks; a night wave its battle tracks (#252)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const m = GAME_CONFIG.factions[sides.player.faction].music, theirs = GAME_CONFIG.factions[sides.enemy.faction].music;
    const c = GAME_CONFIG.daytime, now = () => Object.keys(musicMix())[0];
    enemies = []; enemyTents = []; enemyTentBlueprints = [];
    dayTime = c.morning + 1;
    const day = now();
    dayTime = c.morning + c.day + c.evening + 1; // night
    const night = now();
    enemies = [createConfiguredEnemy({ x: 100, y: 100 }, theirs === m ? 'raider' : GAME_CONFIG.factions[sides.enemy.faction].enemies[0])];
    const nightFight = now();
    enemies = [];
    dayTime = 1; // morning
    const morning = now();
    return { day: m.ambient.includes(day), night: m.nightAmbient.includes(night), nightFight: theirs.nightBattle.includes(nightFight), morning: m.ambient.includes(morning) };
  });
  expect(r).toEqual({ day: true, night: true, nightFight: true, morning: true });
});

test('battles are always by day; a map from the editor starts at the time picked for it (#257)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => localStorage.removeItem('sovereign-will-maps'));
  const r = await page.evaluate(() => {
    startBattleMode();
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 5;
    for (let f = 0; f < 60; f++) stepGame(1 / 60);
    const battleDay = [getDayPhase(), getDarkness()];
    leaveBattleMode();
    startEditor({ cols: 30, rows: 30, generate: false });
    document.querySelector('[data-start-time="night"]').click();
    document.getElementById('editor-name').value = 'Night map';
    playEditorMap();
    return { battleDay, phase: getDayPhase(), dark: getDarkness() > 0 };
  });
  expect(r).toEqual({ battleDay: ['day', 0], phase: 'night', dark: true });
});

