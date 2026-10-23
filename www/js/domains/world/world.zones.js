// Zones the player marks (#279), besides the farm's (farming.rules.js): where settlers go to relieve
// themselves, and where soldiers stand before a wave. A zone is a run of marked tiles touching side by side.
// - relief: a settler going goes to one (the nearest with room, reliefMax dung at most in a zone), its dung
//   there doesn't smear; all full, it goes as ever (to the grass, or by a zone). See relieve().
// - post: each tile a post for one soldier before a wave; those left over get posts as ever. See
//   getDefensePlan().

import { GAME_CONFIG } from '../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, isTownHallSpawnTile, townHall } from '../../engine/world/index.js';
import { isTileBlockedForSettler } from '../../engine/movement/index.js';
import { showNotification } from '../../ui/index.js';
import { t } from '../../engine/platform/index.js';

const LISTS = { relief: 'reliefZones', post: 'postZones' };

// The tile's zone of a kind marked or taken away (again: taken away); 'clear' takes any off
export function toggleZone(x, y, kind) {
  for (const k of Object.keys(LISTS)) {
    const list = game[LISTS[k]];
    const at = list.findIndex(z => z.x === x && z.y === y);
    if (at >= 0 && (kind === 'clear' || k === kind)) { list.splice(at, 1); if (kind !== 'clear') return; }
  }
  if (kind === 'clear') return;
  const g = getGridPos(x, y);
  if (isTownHallSpawnTile(g.gx, g.gy) || isTileBlockedForSettler(g.gx, g.gy) || Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + 10) { showNotification(t('zone.badTile'), true); return; }
  // (one kind to a tile)
  for (const k of Object.keys(LISTS)) if (k !== kind) game[LISTS[k]] = game[LISTS[k]].filter(z => z.x !== x || z.y !== y);
  game[LISTS[kind]].push({ x, y });
}

// A kind's zones: runs of its tiles touching side by side
export function zonesOf(kind) {
  const tiles = game[LISTS[kind]] || [];
  const key = z => `${z.x},${z.y}`;
  const byKey = new Map(tiles.map(z => [key(z), z]));
  const seen = new Set(), out = [];
  for (const start of tiles) {
    if (seen.has(key(start))) continue;
    const group = [], queue = [start];
    seen.add(key(start));
    while (queue.length) {
      const z = queue.pop();
      group.push(z);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = byKey.get(`${z.x + dx * TILE_SIZE},${z.y + dy * TILE_SIZE}`);
        if (n && !seen.has(key(n))) { seen.add(key(n)); queue.push(n); }
      }
    }
    out.push(group);
  }
  return out;
}

const onTile = (o, z) => Math.abs(o.x - z.x) < TILE_SIZE / 2 && Math.abs(o.y - z.y) < TILE_SIZE / 2;
export const inReliefZone = (x, y) => game.reliefZones.some(z => onTile({ x, y }, z));

// Where a settler going goes: a free spot in the nearest relief zone with room (fewer than reliefMax dung in
// it), apart from the dung there; null: none with room
export function reliefZoneSpot(s, reachable) {
  const max = GAME_CONFIG.zones.reliefMax;
  let best = null, bestD = Infinity;
  // (the places others are on their way to count as taken)
  const going = game.settlers.filter(o => o !== s && o.reliefSpot).map(o => o.reliefSpot);
  for (const zone of zonesOf('relief')) {
    const inIt = p => zone.some(z => onTile(p, z));
    if (game.dung.filter(inIt).length + going.filter(inIt).length >= max) continue;
    for (const z of zone) {
      if (reachable && !reachable(z)) continue;
      const d = Math.hypot(z.x - s.x, z.y - s.y);
      if (d >= bestD) continue;
      // a place on the tile not on a pile already
      const spots = [[0, 0], [-8, -8], [8, -8], [-8, 8], [8, 8], [0, -9], [0, 9], [-9, 0], [9, 0]].map(([dx, dy]) => ({ x: z.x + dx, y: z.y + dy }));
      const spot = spots.find(p => ![...game.dung, ...going].some(dp => Math.hypot(dp.x - p.x, dp.y - p.y) < 7));
      if (spot) { best = spot; bestD = d; }
    }
  }
  return best;
}
