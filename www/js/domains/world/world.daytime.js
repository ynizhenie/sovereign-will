// Day and night (#257): a day of GAME_CONFIG.daytime (morning, day, evening, night), Endless only, starting
// in the morning. It darkens through the evening, is dark at night and lightens through the morning; at night
// what gives light shows through the dark: the town hall, lit torches and campfires, a torch in someone's
// hand, the demons' portals, a necromancer's staff

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { TILE_SIZE, game, townHall } from '../../engine/world/index.js';
import { isVisible } from './world.fog.js';
import { camera, canvas, ctx, getViewScale } from '../../engine/platform/index.js';
import { getBuildingColor, getEnemyColor, getSettlerColor } from '../factions/index.js';

const config = () => GAME_CONFIG.daytime;
const dayLength = () => { const c = config(); return c.morning + c.day + c.evening + c.night; };

export function tickDaytime(dt) {
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
  game.dayTime = ((game.dayTime || 0) + dt) % dayLength();
}

// (#326) a battle has a time of day too, picked in its settings and standing still: only how it looks (the dark,
// the lights, the shadows); nobody sleeps or eats by it there
const looksByTime = () => game.gameMode === 'endless' || game.gameMode === 'battle' || game.gameMode === 'editor';

// When in a day each of a battle's times is (its middle; the evening's dusk well on)
export function timeOfPhase(phase) {
  const c = config();
  return { morning: c.morning * 0.3, day: c.morning + c.day * 0.5, evening: c.morning + c.day + c.evening * 0.7, night: c.morning + c.day + c.evening + c.night * 0.5 }[phase] ?? c.morning + c.day * 0.5;
}

// 'morning', 'day', 'evening' or 'night' (always 'day' out of Endless: what the colony does by it)
export function getDayPhase() {
  if (game.gameMode !== 'endless' && game.gameMode !== 'editor') return 'day';
  return phaseAt(game.dayTime || 0);
}

function phaseAt(t) {
  const c = config();
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
  if (!looksByTime()) return 0;
  const c = config(), t = game.dayTime || 0, phase = phaseAt(t);
  if (phase === 'day') return 0;
  if (phase === 'night') return c.darkness;
  if (phase === 'morning') return c.darkness * (1 - t / c.morning);
  return c.darkness * ((t - c.morning - c.day) / c.evening);
}

function staffLightPosition(unit) {
  const radius = unit.visualRadius || unit.radius || 11, facing = unit.facing || 0;
  const big = radius > 14 ? 1.3 : 1;
  let angle = 0, push = 0;
  if (unit.swingT > 0) {
    const progress = 1 - unit.swingT / (unit.swingLen || 0.3);
    const arc = Math.sin(Math.PI * progress);
    angle = (-1.6 + 2.3 * progress * progress) * big;
    push = 3 * arc;
  } else if (unit.working > 0) {
    const beat = Math.sin(game.pathTick * 0.3);
    if (unit.workKind === 'build' || (unit.crafting && unit.crafting.until >= game.pathTick)) angle = -0.9 + 0.9 * Math.abs(beat);
    else if (unit.workKind === 'butcher') push = 4 + 3 * beat;
    else if (unit.workKind === 'pick') { angle = 0.2 * beat; push = 6 + 4 * Math.abs(beat); }
    else if (unit.workKind === 'heal') { angle = 0.3; push = 6 + 3 * beat; }
    else angle = 0.8 * beat - 0.3;
  }
  const rotation = facing + angle, along = push + radius * 0.72 + 21, across = radius * 0.5;
  return {
    x: unit.x + Math.cos(rotation) * along - Math.sin(rotation) * across,
    y: unit.y + Math.sin(rotation) * along + Math.cos(rotation) * across
  };
}

