// Corpses out of the base (#199): between waves a soldier (or archer), or a worker with nothing in hand, carries
// the corpses lying in the base out to a heap past its edge (heavy: slowly), away from where the colony
// lives. Not the undead's: their necromancers want the corpses. (The porter role is gone, #232.)

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, getTileIndex, townHall } from '../../../engine/world/index.js';
import { getReachSteps, getSettlerReach, moveEntityTowards } from '../../../engine/movement/index.js';
import { getBaseRadius } from '../../conflict/combat/index.js';
import { getPlayerFaction } from '../../factions/index.js';

const config = () => GAME_CONFIG.corpseHaul;
// who carries them: a soldier or archer off a tower, or a worker with nothing in hand
const isHauler = s => !s.isPossessed && !s.towerAssignment && (s.role === 'soldier' || s.role === 'archer' || (s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.backpack));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Where the corpses go: past the base's edge (corpseHeapTiles out, farther if that's taken) on ground a
// settler can walk to from the town hall, the side of the map's nearest edge first. Null: nowhere to be
// had (walled in). Worked out again only when the map or the base's size changes. (#261: it was sometimes
// inside what counts as the base, so its corpses were carried off again and again; or behind a wall)
const hallHolder = { x: 0, y: 0 }; // (the town hall's reach, kept on it: worked out once a change)
/** @type {{ key: string, heap: { x: number, y: number } | null } | null} */
let heapCache = null;
export function getCorpseHeap() {
  const base = getBaseRadius();
  const key = `${getTileIndex().signature}|${base}|${townHall.x},${townHall.y}`;
  if (heapCache && heapCache.key === key) return heapCache.heap;
  hallHolder.x = townHall.x; hallHolder.y = townHall.y;
  const reach = getSettlerReach(hallHolder);
  const r = base + config().corpseHeapTiles * TILE_SIZE;
  const edges = [[1, 0, game.WORLD_WIDTH - townHall.x], [-1, 0, townHall.x], [0, 1, game.WORLD_HEIGHT - townHall.y], [0, -1, townHall.y]].sort((a, b) => a[2] - b[2]);
  let heap = null;
  for (let k = 0; k < 8 && !heap; k++) {
    for (const [dx, dy] of edges) {
      for (const side of [0, 1, -1, 2, -2, 3, -3]) {
        const x = townHall.x + dx * (r + k * TILE_SIZE) + dy * side * TILE_SIZE, y = townHall.y + dy * (r + k * TILE_SIZE) + dx * side * TILE_SIZE;
        const g = getGridPos(x, y);
        if (g.gx <= BORDER_MARGIN || g.gy <= BORDER_MARGIN || g.gx >= game.COLS - BORDER_MARGIN - 1 || g.gy >= game.ROWS - BORDER_MARGIN - 1) continue;
        if (getReachSteps(reach, g.gx, g.gy) >= 0) { heap = { x: g.gx * TILE_SIZE + 15, y: g.gy * TILE_SIZE + 15 }; break; }
      }
      if (heap) break;
    }
  }
  heapCache = { key, heap };
  return heap;
}

const inBase = c => dist(c, townHall) < getBaseRadius() + TILE_SIZE;

// A corpse on the way to the heap (before deliverCarrying would take it "home")
export function carryCorpse(s, tick) {
  const load = s.carrying && s.carrying.type === 'corpse' ? s.carrying : null;
  if (!load || load.forPit || load.forGrave) return false; // (the demons': to a corpse pit, tendCorpses; the undead's to a grave, #253)
  const heap = getCorpseHeap();
  s.patrolTarget = null;
  s.haulWalk = (s.haulWalk || 0) + tick.dt;
  if (heap && dist(heap, s) > 14 && !tick.isWaveActive && s.haulWalk < config().giveUpSeconds) {
    moveEntityTowards(s, heap.x, heap.y, s.speed * config().speed, false, tick.dt);
    return true;
  }
  // there (or a wave, or it couldn't get there: dropped where it is, and left be), a little apart from
  // the others
  const there = !!heap && dist(heap, s) <= 14;
  game.corpses.push(Object.assign(load.corpse, { x: s.x + ((s.id * 7) % 11) - 5, y: s.y + ((s.id * 5) % 11) - 5 }, there || tick.isWaveActive ? {} : { leftBe: true }));
  s.carrying = null;
  s.haulWalk = 0;
  return true;
}

// The player has work marked that this one could take (#279: an order comes before the corpses): for a
// worker a build or a marked resource, for a soldier a marked boar to hunt. Not with something in its arms
export function hasPlayerOrderFor(s, tick) {
  if (s.carrying) return false;
  const marked = tick.markedResources.filter(r => (r.priority || 0) > 0);
  if (s.role === 'worker') return game.blueprints.length > 0 || marked.length > 0;
  return marked.some(r => game.boars.includes(r));
}

// Between waves, one with nothing better to do goes for a corpse in the base, one each
export function haulCorpses(s, tick) {
  if (hasPlayerOrderFor(s, tick)) { s.corpseTarget = null; return false; }
  // (the undead keep theirs for the necromancers; the demons put theirs in pits or cut them up, #250)
  if (!isHauler(s) || s.carrying || tick.isWaveActive || getPlayerFaction().id === 'undead' || getPlayerFaction().id === 'demons' || !getCorpseHeap()) { s.corpseTarget = null; return false; }
  const taken = new Set(game.settlers.filter(o => o !== s).map(o => o.corpseTarget).filter(Boolean));
  let corpse = s.corpseTarget;
  if (!corpse || !game.corpses.includes(corpse) || taken.has(corpse) || !inBase(corpse)) {
    corpse = game.corpses.filter(c => inBase(c) && !c.leftBe && !taken.has(c)).sort((a, b) => dist(a, s) - dist(b, s))[0] || null;
  }
  s.corpseTarget = corpse;
  if (!corpse) return false;
  s.patrolTarget = null;
  if (dist(corpse, s) > 14) { moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt); return true; }
  game.corpses.splice(game.corpses.indexOf(corpse), 1);
  s.carrying = { type: 'corpse', amount: 1, corpse };
  s.corpseTarget = null;
  s.haulWalk = 0;
  return true;
}
