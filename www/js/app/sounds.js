// Sounds and music, all made with Web Audio: no sound files. playSound(name, at) for what happens in
// the game (at: where in the world, for its loudness and left-right; none for the interface); updateMusic()
// every frame for the music: calm in the main menu, one of the colony faction's ambients in Endless that
// turns into one of the attacking faction's battle tracks while a wave is on (until the last enemy and enemy
// tent are gone; GAME_CONFIG.music, #198). Sound and music can each be turned
// off in the Settings. The audio starts with the first tap or key (browsers allow it only then).

import { game } from '../engine/world/index.js';
import { audio, camera, canvas, getViewScale, midi, noise, screenPixelRatio, startAudio, tone } from '../engine/platform/index.js';
import { isDefeated } from '../modes/endless/index.js';
import { battle } from '../modes/battle/index.js';
import { GAME_CONFIG } from '../content/configs/index.js';
import { getEnemyFaction, getPlayerFaction } from '../domains/factions/index.js';
import { isNight } from '../domains/world/index.js';

export const SOUND = {
  sfxVolume: 0.55, musicVolume: 0.3,
  menuWorldShare: 0.35,  // the world behind the main menu is quieter
  fadeSeconds: 1.2,      // the music's crossfades: a time constant, so about 4x this to the end
  // a sound plays at most once in this many seconds (the same name), so crowds don't drown everything
  minGap: { built: 0.3, hire: 0.2, horn: 1.5, defeat: 2, tentUp: 0.4, click: 0.03, swing: 0.07, hit: 0.06, bow: 0.08, arrowHit: 0.06, chop: 0.09, mine: 0.09, rustle: 0.15,
    hammer: 0.12, boar: 0.25, hurt: 0.12, death: 0.12, deliver: 0.15, error: 0.3,
    eat: 0.2, sizzle: 0.3, dig: 0.2, splash: 0.2, drip: 0.1, catch: 0.3, heal: 0.3, raise: 0.3, collapse: 0.2, smelt: 0.3, ignite: 0.2,
    trapSnap: 0.2, craftDone: 0.3, cageLock: 0.3, butcher: 0.25, pickup: 0.12, portal: 0.5, dawn: 5, owl: 5, snore: 0.8, alarm: 2, voice: 0.12, thunder: 2, bark: 1.2, ghost: 0.4 }
};

// ---- Sound effects

