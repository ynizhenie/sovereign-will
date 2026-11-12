// Weather (#308), Endless only: clear, rain, fog or a storm, one after another (GAME_CONFIG.weather), each
// coming on and going off gradually (`level`). The wind blows all the while, stronger in rain and a storm,
// all but still in fog; its strength and way drift. Grass and wheat sway with it. Rain falls slanting with the
// wind, rings on the water; it waters the crops and makes the fires burn their fuel faster. Fog drifts over
// everything. A storm is rain with a strong wind, lightning flashing now and then and thunder after. By day
// the air shimmers over the desert, and the water's surface moves (zoomed in).

import { GAME_CONFIG } from '../../content/configs/index.js';
import { forEachInRect, game, rand, TILE_SIZE, worldEpoch } from '../../engine/world/index.js';
import { camera, canvas, ctx, getViewScale, glReady, glWaveDropAll, glWaveGroup, glWaves } from '../../engine/platform/index.js';
import { playSound } from '../../app/index.js';
import { getSun } from './world.daytime.js';

const config = () => GAME_CONFIG.weather;
/** @type {{ kind: string, level: number, left: number, wind: number, windTo: number, windAngle: number, flash: number, thunderIn: number, nextBolt: number, bolt: { x: number, seed: number } | null }} */
const CLEAR = { kind: 'clear', level: 0, left: 0, wind: 0.3, windTo: 0.3, windAngle: 0, flash: 0, thunderIn: -1, nextBolt: 0, bolt: null };

/** @returns {typeof CLEAR} */
export function getWeather() {
  return (game.gameMode === 'endless' || game.gameMode === 'battle') && game.weather ? game.weather : CLEAR;
}

// (#326) A battle's weather, picked in its settings: that kind all through the fight (null: clear)
export function setStandingWeather(kind) {
  if (kind === 'clear' || !config().wind[kind]) { game.weather = null; return; }
  const [lo, hi] = config().wind[kind];
  game.weather = { ...CLEAR, kind, level: 1, left: Infinity, wind: (lo + hi) / 2, windTo: (lo + hi) / 2 };
}
// rain falling now, 0..1 (a storm is rain too)
export const rainLevel = () => { const w = getWeather(); return w.kind === 'rain' || w.kind === 'storm' ? w.level : 0; };

function pickKind(after) {
  const weights = { ...config().weights };
  if (after !== 'clear') weights.clear *= 2; // (a spell of weather, then most often clear again)
  else weights.clear = 0;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let n = rand() * total;
  for (const [kind, w] of Object.entries(weights)) { n -= w; if (n < 0) return kind; }
  return 'clear';
}

export function tickWeather(dt) {
  if (game.plagueMode) { game.weather = null; return; } // (#404: always clear)
  if (game.gameMode === 'battle' && game.weather) game.weather.left = Infinity; // (a battle's stands: its wind and lightning go on)
  else if (game.gameMode !== 'endless' || !game.gameStarted) return;
  const c = config();
  if (!game.weather) game.weather = { ...CLEAR, left: c.firstClearSeconds };
  const w = game.weather;
  w.left -= dt;
  if (w.left <= 0) {
    w.kind = pickKind(w.kind);
    w.left = c.seconds[0] + rand() * (c.seconds[1] - c.seconds[0]);
    w.level = 0;
  }
  // coming on at the start, going off at the end
  const goal = w.kind === 'clear' ? 0 : w.left > c.fade ? 1 : 0;
  w.level += Math.sign(goal - w.level) * Math.min(Math.abs(goal - w.level), dt / c.fade);
  // the wind: towards the weather's strength, now and then a new aim within it; its way drifting
  const [lo, hi] = c.wind[w.kind] || c.wind.clear;
  if (rand() < dt * 0.15) w.windTo = lo + rand() * (hi - lo);
  w.wind += (w.windTo - w.wind) * Math.min(1, dt * 0.3);
  w.windAngle = (w.windAngle || 0) + (rand() - 0.5) * dt * 0.1;
  // a storm's lightning, and its thunder a moment after
  w.flash = Math.max(0, (w.flash || 0) - dt * 2.5);
  if (w.kind === 'storm' && w.level > 0.6) {
    w.nextBolt = (w.nextBolt || 0) - dt;
    if (w.nextBolt <= 0) {
      w.nextBolt = c.boltSeconds[0] + rand() * (c.boltSeconds[1] - c.boltSeconds[0]);
      w.flash = 1;
      w.bolt = { x: rand(), seed: Math.floor(rand() * 1e6) };
      w.thunderIn = 0.3 + rand() * 1.2;
    }
  }
  if (w.thunderIn > 0) { w.thunderIn -= dt; if (w.thunderIn <= 0) playSound('thunder'); }
}

