// Sounds and music (#174), all made with Web Audio: no sound files. playSound(name, at) for what happens in
// the game (at: where in the world, for its loudness and left-right; none for the interface); updateMusic()
// every frame for the music: calm in the main menu, an ambient in Endless that turns into battle music
// while a wave is on (until the last enemy and enemy tent are gone). Sound and music can each be turned
// off in the Settings. The audio starts with the first tap or key (browsers allow it only then).

const SOUND = {
  sfxVolume: 0.55, musicVolume: 0.3,
  menuWorldShare: 0.35,  // the world behind the main menu is quieter
  fadeSeconds: 1.2,      // the music's crossfades: a time constant, so about 4x this to the end
  // a sound plays at most once in this many seconds (the same name), so crowds don't drown everything
  minGap: { click: 0.03, swing: 0.07, hit: 0.06, bow: 0.08, arrowHit: 0.06, chop: 0.09, mine: 0.09, rustle: 0.15,
    hammer: 0.12, boar: 0.25, hurt: 0.12, death: 0.12, deliver: 0.15, error: 0.3 }
};

const audio = {
  ctx: null, master: null, sfx: null, music: null, noise: null,
  layers: {},            // music styles: { gain, next, step, bar } each
  last: {},              // when each sound last played (audio time)
  soundOn: loadSetting('sound', 'on') === 'on',
  musicOn: loadSetting('music', 'on') === 'on'
};

// ---- Setting up (on the first gesture)

function startAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended' && !document.hidden) audio.ctx.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = audio.ctx = new Ctx();
  audio.master = ctx.createGain(); audio.master.connect(ctx.destination);
  // a gentle limiter on everything
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12; limiter.ratio.value = 6;
  limiter.connect(audio.master);
  audio.sfx = ctx.createGain(); audio.sfx.gain.value = SOUND.sfxVolume; audio.sfx.connect(limiter);
  audio.music = ctx.createGain(); audio.music.gain.value = SOUND.musicVolume; audio.music.connect(limiter);
  // a second of white noise, for whooshes, rustles and drums
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  audio.noise = buffer;
  for (const style of Object.keys(MUSIC_STYLES)) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(audio.music);
    audio.layers[style] = { gain, next: 0, step: 0, level: 0 };
  }
}
for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, startAudio, true);
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return;
  if (document.hidden) audio.ctx.suspend(); else audio.ctx.resume();
});

function setSoundOn(on) { audio.soundOn = on; saveSetting('sound', on ? 'on' : 'off'); }
function setMusicOn(on) { audio.musicOn = on; saveSetting('music', on ? 'on' : 'off'); }

// ---- Building blocks: a tone and a burst of noise, each with a quick attack and a fading tail

function tone(out, t, { type = 'sine', freq, to, dur, gain, attack = 0.005, filter, q = 1 }) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filter; f.Q.value = q;
    osc.connect(f); node = f;
  }
  node.connect(env); env.connect(out);
  osc.start(t); osc.stop(t + dur + 0.05);
}