export const SOUNDS = {
  click: (o, t) => tone(o, t, { type: 'triangle', freq: 1400, to: 900, dur: 0.04, gain: 0.05 }),
  swing: (o, t) => noise(o, t, { dur: 0.13, gain: 1.2, freq: 700, to: 2600, q: 1.5, attack: 0.03 }),
  hit: (o, t) => { noise(o, t, { dur: 0.07, gain: 0.45, type: 'lowpass', freq: 1400 }); tone(o, t, { freq: 150, to: 55, dur: 0.12, gain: 0.5 }); },
  bow: (o, t) => { tone(o, t, { type: 'triangle', freq: 240, to: 170, dur: 0.2, gain: 0.35, attack: 0.002 }); noise(o, t + 0.01, { dur: 0.08, gain: 0.12, type: 'highpass', freq: 3000 }); },
  arrowHit: (o, t) => noise(o, t, { dur: 0.05, gain: 0.3, freq: 2400, q: 4 }),
  chop: (o, t) => { tone(o, t, { freq: 320, to: 120, dur: 0.09, gain: 0.4 }); noise(o, t, { dur: 0.07, gain: 0.3, freq: 750, q: 2 }); },
  mine: (o, t) => { tone(o, t, { type: 'triangle', freq: 1850, dur: 0.14, gain: 0.16 }); tone(o, t, { type: 'triangle', freq: 2770, dur: 0.09, gain: 0.08 }); noise(o, t, { dur: 0.03, gain: 0.2, type: 'highpass', freq: 2200 }); },
  rustle: (o, t) => noise(o, t, { dur: 0.2, gain: 0.14, type: 'highpass', freq: 2600, attack: 0.05 }),
  hammer: (o, t) => { tone(o, t, { freq: 540, to: 300, dur: 0.06, gain: 0.25 }); noise(o, t, { dur: 0.03, gain: 0.15, freq: 1600 }); },
  built: (o, t) => { tone(o, t, { type: 'triangle', freq: 523, dur: 0.35, gain: 0.2 }); tone(o, t + 0.1, { type: 'triangle', freq: 784, dur: 0.45, gain: 0.2 }); },
  boar: (o, t) => { tone(o, t, { type: 'sawtooth', freq: 650, to: 1150, dur: 0.12, gain: 0.25, filter: 2200 }); tone(o, t + 0.11, { type: 'sawtooth', freq: 1100, to: 520, dur: 0.16, gain: 0.2, filter: 2200 }); },
  hurt: (o, t) => tone(o, t, { type: 'sawtooth', freq: 230, to: 140, dur: 0.16, gain: 0.18, filter: 900 }),
  death: (o, t, enemy) => enemy
    ? tone(o, t, { type: 'sawtooth', freq: 170, to: 60, dur: 0.45, gain: 0.22, filter: 650 })
    : tone(o, t, { type: 'triangle', freq: 392, to: 180, dur: 0.6, gain: 0.25 }),
  deliver: (o, t) => { tone(o, t, { freq: 660, to: 880, dur: 0.09, gain: 0.14 }); tone(o, t + 0.07, { freq: 990, dur: 0.12, gain: 0.1 }); },
  hire: (o, t) => [392, 494, 587].forEach((f, i) => tone(o, t + i * 0.07, { type: 'triangle', freq: f, dur: 0.22, gain: 0.18 })),
  horn: (o, t) => [98, 147].forEach(f => tone(o, t, { type: 'sawtooth', freq: f, dur: 1.6, gain: 0.16, attack: 0.35, filter: 700 })),
  error: (o, t) => { tone(o, t, { type: 'square', freq: 180, dur: 0.1, gain: 0.06 }); tone(o, t + 0.12, { type: 'square', freq: 150, dur: 0.12, gain: 0.06 }); },
  defeat: (o, t) => [392, 349, 311, 262].forEach((f, i) => tone(o, t + i * 0.32, { type: 'triangle', freq: f, dur: 0.5, gain: 0.22 })),
  // the colony's work and life (#198)
  eat: (o, t) => [0, 0.14].forEach(d => noise(o, t + d, { dur: 0.07, gain: 0.18, type: 'lowpass', freq: 900 })),
  sizzle: (o, t) => noise(o, t, { dur: 0.5, gain: 0.08, type: 'highpass', freq: 2500, attack: 0.05 }),
  dig: (o, t) => { noise(o, t, { dur: 0.12, gain: 0.3, type: 'lowpass', freq: 600 }); tone(o, t, { freq: 90, to: 60, dur: 0.12, gain: 0.2 }); },
  splash: (o, t) => noise(o, t, { dur: 0.25, gain: 0.25, freq: 1200, to: 400, q: 1.2 }),
  drip: (o, t) => tone(o, t, { freq: 1500, to: 900, dur: 0.08, gain: 0.05 }),
  catch: (o, t) => { noise(o, t, { dur: 0.2, gain: 0.2, freq: 1200, to: 500, q: 1.2 }); tone(o, t + 0.12, { type: 'triangle', freq: 880, to: 1320, dur: 0.15, gain: 0.08 }); },
  heal: (o, t) => { tone(o, t, { freq: 660, to: 990, dur: 0.25, gain: 0.06 }); tone(o, t + 0.1, { freq: 1320, dur: 0.2, gain: 0.04 }); },
  raise: (o, t) => { tone(o, t, { type: 'sawtooth', freq: 80, to: 160, dur: 0.9, gain: 0.15, attack: 0.2, filter: 400 }); noise(o, t, { dur: 0.8, gain: 0.06, freq: 600, to: 1800, q: 5, attack: 0.3 }); },
  // (#308) thunder: a crack, then a long low rumble
  thunder: (o, t) => { noise(o, t, { dur: 0.25, gain: 0.5, type: 'highpass', freq: 1500 }); noise(o, t + 0.05, { dur: 2.6, gain: 0.55, type: 'lowpass', freq: 220, to: 60, attack: 0.15 }); tone(o, t + 0.1, { freq: 45, to: 30, dur: 2.2, gain: 0.25 }); },
  collapse: (o, t) => { noise(o, t, { dur: 0.6, gain: 0.5, type: 'lowpass', freq: 500 }); tone(o, t, { freq: 70, to: 35, dur: 0.5, gain: 0.3 }); },
  smelt: (o, t) => { tone(o, t, { type: 'triangle', freq: 1200, dur: 0.25, gain: 0.08 }); tone(o, t, { type: 'triangle', freq: 1810, dur: 0.15, gain: 0.05 }); noise(o, t, { dur: 0.3, gain: 0.06, type: 'highpass', freq: 2500 }); },
  tentUp: (o, t) => tone(o, t, { type: 'sawtooth', freq: 110, dur: 0.6, gain: 0.12, attack: 0.1, filter: 500 }),
  ignite: (o, t) => noise(o, t, { dur: 0.3, gain: 0.2, freq: 1500, to: 3000, q: 1, attack: 0.02 }),
  // (#252) more of what the colony does
  trapSnap: (o, t) => { noise(o, t, { dur: 0.05, gain: 0.5, type: 'highpass', freq: 1800 }); tone(o, t, { type: 'square', freq: 900, to: 300, dur: 0.08, gain: 0.12 }); },
  craftDone: (o, t) => { tone(o, t, { type: 'triangle', freq: 880, dur: 0.15, gain: 0.12 }); tone(o, t + 0.09, { type: 'triangle', freq: 1175, dur: 0.25, gain: 0.12 }); },
  cageLock: (o, t) => { tone(o, t, { type: 'square', freq: 400, to: 250, dur: 0.06, gain: 0.1 }); noise(o, t + 0.06, { dur: 0.08, gain: 0.25, freq: 2200, q: 3 }); },
  butcher: (o, t) => { noise(o, t, { dur: 0.12, gain: 0.3, type: 'lowpass', freq: 1100 }); tone(o, t, { freq: 200, to: 90, dur: 0.1, gain: 0.15 }); },
  pickup: (o, t) => tone(o, t, { type: 'triangle', freq: 600, to: 900, dur: 0.07, gain: 0.08 }),
  portal: (o, t) => { noise(o, t, { dur: 0.7, gain: 0.25, freq: 300, to: 1600, q: 2, attack: 0.2 }); tone(o, t, { type: 'sawtooth', freq: 60, to: 110, dur: 0.7, gain: 0.12, filter: 400 }); },
  // (#306) the morning: a cock's crow, birds answering it, a soft low swell under them
  dawn: (o, t) => {
    tone(o, t, { type: 'sawtooth', freq: 560, to: 780, dur: 0.16, gain: 0.09, filter: 2400, attack: 0.02 });
    tone(o, t + 0.16, { type: 'sawtooth', freq: 780, to: 600, dur: 0.34, gain: 0.09, filter: 2400, attack: 0.02 });
    [[880, 0.55], [1180, 0.66], [1320, 0.8]].forEach(([f, at]) => tone(o, t + at, { type: 'triangle', freq: f, to: f * 1.15, dur: 0.2, gain: 0.09 }));
    tone(o, t + 0.3, { type: 'sine', freq: 110, dur: 1.4, gain: 0.1, attack: 0.5 });
  },
  // (#306) an owl at nightfall: two hoots, low and clear
  owl: (o, t) => [0, 0.5].forEach((d, i) => { tone(o, t + d, { type: 'sine', freq: i ? 390 : 430, to: 335, dur: 0.45, gain: 0.16, attack: 0.06 }); noise(o, t + d, { dur: 0.4, gain: 0.03, type: 'lowpass', freq: 600, attack: 0.08 }); }),
  // (#306) a sleeper's breath: a low swell through a wide band, in and out
  snore: (o, t) => { noise(o, t, { dur: 1.0, gain: 0.22, type: 'lowpass', freq: 320, to: 150, q: 0.7, attack: 0.35 }); tone(o, t + 0.05, { freq: 78, to: 60, dur: 0.8, gain: 0.1, attack: 0.25 }); },
  alarm: (o, t) => [0, 0.25, 0.5].forEach(d => tone(o, t + d, { type: 'triangle', freq: 1046, dur: 0.18, gain: 0.12 })),
  // (#314) a dog's bark: two short gruff yelps; a ghost going into an enemy: a rising whoosh and a cold moan
  bark: (o, t) => [0, 0.16].forEach(d => { tone(o, t + d, { type: 'sawtooth', freq: 420, to: 260, dur: 0.09, gain: 0.2, filter: 1400, q: 3 }); noise(o, t + d, { dur: 0.06, gain: 0.08, type: 'bandpass', freq: 900 }); }),
  ghost: (o, t) => { noise(o, t, { dur: 0.6, gain: 0.18, type: 'bandpass', freq: 500, to: 1800, q: 2, attack: 0.2 }); tone(o, t + 0.1, { type: 'sine', freq: 300, to: 180, dur: 0.7, gain: 0.12, attack: 0.15 }); },
  // a voice (#252): syllables, each a buzz through a vowel (a resonant filter that moves), a breath between
  // some; pitched by who speaks, a growl under it for the rough ones (settlers.voices.js)
  voice: (o, t, pitch = 210, syllables = 3, rough = false) => {
    let at = t;
    for (let i = 0; i < syllables; i++) {
      const f = pitch * (0.9 + Math.random() * 0.3), len = 0.07 + Math.random() * 0.06;
      const vowel = [700, 1100, 500, 900, 350][Math.floor(Math.random() * 5)];
      tone(o, at, { type: 'sawtooth', freq: f, to: f * (0.85 + Math.random() * 0.3), dur: len, gain: 0.07, attack: 0.01, filter: vowel, q: 7 });
      if (Math.random() < 0.4) noise(o, at, { dur: 0.025, gain: 0.05, type: 'highpass', freq: 3000 });
      if (rough) tone(o, at, { type: 'sawtooth', freq: f / 2, dur: len, gain: 0.03, filter: 300 });
      at += len + 0.02 + Math.random() * 0.03;
    }
  }
};