// How far a stalk (of height h) at (x, y) leans with the wind now, in px: sideways along the wind's way
export function windSway(x, y, h, time = performance.now() / 1000) {
  const w = getWeather(), t = time;
  const gust = 0.6 + 0.4 * Math.sin(t * 0.7 + x * 0.004);
  const s = w.wind * gust * (Math.sin(t * 2.4 + x * 0.05 + y * 0.03) * 0.5 + 0.7);
  // (a wind up or down the screen still bends them a little sideways)
  const side = Math.cos(w.windAngle || 0), lean = Math.abs(side) < 0.45 ? (side < 0 ? -0.45 : 0.45) : side;
  return lean * s * h * 0.35;
}

// The wind as windSway has it: how strong, and which way it leans things (for what sways on the graphics card's canvas)
export function windNow() {
  const w = getWeather(), side = Math.cos(w.windAngle || 0);
  return { wind: w.wind, lean: Math.abs(side) < 0.45 ? (side < 0 ? -0.45 : 0.45) : side };
}

// The water's wavelets on the graphics card's canvas (the trial): the water round the screen in groups of GROUP x GROUP tiles,
// each made when it first comes near the screen and kept (the least recently seen dropped past MAX_GROUPS); made again when
// the water changes. A wavelet is where and when the game's canvas would draw it: the same sums of its tile
const GROUP = 16, MAX_GROUPS = 240;
/** @type {{ world: number, list: any[] | null, length: number, first: any, last: any, seen: Map<string, number>, frame: number }} */
const waveState = { world: -1, list: null, length: -1, first: undefined, last: undefined, seen: new Map(), frame: 0 };
function keepWavesOnCard(x0, y0, x1, y1, time, half) {
  const water = game.waterTiles, w = waveState;
  if (w.world !== worldEpoch() || w.list !== water || w.length !== water.length || w.first !== water[0] || w.last !== water[water.length - 1]) {
    glWaveDropAll();
    Object.assign(w, { world: worldEpoch(), list: water, length: water.length, first: water[0], last: water[water.length - 1], seen: new Map() });
  }
  w.frame++;
  const size = GROUP * TILE_SIZE;
  for (let cy = Math.floor(y0 / size); cy <= Math.floor(y1 / size); cy++) {
    for (let cx = Math.floor(x0 / size); cx <= Math.floor(x1 / size); cx++) {
      const key = `${cx},${cy}`;
      if (!w.seen.has(key)) {
        /** @type {number[]} */
        const waves = [];
        forEachInRect(water, cx * size, cy * size, (cx + 1) * size - 0.01, (cy + 1) * size - 0.01, tile => {
          const h = (tile.x * 73856093) ^ (tile.y * 19349663);
          waves.push(tile.x - 12, tile.y - 6 + ((h >>> 8) % 12), (h & 255) / 255, h & 1);
        });
        glWaveGroup(key, waves);
      }
      w.seen.set(key, w.frame);
    }
  }
  if (w.seen.size > MAX_GROUPS) {
    for (const [key, frame] of [...w.seen].sort((a, b) => a[1] - b[1]).slice(0, w.seen.size - MAX_GROUPS)) { glWaveGroup(key, []); w.seen.delete(key); }
  }
  glWaves(true, time, half);
}

// ---- On screen

