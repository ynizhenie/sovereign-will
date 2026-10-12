// Sound output: the audio context (started on the first gesture), sound and music switches, and the two
// building blocks every sound and note is made of, a tone and a burst of noise

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

// ---- Music: generated as it plays, a few bars ahead. Each style a layer of its own, faded in and out.

const midi = n => 440 * Math.pow(2, (n - 69) / 12);