// How loud a sound at a world point is, and where left-right: null when it's well off the screen
export function soundPlace(at) {
  if (!at || typeof camera === 'undefined') return { volume: 1, pan: 0 };
  const k = getViewScale() / screenPixelRatio;
  const halfW = Math.max(1, canvas.clientWidth / 2), halfH = Math.max(1, canvas.clientHeight / 2);
  const dx = (at.x - camera.x) * k / halfW, dy = (at.y - camera.y) * k / halfH;
  const far = Math.max(Math.abs(dx), Math.abs(dy));
  if (far > 1.3) return null;
  return { volume: Math.max(0.15, 1 - 0.55 * far), pan: Math.max(-0.8, Math.min(0.8, dx * 0.7)) };
}

export function playSound(name, at, ...args) {
  if (!audio.ctx || audio.ctx.state !== 'running' || !audio.soundOn || !SOUNDS[name]) return;
  const t = audio.ctx.currentTime;
  if (t - (audio.last[name] ?? -1) < (SOUND.minGap[name] || 0)) return;
  const place = soundPlace(at);
  if (!place) return;
  audio.last[name] = t;
  const out = audio.ctx.createGain();
  out.gain.value = place.volume * (game.gameMode === 'menu' && at ? SOUND.menuWorldShare : 1);
  /** @type {AudioNode} */
  let node = out;
  if (audio.ctx.createStereoPanner) {
    const pan = audio.ctx.createStereoPanner();
    pan.pan.value = place.pan;
    out.connect(pan); node = pan;
  }
  node.connect(/** @type {GainNode} */ (audio.sfx));
  SOUNDS[name](out, t, ...args);
  setTimeout(() => node.disconnect(), 3000);
}