// What gives light, and how far (px): [{ x, y, r, color? }]
export function getLights() {
  const c = config();
  const lights = [{ x: townHall.x, y: townHall.y, r: townHall.radius + c.hallLightTiles * TILE_SIZE }];
  for (const b of game.buildings) {
    if (b.type === 'torch' && b.lit) lights.push({ x: b.x, y: b.y, r: c.torchLightTiles * TILE_SIZE });
    else if (b.type === 'campfire' && ((b.fuelLeft || 0) > 0 || (b.burning || 0) > 0)) lights.push({ x: b.x, y: b.y, r: c.campfireLightTiles * TILE_SIZE });
    else if (b.type === 'portal') lights.push({ x: b.x, y: b.y, r: c.portalLightTiles * TILE_SIZE, color: getBuildingColor(b) });
    else if ((b.type === 'tent' || b.type === 'demon_den') && getDarkness() > 0.01) lights.push({ x: b.x, y: b.y, r: c.shelterLightTiles * TILE_SIZE });
  }
  for (const t of game.enemyTents) if (t.portal) lights.push({ x: t.x, y: t.y, r: c.portalLightTiles * TILE_SIZE, color: getEnemyColor(null) });
  const staff = u => !!(getDefinition('tools', u.tool) || {}).necromancer;
  for (const s of game.settlers) {
    if (staff(s)) lights.push({ ...staffLightPosition(s), r: c.staffLightTiles * TILE_SIZE, color: getSettlerColor(null) });
    else if (s.torchInHand) lights.push({ x: s.x, y: s.y, r: c.handTorchTiles * TILE_SIZE });
  }
  for (const en of game.enemies) {
    if (!isVisible(en.x, en.y)) continue; // (#326: its torch isn't seen in the fog)
    if (en.enemyKey === 'undead_necromancer') lights.push({ ...staffLightPosition(en), r: c.staffLightTiles * TILE_SIZE, color: getEnemyColor(en) });
    else if (en.torch) lights.push({ x: en.x, y: en.y, r: c.handTorchTiles * TILE_SIZE });
  }
  return lights;
}

// The dark over the map (after the world, before the screen's own marks): a sheet of night with the lights
// cut out of it, soft at their edges. (#322) A third of the screen's size, laid over it stretched: its edges
// are all soft anyway, and a phone filled the whole screen twice over for it every frame
const SHEET_SCALE = 1 / 3;
/** @type {HTMLCanvasElement | null} */
let sheet = null;
export function drawDarkness() {
  const dark = getDarkness();
  if (dark <= 0.01) return;
  if (!sheet) sheet = document.createElement('canvas');
  const sw = Math.max(1, Math.ceil(canvas.width * SHEET_SCALE)), sh = Math.max(1, Math.ceil(canvas.height * SHEET_SCALE));
  if (sheet.width !== sw || sheet.height !== sh) { sheet.width = sw; sheet.height = sh; }
  const g = /** @type {CanvasRenderingContext2D} */ (sheet.getContext('2d'));
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, sheet.width, sheet.height);
  g.fillStyle = `rgba(8, 12, 35, ${dark})`;
  g.fillRect(0, 0, sheet.width, sheet.height);
  g.globalCompositeOperation = 'destination-out';
  const scale = getViewScale() * SHEET_SCALE;
  const flicker = 1 + Math.sin(performance.now() / 120) * 0.02;
  for (const light of getLights()) {
    if (light.color) continue;
    const x = (light.x - camera.x) * scale + sheet.width / 2, y = (light.y - camera.y) * scale + sheet.height / 2;
    const r = light.r * scale * flicker;
    if (x < -r || y < -r || x > sheet.width + r || y > sheet.height + r) continue;
    const grad = g.createRadialGradient(x, y, r * 0.5, x, y, r); // (clear inside half its reach, soft beyond)
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  ctx.save(); ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sheet, 0, 0, canvas.width, canvas.height);
  const viewScale = getViewScale();
  ctx.globalCompositeOperation = 'screen';
  for (const light of getLights()) {
    if (!light.color) continue;
    const match = /^#([\da-f]{6})$/i.exec(light.color);
    if (!match) continue;
    const value = Number.parseInt(match[1], 16);
    const color = `${value >> 16}, ${(value >> 8) & 255}, ${value & 255}`;
    const x = (light.x - camera.x) * viewScale + canvas.width / 2;
    const y = (light.y - camera.y) * viewScale + canvas.height / 2;
    const r = light.r * viewScale * flicker;
    if (x < -r || y < -r || x > canvas.width + r || y > canvas.height + r) continue;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, `rgba(${color}, 0.24)`);
    glow.addColorStop(0.55, `rgba(${color}, 0.12)`);
    glow.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// (#307) the sun: shadows fall away from it, long in the morning (to the west, the sun in the east) and the
// evening (to the east), short at midday (straight down the screen), and faint at night (the moon). dx/dy:
// how far a shadow falls for each unit of a thing's height; alpha: how dark it is. Out of Endless (and a battle):
// an afternoon
export function getSun() {
  const c = config(), light = c.morning + c.day + c.evening;
  const t = looksByTime() ? (game.dayTime || 0) : c.morning + c.day * 0.7;
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
