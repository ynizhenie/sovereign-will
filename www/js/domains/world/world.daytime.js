// Day and night (#257): a day of GAME_CONFIG.daytime (morning, day, evening, night), Endless only, starting
// in the morning. It darkens through the evening, is dark at night and lightens through the morning; at night
// what gives light shows through the dark: the town hall, lit torches and campfires, a torch in someone's
// hand, the demons' portals, a necromancer's staff

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { TILE_SIZE, game, townHall } from '../../engine/world/index.js';
import { camera, canvas, ctx, getViewScale } from '../../engine/platform/index.js';

const config = () => GAME_CONFIG.daytime;
const dayLength = () => { const c = config(); return c.morning + c.day + c.evening + c.night; };

export function tickDaytime(dt) {
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
  game.dayTime = ((game.dayTime || 0) + dt) % dayLength();
}

// 'morning', 'day', 'evening' or 'night' (always 'day' out of Endless)
export function getDayPhase() {
  if (game.gameMode !== 'endless') return 'day';
  const c = config(), t = game.dayTime || 0;
  if (t < c.morning) return 'morning';
  if (t < c.morning + c.day) return 'day';
  if (t < c.morning + c.day + c.evening) return 'evening';
  return 'night';
}

export function isNight() { return getDayPhase() === 'night'; }

// How far through the night it is, 0..1 (0 outside it)
export function nightProgress() {
  if (!isNight()) return 0;
  const c = config();
  return ((game.dayTime || 0) - c.morning - c.day - c.evening) / c.night;
}

// How dark it is now, 0 (day) .. darkness (night), smooth through the evening and the morning
export function getDarkness() {
  if (game.gameMode !== 'endless') return 0;
  const c = config(), t = game.dayTime || 0, phase = getDayPhase();
  if (phase === 'day') return 0;
  if (phase === 'night') return c.darkness;
  if (phase === 'morning') return c.darkness * (1 - t / c.morning);
  return c.darkness * ((t - c.morning - c.day) / c.evening);
}

// What gives light, and how far (px): [{ x, y, r }]
export function getLights() {
  const c = config();
  const lights = [{ x: townHall.x, y: townHall.y, r: townHall.radius + c.hallLightTiles * TILE_SIZE }];
  for (const b of game.buildings) {
    if (b.type === 'torch' && b.lit) lights.push({ x: b.x, y: b.y, r: c.torchLightTiles * TILE_SIZE });
    else if (b.type === 'campfire' && ((b.fuelLeft || 0) > 0 || (b.burning || 0) > 0)) lights.push({ x: b.x, y: b.y, r: c.campfireLightTiles * TILE_SIZE });
    else if (b.type === 'portal') lights.push({ x: b.x, y: b.y, r: c.portalLightTiles * TILE_SIZE });
  }
  for (const t of game.enemyTents) if (t.portal) lights.push({ x: t.x, y: t.y, r: c.portalLightTiles * TILE_SIZE });
  const staff = u => !!(getDefinition('tools', u.tool) || {}).necromancer;
  for (const s of game.settlers) {
    if (s.torchInHand) lights.push({ x: s.x, y: s.y, r: c.handTorchTiles * TILE_SIZE });
    else if (staff(s)) lights.push({ x: s.x, y: s.y, r: c.staffLightTiles * TILE_SIZE });
  }
  for (const en of game.enemies) {
    if (en.torch) lights.push({ x: en.x, y: en.y, r: c.handTorchTiles * TILE_SIZE });
    else if (en.enemyKey === 'undead_necromancer') lights.push({ x: en.x, y: en.y, r: c.staffLightTiles * TILE_SIZE });
  }
  return lights;
}

// The dark over the map (after the world, before the screen's own marks): a sheet of night with the lights
// cut out of it, soft at their edges
/** @type {HTMLCanvasElement | null} */
let sheet = null;
export function drawDarkness() {
  const dark = getDarkness();
  if (dark <= 0.01) return;
  if (!sheet) sheet = document.createElement('canvas');
  if (sheet.width !== canvas.width || sheet.height !== canvas.height) { sheet.width = canvas.width; sheet.height = canvas.height; }
  const g = /** @type {CanvasRenderingContext2D} */ (sheet.getContext('2d'));
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, sheet.width, sheet.height);
  g.fillStyle = `rgba(8, 12, 35, ${dark})`;
  g.fillRect(0, 0, sheet.width, sheet.height);
  g.globalCompositeOperation = 'destination-out';
  const scale = getViewScale();
  const flicker = 1 + Math.sin(performance.now() / 120) * 0.02;
  for (const light of getLights()) {
    const x = (light.x - camera.x) * scale + canvas.width / 2, y = (light.y - camera.y) * scale + canvas.height / 2;
    const r = light.r * scale * flicker;
    if (x < -r || y < -r || x > sheet.width + r || y > sheet.height + r) continue;
    const grad = g.createRadialGradient(x, y, r * 0.5, x, y, r); // (clear inside half its reach, soft beyond)
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  ctx.drawImage(sheet, 0, 0);
}

// (#307) the sun: shadows fall away from it, long in the morning (to the west, the sun in the east) and the
// evening (to the east), short at midday (straight down the screen), and faint at night (the moon). dx/dy:
// how far a shadow falls for each unit of a thing's height; alpha: how dark it is. Out of Endless: an afternoon
export function getSun() {
  const c = config(), light = c.morning + c.day + c.evening;
  const t = game.gameMode === 'endless' ? (game.dayTime || 0) : c.morning + c.day * 0.7;
  if (t >= light) return { dx: 0.15, dy: 0.4, alpha: 0.08 };
  const x = (t / light - 0.5) * 2, len = 0.55 + Math.abs(x) * 1.7;
  return { dx: x * len, dy: 0.45, alpha: 0.24 - Math.abs(x) * 0.07 };
}

// A thing's shadow on the ground: an ellipse round its foot (x, y) of rx by ry, cast away from the sun by its
// height and stretched along the way it falls. c: where to draw
export function castShadow(c, x, y, rx, ry, height = 10) {
  const sun = getSun(), ox = sun.dx * height, oy = sun.dy * height;
  c.fillStyle = `rgba(0, 0, 0, ${sun.alpha})`;
  c.beginPath(); c.ellipse(x + ox * 0.5, y + oy * 0.5, rx + Math.abs(ox) * 0.5, ry + Math.abs(oy) * 0.25, 0, 0, Math.PI * 2); c.fill();
}