// Steady work makes its sound on a beat of its own per unit (chopping, mining, building...)
export function playWorkSound(unit, name, everySeconds = 0.5) {
  const now = performance.now() / 1000;
  if (now - (unit.lastWorkSound || 0) < everySeconds) return;
  unit.lastWorkSound = now;
  playSound(name, unit);
}

export const MUSIC_STYLES = {
  // calm, for the main menu: soft chords, a slow bass, a few plucked notes
  menu: {
    bpm: 72, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]], scale: [72, 74, 76, 79, 81, 84],
    step(o, t, step, beat) {
      const bar = Math.floor(step / 8) % 4, chord = this.chords[bar];
      if (step % 8 === 0) {
        chord.forEach(n => tone(o, t, { type: 'sine', freq: midi(n), dur: beat * 4.2, gain: 0.11, attack: 0.9 }));
        tone(o, t, { type: 'sine', freq: midi(chord[0] - 24), dur: beat * 4, gain: 0.16, attack: 0.3 });
      }
      if (Math.random() < 0.22) tone(o, t, { type: 'triangle', freq: midi(this.scale[Math.floor(Math.random() * this.scale.length)]), dur: 1.4, gain: 0.1, attack: 0.01 });
    }
  },
  // every faction's tracks (GAME_CONFIG.music), each played by playTrack
  ...Object.fromEntries(Object.entries(GAME_CONFIG.music).map(([id, track]) => [id, { bpm: track.bpm, step: (o, t, step, beat) => playTrack(track, o, t, step, beat) }]))
};

