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

// Under everything but the grass: a worn tile a dry, trodden patch, joined to the worn tiles beside it so a
// run of them reads as one path; the more worn, the plainer
export function drawPaths() {
  const shows = config().shows;
  const worn = game.paths || {};
  const strength = (gx, gy) => { const w = worn[`${gx},${gy}`] || 0; return w < shows ? 0 : Math.min(1, (w - shows) / (1 - shows)); };
  for (const key of Object.keys(worn)) {
    const [gx, gy] = key.split(',').map(Number);
    const a = strength(gx, gy);
    if (!a) continue;
    const cx = gx * TILE_SIZE + 15, cy = gy * TILE_SIZE + 15, w = 9 + (tileVariantHash(gx, gy) % 3);
    ctx.fillStyle = `rgba(160, 135, 85, ${0.3 + 0.4 * a})`;
    ctx.beginPath(); ctx.arc(cx, cy, w, 0, Math.PI * 2); ctx.fill();
    // a bridge to a worn tile to the right and below (each pair once), as strong as the weaker
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const b = Math.min(a, strength(gx + dx, gy + dy));
      if (!b) continue;
      ctx.fillStyle = `rgba(160, 135, 85, ${0.3 + 0.4 * b})`;
      if (dx) ctx.fillRect(cx, cy - w + 2, TILE_SIZE, (w - 2) * 2);
      else ctx.fillRect(cx - w + 2, cy, (w - 2) * 2, TILE_SIZE);
    }
  }
}