function noise(out, t, { dur, gain, type = 'bandpass', freq = 1000, to, q = 1, attack = 0.003 }) {
  const ctx = audio.ctx;
  const src = ctx.createBufferSource();
  src.buffer = audio.noise;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(env); env.connect(out);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

// ---- Sound effects

const SOUNDS = {
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
  defeat: (o, t) => [392, 349, 311, 262].forEach((f, i) => tone(o, t + i * 0.32, { type: 'triangle', freq: f, dur: 0.5, gain: 0.22 }))
};

// How loud a sound at a world point is, and where left-right: null when it's well off the screen
function soundPlace(at) {
  if (!at || typeof camera === 'undefined') return { volume: 1, pan: 0 };
  const k = getViewScale() / screenPixelRatio;
  const halfW = Math.max(1, canvas.clientWidth / 2), halfH = Math.max(1, canvas.clientHeight / 2);
  const dx = (at.x - camera.x) * k / halfW, dy = (at.y - camera.y) * k / halfH;
  const far = Math.max(Math.abs(dx), Math.abs(dy));
  if (far > 1.3) return null;
  return { volume: Math.max(0.15, 1 - 0.55 * far), pan: Math.max(-0.8, Math.min(0.8, dx * 0.7)) };
}

function playSound(name, at, ...args) {
  if (!audio.ctx || audio.ctx.state !== 'running' || !audio.soundOn || !SOUNDS[name]) return;
  const t = audio.ctx.currentTime;
  if (t - (audio.last[name] ?? -1) < (SOUND.minGap[name] || 0)) return;
  const place = soundPlace(at);
  if (!place) return;
  audio.last[name] = t;
  const out = audio.ctx.createGain();
  out.gain.value = place.volume * (gameMode === 'menu' && at ? SOUND.menuWorldShare : 1);
  let node = out;
  if (audio.ctx.createStereoPanner) {
    const pan = audio.ctx.createStereoPanner();
    pan.pan.value = place.pan;
    out.connect(pan); node = pan;
  }
  node.connect(audio.sfx);
  SOUNDS[name](out, t, ...args);
  setTimeout(() => node.disconnect(), 3000);
}

// Steady work makes its sound on a beat of its own per unit (chopping, mining, building...)
function playWorkSound(unit, name, everySeconds = 0.5) {
  const now = performance.now() / 1000;
  if (now - (unit.lastWorkSound || 0) < everySeconds) return;
  unit.lastWorkSound = now;
  playSound(name, unit);
}

// ---- Music: generated as it plays, a few bars ahead. Each style a layer of its own, faded in and out.

const midi = n => 440 * Math.pow(2, (n - 69) / 12);

const MUSIC_STYLES = {
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
  // the Endless ambient: low, slow chords, sparse notes, now and then a bird
  ambient: {
    bpm: 60, chords: [[50, 57, 62, 64], [46, 53, 58, 62], [53, 57, 60, 64], [48, 55, 60, 62]], scale: [74, 76, 77, 79, 81],
    step(o, t, step, beat) {
      const bar = Math.floor(step / 8) % 4, chord = this.chords[bar];
      if (step % 8 === 0) chord.forEach(n => tone(o, t, { type: 'sine', freq: midi(n), dur: beat * 4.5, gain: 0.1, attack: 1.4 }));
      if (Math.random() < 0.1) tone(o, t, { type: 'triangle', freq: midi(this.scale[Math.floor(Math.random() * this.scale.length)]), dur: 1.8, gain: 0.08 });
      if (Math.random() < 0.025) {
        const f = 2600 + Math.random() * 900;
        for (let i = 0; i < 3; i++) tone(o, t + i * 0.09, { freq: f, to: f * 1.25, dur: 0.07, gain: 0.04 });
      }
    }
  },
  // a wave: drums, a driving bass, minor stabs
  battle: {
    bpm: 124, bass: [45, 45, 48, 45, 43, 45, 40, 43], chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]],
    step(o, t, step, beat) {
      const eighth = step % 8, bar = Math.floor(step / 8) % 4;
      tone(o, t, { type: 'sawtooth', freq: midi(this.bass[eighth]), dur: beat * 0.45, gain: 0.08, filter: 520 });
      if (eighth === 0 || eighth === 4) tone(o, t, { freq: 120, to: 42, dur: 0.28, gain: 0.45 });
      if (eighth === 2 || eighth === 6) noise(o, t, { dur: 0.13, gain: 0.16, freq: 1800, q: 0.8 });
      if (bar === 3 && eighth >= 5) tone(o, t, { freq: 220 - eighth * 15, to: 80, dur: 0.18, gain: 0.25 });
      if (eighth === 0) this.chords[bar].forEach(n => tone(o, t, { type: 'sawtooth', freq: midi(n), dur: beat * 1.6, gain: 0.03, filter: 1300, attack: 0.02 }));
    }
  }
};

// Which music now, and how loud: { style: level }
function musicMix() {
  if (!audio.musicOn) return {};
  const menuShows = gameMode === 'menu' || (!gameStarted && gameMode === 'endless');
  if (menuShows) return { menu: 1 };
  if (gameMode === 'editor') return { ambient: 0.6 };
  if (gameMode === 'battle') return battle.phase === 'fight' ? { battle: 1 } : { ambient: 0.8 };
  if (typeof isDefeated === 'function' && isDefeated()) return {};
  const pause = isPaused ? 0.4 : 1;
  // a wave is on until the last enemy and enemy tent are gone (#174)
  const fighting = enemies.length > 0 || enemyTents.length > 0 || enemyTentBlueprints.length > 0;
  return fighting ? { battle: pause } : { ambient: pause };
}

// Every frame: fade the styles to the mix, and schedule the notes of those that can be heard
function updateMusic() {
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

// ---- The Settings: sound and music on / off, remembered on the device
const markAudioOptions = () => {
  document.querySelectorAll('[data-sound]').forEach(b => b.classList.toggle('active', (b.dataset.sound === 'on') === audio.soundOn));
  document.querySelectorAll('[data-music]').forEach(b => b.classList.toggle('active', (b.dataset.music === 'on') === audio.musicOn));
};
markAudioOptions();
document.querySelectorAll('[data-sound]').forEach(b => onTap(b, () => { setSoundOn(b.dataset.sound === 'on'); markAudioOptions(); }));
document.querySelectorAll('[data-music]').forEach(b => onTap(b, () => { setMusicOn(b.dataset.music === 'on'); markAudioOptions(); }));

// a click for every button
document.addEventListener('pointerdown', e => { if (e.target.closest('button')) { startAudio(); playSound('click'); } }, true);