const hits = pattern => pattern || '........';

// A small seeded random, so a phrase plays the same each time it's worked out (mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// How a phrase of a track plays (#252: the same four bars over and over): its chords (A A B A with a
// chordsB), a key that moves every four phrases, which parts sit out (a quiet phrase now and then, the
// drums out as one starts), and its lead's motif (a scale note or a rest on each eighth, the same all
// through the phrase)
const phraseCache = new WeakMap();
function phraseOf(track, phrase) {
  let cached = phraseCache.get(track);
  if (!cached) { cached = new Map(); phraseCache.set(track, cached); }
  if (cached.has(phrase)) return cached.get(phrase);
  const rand = seeded(phrase * 7919 + track.bpm * 131 + track.chords[0][0]);
  const chords = track.chordsB && phrase % 4 === 2 ? track.chordsB : track.chords;
  const shift = [0, 0, 2, -3, 5, 0, -2, 3][Math.floor(phrase / 4) % 8];
  const breakdown = phrase % 6 === 5;
  const plays = {
    arp: !breakdown && rand() > 0.2, bass: !breakdown || rand() > 0.6, lead: rand() > 0.25,
    drums: !breakdown && !(phrase % 8 === 0 && phrase > 0)
  };
  const motif = track.lead ? Array.from({ length: 8 }, () => (rand() < track.lead.chance * 3 ? Math.floor(rand() * track.lead.scale.length) : null)) : [];
  const out = { chords, shift, plays, motif };
  cached.set(phrase, out);
  if (cached.size > 64) cached.delete(cached.keys().next().value);
  return out;
}

// One eighth of a track (GAME_CONFIG.music): its pad on the bar, the arp, bass and lead notes, the drums,
// now and then a sound of its world; varied phrase by phrase (phraseOf, #252)
export function playTrack(track, o, t, step, beat) {
  const phrase = Math.floor(step / (8 * track.chords.length));
  const { chords, shift, plays, motif } = phraseOf(track, phrase);
  const eighth = step % 8, bar = Math.floor(step / 8) % chords.length;
  const chord = chords[bar].map(n => n + shift);
  const { pad, extra } = track;
  const arp = plays.arp ? track.arp : null, bass = plays.bass ? track.bass : null, lead = plays.lead ? track.lead : null, drums = plays.drums ? track.drums : null;
  if (pad && eighth === 0) {
    for (const n of chord) {
      const freq = midi(n + (pad.octave || 0));
      tone(o, t, { type: pad.wave, freq, dur: beat * pad.length, gain: pad.gain, attack: pad.attack, filter: pad.filter });
      if (pad.detune) tone(o, t, { type: pad.wave, freq: freq * (1 + pad.detune), dur: beat * pad.length, gain: pad.gain * 0.7, attack: pad.attack, filter: pad.filter });
    }
  }
  if (arp && arp.pattern[eighth] !== null && arp.pattern[eighth] !== undefined) {
    const i = arp.pattern[eighth];
    tone(o, t, { type: arp.wave, freq: midi(chord[i % chord.length] + 12 * Math.floor(i / chord.length) + (arp.octave || 0)), dur: beat * arp.length, gain: arp.gain, filter: arp.filter });
  }
  if (bass) {
    const note = bass.notes ? (bass.notes[eighth] === null ? null : bass.notes[eighth] + shift) : (bass.pattern[eighth] === null ? null : chord[0] + (bass.octave || 0) + bass.pattern[eighth]);
    if (note !== null && note !== undefined) tone(o, t, { type: bass.wave, freq: midi(note), dur: beat * bass.length, gain: bass.gain, filter: bass.filter });
  }
  // its motif, the same through the phrase (now and then a note left out or added)
  if (lead) {
    const i = motif[eighth] !== null && motif[eighth] !== undefined && Math.random() > 0.15 ? motif[eighth] : Math.random() < lead.chance * 0.3 ? Math.floor(Math.random() * lead.scale.length) : null;
    if (i !== null) tone(o, t, { type: lead.wave, freq: midi(lead.scale[i] + shift), dur: lead.length, gain: lead.gain, filter: lead.filter, attack: 0.01 });
  }
  if (drums) {
    const kick = hits(drums.kick)[eighth];
    if (kick !== '.') tone(o, t, { freq: 120, to: 42, dur: 0.28, gain: kick === 'X' ? 0.6 : 0.45 });
    if (hits(drums.snare)[eighth] !== '.') noise(o, t, { dur: 0.13, gain: 0.16, freq: 1800, q: 0.8 });
    if (hits(drums.hat)[eighth] !== '.') noise(o, t, { dur: 0.035, gain: 0.05, type: 'highpass', freq: 7000 });
    if (hits(drums.tom)[eighth] !== '.') tone(o, t, { freq: 190, to: 70, dur: 0.25, gain: 0.3 });
    if (drums.fill && bar === track.chords.length - 1 && eighth >= 5) tone(o, t, { freq: 220 - eighth * 15, to: 80, dur: 0.18, gain: 0.25 });
  }
  if (extra && Math.random() < extra.chance) WORLD_SOUNDS[extra.kind](o, t, chord, beat);
}

