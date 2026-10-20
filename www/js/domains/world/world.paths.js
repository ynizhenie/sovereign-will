// Paths (#248): ground settlers walk a lot gets trodden, the grass dry and worn, a path showing between the
// buildings and to the town hall. Only in the base. Each tile's wear goes up a little each time a settler
// is seen walking on it (GAME_CONFIG.paths) and fades slowly when it isn't; past `shows` it's drawn,
// darker the more worn

import { GAME_CONFIG } from '../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, getTileIndex, townHall } from '../../engine/world/index.js';
import { ctx } from '../../engine/platform/index.js';
import { getBaseRadius } from '../conflict/combat/index.js';
import { tileVariantHash } from './world.draw.js';

const config = () => GAME_CONFIG.paths;
/** @type {WeakMap<object, { x: number, y: number }>} where each settler was at the last look */
const lastSeen = new WeakMap();

export function tickPaths() {
  if (game.gameMode !== 'endless') return;
  const c = config();
  game.paths = game.paths || {};
  if (game.pathTick % c.everyTicks === 0) {
    const base = getBaseRadius(), tiles = getTileIndex();
    for (const s of game.settlers) {
      const was = lastSeen.get(s);
      lastSeen.set(s, { x: s.x, y: s.y });
      if (!was || Math.hypot(s.x - was.x, s.y - was.y) < c.minStep) continue; // (standing: no wear)
      if (Math.hypot(s.x - townHall.x, s.y - townHall.y) > base) continue; // (only in the base)
      const g = getGridPos(s.x, s.y), key = `${g.gx},${g.gy}`;
      if (tiles.buildings.has(`${g.gx * TILE_SIZE + 15},${g.gy * TILE_SIZE + 15}`)) continue;
      game.paths[key] = Math.min(1, (game.paths[key] || 0) + c.wear);
    }
  }
  if (game.pathTick % c.fadeTicks === 0) {
    for (const key of Object.keys(game.paths)) {
      game.paths[key] -= c.fade;
      if (game.paths[key] <= 0) delete game.paths[key];
    }
  }
}

// Under everything but the grass: worn tiles joined into one trodden path (#279: drawn as one stroke, so
// where it runs on or crosses itself it doesn't come out in darker blotches and squares). A darker worn edge, a
// dry earth body, and a bare middle where it's walked most; each tile's centre nudged a little so the path
// wanders, a few pebbles on the worn bits
export function drawPaths() {
  const shows = config().shows;
  const worn = game.paths || {};
  const strength = (gx, gy) => { const w = worn[`${gx},${gy}`] || 0; return w < shows ? 0 : Math.min(1, (w - shows) / (1 - shows)); };
  const at = (gx, gy) => { const h = tileVariantHash(gx, gy); return { x: gx * TILE_SIZE + 15 + (h % 7) - 3, y: gy * TILE_SIZE + 15 + ((h >> 3) % 7) - 3 }; };
  const tiles = [];
  for (const key of Object.keys(worn)) {
    const [gx, gy] = key.split(',').map(Number);
    const a = strength(gx, gy);
    if (a) tiles.push({ gx, gy, a });
  }
  if (!tiles.length) return;
  // one path of segments to each worn neighbour (right, below; a diagonal only where no corner joins them)
  /** @type {number[][]} */
  const all = [], core = [];
  for (const { gx, gy, a } of tiles) {
    const p = at(gx, gy);
    all.push([p.x, p.y, p.x + 0.01, p.y]); // (a lone tile: a round dot)
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const b = strength(gx + dx, gy + dy);
      if (!b) continue;
      if (dx && dy && (strength(gx + dx, gy) || strength(gx, gy + dy))) continue;
      const q = at(gx + dx, gy + dy);
      all.push([p.x, p.y, q.x, q.y]);
      if (Math.min(a, b) > 0.5) core.push([p.x, p.y, q.x, q.y]);
    }
  }
  const stroke = (segments, color, width) => {
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of segments) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  stroke(all, 'rgba(105, 85, 50, 0.32)', 22);
  stroke(all, 'rgba(176, 150, 98, 0.55)', 16);
  if (core.length) stroke(core, 'rgba(196, 172, 122, 0.45)', 7);
  ctx.fillStyle = 'rgba(120, 104, 80, 0.55)';
  for (const { gx, gy, a } of tiles) {
    const h = tileVariantHash(gx, gy);
    if (a < 0.4 || h % 3) continue;
    const p = at(gx, gy);
    ctx.fillRect(p.x + (h % 11) - 5, p.y + ((h >> 4) % 9) - 4, 1.6, 1.4);
    ctx.fillRect(p.x - (h % 5) + 1, p.y + ((h >> 2) % 7) - 6, 1.2, 1.2);
  }
  ctx.restore();
}
