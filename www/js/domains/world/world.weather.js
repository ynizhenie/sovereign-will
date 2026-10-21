// Weather (#308), Endless only: clear, rain, fog or a storm, one after another (GAME_CONFIG.weather), each
// coming on and going off gradually (`level`). The wind blows all the while, stronger in rain and a storm,
// all but still in fog; its strength and way drift. Grass and wheat sway with it. Rain falls slanting with the
// wind, rings on the water; it waters the crops and makes the fires burn their fuel faster. Fog drifts over
// everything. A storm is rain with a strong wind, lightning flashing now and then and thunder after. By day
// the air shimmers over the desert, and the water's surface moves (zoomed in).

import { GAME_CONFIG } from '../../content/configs/index.js';
import { TILE_SIZE, game, rand } from '../../engine/world/index.js';
import { camera, canvas, ctx, getViewScale } from '../../engine/platform/index.js';
import { playSound } from '../../app/index.js';
import { getSun } from './world.daytime.js';

const config = () => GAME_CONFIG.weather;
/** @type {{ kind: string, level: number, left: number, wind: number, windTo: number, windAngle: number, flash: number, thunderIn: number, nextBolt: number, bolt: { x: number, seed: number } | null }} */
const CLEAR = { kind: 'clear', level: 0, left: 0, wind: 0.3, windTo: 0.3, windAngle: 0, flash: 0, thunderIn: -1, nextBolt: 0, bolt: null };

/** @returns {typeof CLEAR} */
export function getWeather() {
  return game.gameMode === 'endless' && game.weather ? game.weather : CLEAR;
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
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
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
export function windSway(x, y, h) {
  const w = getWeather(), t = performance.now() / 1000;
  const gust = 0.6 + 0.4 * Math.sin(t * 0.7 + x * 0.004);
  const s = w.wind * gust * (Math.sin(t * 2.4 + x * 0.05 + y * 0.03) * 0.5 + 0.7);
  // (a wind up or down the screen still bends them a little sideways)
  const side = Math.cos(w.windAngle || 0), lean = Math.abs(side) < 0.45 ? (side < 0 ? -0.45 : 0.45) : side;
  return lean * s * h * 0.35;
}

// ---- On screen

// In the world (before the night's darkness): the water's surface moving and rain's rings on it (zoomed in),
// the desert's shimmer by day, the fog
export function drawWeatherWorld() {
  const scale = getViewScale(), halfW = canvas.width / 2 / scale + TILE_SIZE, halfH = canvas.height / 2 / scale + TILE_SIZE;
  const seen = o => o.x > camera.x - halfW && o.x < camera.x + halfW && o.y > camera.y - halfH && o.y < camera.y + halfH;
  const t = performance.now() / 1000, rain = rainLevel();
  if (scale >= 0.75) {
    for (const tile of game.waterTiles) {
      if (!seen(tile)) continue;
      const h = (tile.x * 73856093) ^ (tile.y * 19349663);
      // a light wavelet drifting across it
      const p = ((t * 0.25 + (h & 255) / 255) % 1);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.16 * Math.sin(p * Math.PI)})`; ctx.lineWidth = 1.2;
      const wx = tile.x - 12 + p * 20, wy = tile.y - 6 + ((h >>> 8) % 12);
      ctx.beginPath(); ctx.moveTo(wx - 5, wy); ctx.quadraticCurveTo(wx, wy - 2, wx + 5, wy); ctx.stroke();
      // rain's rings, each spreading and fading
      if (rain > 0.05) {
        for (let k = 0; k < 2; k++) {
          const q = (t * 1.3 + ((h >>> (k * 5)) & 63) / 63) % 1;
          ctx.strokeStyle = `rgba(220, 240, 255, ${0.45 * rain * (1 - q)})`; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(tile.x - 8 + ((h >>> (k * 7)) % 16), tile.y - 8 + ((h >>> (k * 9 + 3)) % 16), 1 + q * 5, 0.6 + q * 2.5, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    // the desert's air shimmering in the day's heat (not in rain)
    const heat = Math.max(0, getSun().alpha - 0.16) / 0.08 * (1 - rain);
    if (heat > 0.05) {
      ctx.lineWidth = 1;
      for (const tile of game.desertTiles) {
        if (!seen(tile)) continue;
        const h = (tile.x * 2654435761) ^ tile.y;
        if (h & 1) continue;
        const p = (t * 0.35 + ((h >>> 3) & 255) / 255) % 1, y = tile.y + 12 - p * 26;
        ctx.strokeStyle = `rgba(255, 245, 220, ${0.22 * heat * Math.sin(p * Math.PI)})`;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) { const x = tile.x - 12 + k * 4, yy = y + Math.sin(t * 6 + k + tile.x) * 1.5; if (k) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); }
        ctx.stroke();
      }
    }
  }
  // fog: soft banks drifting with the wind over a light haze
  const w = getWeather();
  if (w.kind === 'fog' && w.level > 0) {
    ctx.fillStyle = `rgba(210, 215, 220, ${0.22 * w.level})`;
    ctx.fillRect(camera.x - halfW, camera.y - halfH, halfW * 2, halfH * 2);
    const drift = t * 12 * (0.3 + w.wind);
    for (let k = 0; k < 10; k++) {
      const bx = camera.x - halfW + ((k * 397 + drift) % (halfW * 2 + 400)) - 200, by = camera.y - halfH + ((k * 271) % (halfH * 2));
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, 160);
      g.addColorStop(0, `rgba(225, 230, 235, ${0.35 * w.level})`); g.addColorStop(1, 'rgba(225, 230, 235, 0)');
      ctx.fillStyle = g; ctx.fillRect(bx - 160, by - 160, 320, 320);
    }
  }
}

// Over the screen (after the darkness): rain's streaks slanting with the wind and a dimmer sky, a storm's
// lightning (its flash, and the bolt)
export function drawWeatherScreen() {
  const w = getWeather(), rain = rainLevel();
  if (rain <= 0 && !(w.flash > 0)) return;
  const W = canvas.width, H = canvas.height, t = performance.now() / 1000;
  if (rain > 0) {
    ctx.fillStyle = `rgba(20, 30, 45, ${0.18 * rain * (w.kind === 'storm' ? 1.6 : 1)})`; ctx.fillRect(0, 0, W, H);
    const slant = Math.cos(w.windAngle || 0) * w.wind * 0.6, n = Math.round((w.kind === 'storm' ? 260 : 160) * rain), len = H * 0.035;
    ctx.strokeStyle = `rgba(200, 215, 230, ${0.35 + 0.15 * rain})`; ctx.lineWidth = Math.max(1, W / 1200);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sx = ((i * 7919) % 1000) / 1000, sp = 0.8 + ((i * 104729) % 100) / 250;
      const y = ((t * sp * 1.6 + ((i * 3571) % 1000) / 1000) % 1) * (H + len) - len;
      const x = (sx * (W + H * 0.5) - H * 0.25 + slant * y) % (W + 40);
      ctx.moveTo(x, y); ctx.lineTo(x + slant * len, y + len);
    }
    ctx.stroke();
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