// The sounds of a faction's world in its music
export const WORLD_SOUNDS = {
  birds: (o, t) => { const f = 2600 + Math.random() * 900; for (let i = 0; i < 3; i++) tone(o, t + i * 0.09, { freq: f, to: f * 1.25, dur: 0.07, gain: 0.04 }); },
  crickets: (o, t) => { for (let i = 0; i < 4; i++) tone(o, t + i * 0.05, { freq: 4300, dur: 0.03, gain: 0.015 }); },
  toll: (o, t, chord) => { const f = midi(chord[0]); tone(o, t, { freq: f, dur: 3.5, gain: 0.08, attack: 0.005 }); tone(o, t, { freq: f * 2.76, dur: 2, gain: 0.03 }); },
  whispers: (o, t) => noise(o, t, { dur: 1.2, gain: 0.05, freq: 800, to: 2400, q: 6, attack: 0.4 }),
  crackle: (o, t, chord, beat) => { for (let i = 0; i < 4; i++) noise(o, t + Math.random() * beat, { dur: 0.015, gain: 0.08, type: 'highpass', freq: 3000 }); },
  growl: (o, t) => tone(o, t, { type: 'sawtooth', freq: 55, to: 40, dur: 1.5, gain: 0.08, attack: 0.3, filter: 300 }),
  chant: (o, t, chord, beat) => [12, 19].forEach(up => tone(o, t, { type: 'sawtooth', freq: midi(chord[0] + up), dur: beat * 2, gain: 0.03, attack: 0.1, filter: 900, q: 5 })),
  // (#252) drops of rain, a gust of wind
  rain: (o, t, chord, beat) => { for (let i = 0; i < 3; i++) tone(o, t + Math.random() * beat, { freq: 1800 + Math.random() * 1400, to: 900, dur: 0.05, gain: 0.025 }); },
  wind: (o, t) => noise(o, t, { dur: 3, gain: 0.05, freq: 300, to: 900, q: 1.5, attack: 1.2 }),
  // (#252) an owl far off: two soft hoots
  owl: (o, t) => [0, 0.45].forEach(d => tone(o, t + d, { type: 'sine', freq: 420, to: 380, dur: 0.35, gain: 0.04, attack: 0.06 }))
};

// Which tracks play: the colony's ambient (another after each wave) and the attacking faction's battle
// track (one picked as each wave comes)
export const musicPick = { ambient: '', ambientFaction: '', battle: '', fighting: false, ambientSince: 0, night: false };
const AMBIENT_SECONDS = 180; // a new ambient after this long (#252), not one for the whole colony
const pickOne = (list, not = '') => { const choice = list.filter(id => id !== not); return choice[Math.floor(Math.random() * choice.length)] || list[0]; };

// The day's tracks or the night's (#252: the night has its own; only Endless has nights)
const nightMusic = () => game.gameMode === 'endless' && isNight();
const ambientsOf = faction => (nightMusic() && faction.music.nightAmbient) || faction.music.ambient;
const battlesOf = faction => (nightMusic() && faction.music.nightBattle) || faction.music.battle;