// In the world (before the night's darkness): the water's surface moving and rain's rings on it (zoomed in),
// the desert's shimmer by day, the fog
export function drawWeatherWorld() {
  const scale = getViewScale(), halfW = canvas.width / 2 / scale + TILE_SIZE, halfH = canvas.height / 2 / scale + TILE_SIZE;
  // (#299) the tiles of a list on the screen, found by their tiles, not by going through all of a big map's
  const seen = list => { const found = []; forEachInRect(list, camera.x - halfW, camera.y - halfH, camera.x + halfW, camera.y + halfH, o => { found.push(o); }); return found; };
  const t = performance.now() / 1000, rain = rainLevel();
  const lowDetail = canvas.width * canvas.height > 1_000_000;
  if (scale >= 0.75) {
    // (#322) the wavelets of a lake: each was its own path, its own stroke and its own colour string (a thousand a frame on a big lake).
    // Now their strokes are grouped by how bright they are now (six steps, the way they fade in and out), a path and a stroke for each step;
    // and half of them (the other half's alike) when the view's not close
    const WAVES = 6, waves = Array.from({ length: WAVES }, () => new Path2D());
    const sparse = scale < 1.2;
    // (with the trial on the wavelets are kept on the graphics card's canvas and move there: only the rain's rings are drawn here)
    const onCard = glReady();
    if (onCard) keepWavesOnCard(camera.x - halfW, camera.y - halfH, camera.x + halfW, camera.y + halfH, t, lowDetail || sparse);
    if (!onCard || rain > 0.05) for (const tile of seen(game.waterTiles)) {
      const h = (tile.x * 73856093) ^ (tile.y * 19349663);
      if ((lowDetail || sparse) && (h & 1)) continue;
      // a light wavelet drifting across it
      const p = ((t * 0.25 + (h & 255) / 255) % 1);
      const wx = tile.x - 12 + p * 20, wy = tile.y - 6 + ((h >>> 8) % 12);
      const path = waves[Math.min(WAVES - 1, Math.floor(Math.sin(p * Math.PI) * WAVES))];
      if (!onCard) { path.moveTo(wx - 5, wy); path.quadraticCurveTo(wx, wy - 2, wx + 5, wy); }
      // rain's rings, each spreading and fading
      if (rain > 0.05) {
        for (let k = 0; k < (lowDetail ? 1 : 2); k++) {
          const q = (t * 1.3 + ((h >>> (k * 5)) & 63) / 63) % 1;
          ctx.strokeStyle = `rgba(220, 240, 255, ${0.45 * rain * (1 - q)})`; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(tile.x - 8 + ((h >>> (k * 7)) % 16), tile.y - 8 + ((h >>> (k * 9 + 3)) % 16), 1 + q * 5, 0.6 + q * 2.5, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.lineWidth = 1.2;
    if (!onCard) waves.forEach((path, i) => { ctx.strokeStyle = `rgba(255, 255, 255, ${0.16 * (i + 0.5) / WAVES})`; ctx.stroke(path); });
    // the desert's air shimmering in the day's heat (not in rain)
    const heat = Math.max(0, getSun().alpha - 0.16) / 0.08 * (1 - rain);
    if (heat > 0.05) {
      ctx.lineWidth = 1;
      const SHIMMER = 4, shimmer = Array.from({ length: SHIMMER }, () => new Path2D());
      for (const tile of seen(game.desertTiles)) {
        const h = (tile.x * 2654435761) ^ tile.y;
        if (h & (lowDetail ? 3 : 1)) continue;
        const p = (t * 0.35 + ((h >>> 3) & 255) / 255) % 1, y = tile.y + 12 - p * 26;
        const path = shimmer[Math.min(SHIMMER - 1, Math.floor(Math.sin(p * Math.PI) * SHIMMER))];
        for (let k = 0; k <= 6; k++) { const x = tile.x - 12 + k * 4, yy = y + Math.sin(t * 6 + k + tile.x) * 1.5; if (k) path.lineTo(x, yy); else path.moveTo(x, yy); }
      }
      shimmer.forEach((path, i) => { ctx.strokeStyle = `rgba(255, 245, 220, ${0.22 * heat * (i + 0.5) / SHIMMER})`; ctx.stroke(path); });
    }
  }
  if (scale < 0.75 && glReady()) glWaves(false, t, false);
  // Fog: a mottled pale veil drifting across map coordinates, independent of screen panning and zoom.
  const w = getWeather();
  if (w.kind === 'fog' && w.level > 0) {
    ctx.fillStyle = `rgba(194, 207, 216, ${0.1 * w.level})`;
    ctx.fillRect(camera.x - halfW, camera.y - halfH, halfW * 2, halfH * 2);
    const tile = 900, drift = t * w.wind * 8, texture = fogTexture();
    const offsetX = ((drift + Math.sin(t * 0.025) * 90) % tile + tile) % tile;
    const offsetY = ((Math.cos(t * 0.018) * 45) % tile + tile) % tile;
    const x0 = camera.x - halfW, x1 = camera.x + halfW;
    const y0 = camera.y - halfH, y1 = camera.y + halfH;
    ctx.save();
    ctx.globalAlpha = 0.42 * w.level;
    for (let gy = Math.floor((y0 - offsetY) / tile); gy <= Math.ceil((y1 - offsetY) / tile); gy++) {
      for (let gx = Math.floor((x0 - offsetX) / tile); gx <= Math.ceil((x1 - offsetX) / tile); gx++) {
        ctx.drawImage(texture, gx * tile + offsetX, gy * tile + offsetY, tile, tile);
      }
    }
    ctx.restore();
  }
}

// A seamless cloudy alpha texture: broad value-noise shapes replace the repeated circular fog banks.
/** @type {HTMLCanvasElement | null} */
let fogTextureCanvas = null;
function fogTexture() {
  if (!fogTextureCanvas) {
    const size = 128, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    const hash = (x, y, salt) => {
      let h = Math.imul(x + salt, 374761393) + Math.imul(y - salt, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return (h ^ (h >>> 16)) >>> 0;
    };
    const smooth = t => t * t * (3 - 2 * t);
    const noise = (x, y, cells, salt) => {
      const px = x * cells, py = y * cells, ix = Math.floor(px), iy = Math.floor(py);
      const fx = smooth(px - ix), fy = smooth(py - iy), wrap = (n, m) => (n % m + m) % m;
      const sample = (sx, sy) => hash(wrap(sx, cells), wrap(sy, cells), salt) / 0xffffffff;
      const top = sample(ix, iy) * (1 - fx) + sample(ix + 1, iy) * fx;
      const bottom = sample(ix, iy + 1) * (1 - fx) + sample(ix + 1, iy + 1) * fx;
      return top * (1 - fy) + bottom * fy;
    };
    const image = c.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / (size - 1), v = y / (size - 1);
        const value = noise(u, v, 2, 17) * 0.56 + noise(u, v, 4, 43) * 0.29 + noise(u, v, 8, 91) * 0.15;
        const cloud = Math.max(0, Math.min(1, (value - 0.42) / 0.28));
        const alpha = Math.round(smooth(cloud) * 210);
        const i = (y * size + x) * 4;
        image.data[i] = 205; image.data[i + 1] = 216; image.data[i + 2] = 222; image.data[i + 3] = alpha;
      }
    }
    c.putImageData(image, 0, 0);
    fogTextureCanvas = canvas;
  }
  return fogTextureCanvas;
}

// Over the screen (after the darkness): rain's streaks slanting with the wind and a dimmer sky, a storm's
// lightning (its flash, and the bolt)
export function drawWeatherScreen() {
  const w = getWeather(), rain = rainLevel();
  if (rain <= 0 && !(w.flash > 0)) return;
  const W = canvas.width, H = canvas.height, t = performance.now() / 1000;
  if (rain > 0) {
    // (#326) a light dimming and not many streaks, in two depths: far ones short, thin and faint, near ones
    // longer and brighter; each a little different in speed, so the rain doesn't march
    ctx.fillStyle = `rgba(20, 30, 45, ${0.06 * rain * (w.kind === 'storm' ? 1.5 : 1)})`; ctx.fillRect(0, 0, W, H);
    const slant = Math.cos(w.windAngle || 0) * w.wind * 0.6, storm = w.kind === 'storm';
    const layers = [
      { n: storm ? 44 : 28, len: H * 0.022, speed: 1.1, alpha: 0.16, width: Math.max(0.8, W / 1800), salt: 1 },
      { n: storm ? 20 : 11, len: H * 0.05, speed: 1.7, alpha: 0.3, width: Math.max(1, W / 1100), salt: 7 }
    ];
    for (const { n, len, speed, alpha, width, salt } of layers) {
      ctx.strokeStyle = `rgba(205, 220, 238, ${alpha * (0.6 + 0.4 * rain)})`; ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath();
      const count = Math.round(n * rain);
      for (let i = 0; i < count; i++) {
        const k = i * salt + salt * 31;
        const sx = ((k * 7919) % 1000) / 1000, sp = speed * (0.85 + ((k * 104729) % 100) / 330);
        const y = ((t * sp + ((k * 3571) % 1000) / 1000) % 1) * (H + len) - len;
        const x = (sx * (W + H * 0.5) - H * 0.25 + slant * y) % (W + 40);
        ctx.moveTo(x, y); ctx.lineTo(x + slant * len, y + len);
      }
      ctx.stroke();
    }
  }
  if (w.flash > 0) {
    ctx.fillStyle = `rgba(235, 240, 255, ${0.5 * w.flash * w.flash})`; ctx.fillRect(0, 0, W, H);
    if (w.bolt && w.flash > 0.5) {
      // a jagged bolt down from the top
      let x = w.bolt.x * W, y = 0, s = w.bolt.seed;
      ctx.strokeStyle = `rgba(255, 255, 255, ${w.flash})`; ctx.lineWidth = Math.max(2, W / 500);
      ctx.beginPath(); ctx.moveTo(x, y);
      while (y < H * 0.6) { s = (s * 1103515245 + 12345) & 0x7fffffff; x += ((s % 100) - 50) * W / 2000; y += H * 0.05; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
}