function ambientFor(faction) {
  if (musicPick.night !== nightMusic()) { musicPick.night = nightMusic(); musicPick.ambient = ''; musicPick.battle = ''; } // (night fell, or day broke)
  if (musicPick.ambientFaction !== faction.id || !musicPick.ambient) {
    musicPick.ambientFaction = faction.id;
    musicPick.ambient = pickOne(ambientsOf(faction));
    musicPick.ambientSince = performance.now() / 1000;
  }
  return musicPick.ambient;
}

// fighting now or not: a new battle track as a fight starts, a new ambient as one ends
function trackFor(fighting) {
  ambientFor(getPlayerFaction()); // (the day's or the night's)
  if (fighting && (!musicPick.fighting || !musicPick.battle)) musicPick.battle = pickOne(battlesOf(getEnemyFaction()));
  const now = performance.now() / 1000;
  if ((!fighting && musicPick.fighting) || (!fighting && musicPick.ambient && now - musicPick.ambientSince > AMBIENT_SECONDS)) {
    musicPick.ambient = pickOne(ambientsOf(getPlayerFaction()), musicPick.ambient);
    musicPick.ambientSince = now;
  }
  musicPick.fighting = fighting;
  return fighting ? musicPick.battle || pickOne(battlesOf(getEnemyFaction())) : ambientFor(getPlayerFaction());
}

// Which music now, and how loud: { style: level }
export function musicMix() {
  if (!audio.musicOn) return {};
  const menuShows = game.gameMode === 'menu' || (!game.gameStarted && game.gameMode === 'endless');
  if (menuShows) return { menu: 1 };
  if (game.gameMode === 'editor') return { [ambientFor(getPlayerFaction())]: 0.6 };
  if (game.gameMode === 'battle') return battle.phase === 'fight' ? { [trackFor(true)]: 1 } : { [trackFor(false)]: 0.8 };
  if (typeof isDefeated === 'function' && isDefeated()) return {};
  const pause = game.isPaused ? 0.4 : 1;
  // a wave is on until the last enemy and enemy tent are gone
  const fighting = game.enemies.length > 0 || game.enemyTents.length > 0 || game.enemyTentBlueprints.length > 0;
  const mix = { [trackFor(fighting)]: pause };
  // (#279) one playing a flute by a campfire, in view: its tune over the music, softer the farther it is
  const flutes = Object.keys(GAME_CONFIG.music).filter(id => id.startsWith('flute_'));
  const player = !fighting && game.settlers.find(s => s.flute && game.pathTick - (s.playingFlute ?? -1e9) < 10);
  if (player && flutes.length) {
    const d = Math.hypot(player.x - camera.x, player.y - camera.y);
    if (d < 600) mix[flutes[player.id % flutes.length]] = pause * Math.max(0.25, 1 - d / 600);
  }
  return mix;
}

// Every frame: fade the styles to the mix, and schedule the notes of those that can be heard
export function updateMusic() {
  if (!audio.ctx || audio.ctx.state !== 'running') return;
  const ctx = audio.ctx, now = ctx.currentTime, mix = musicMix();
  for (const [name, layer] of Object.entries(audio.layers)) {
    const target = mix[name] || 0;
    if (layer.level !== target) {
      layer.gain.gain.setTargetAtTime(target, now, SOUND.fadeSeconds);
      layer.level = target;
      if (target > 0 && layer.next < now) layer.next = now + 0.05; // starts again on the beat from now
    }
    // silent for a while: nothing scheduled
    if (target === 0 && layer.gain.gain.value < 0.003) continue;
    const style = MUSIC_STYLES[name], eighth = 30 / style.bpm;
    if (layer.next < now) layer.next = now + 0.05;
    while (layer.next < now + 0.25) {
      style.step(layer.gain, layer.next, layer.step, eighth * 2);
      layer.next += eighth;
      layer.step++;
    }
  }
}

// What this file sets up as the game starts (called by app/boot.js)
export function initSounds() {
  // a click for every button
  document.addEventListener('pointerdown', e => { if (/** @type {Element} */ (e.target).closest('button')) { startAudio(); playSound('click'); } }, true);
}
