// Corpses out of the base (#199): between waves a soldier (or archer), or a worker with nothing in hand, carries
// the corpses lying in the base out to a heap past its edge (heavy: slowly), away from where the colony
// lives. Not the undead's: their necromancers want the corpses. (The porter role is gone, #232.)

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, townHall } from '../../../engine/world/index.js';
import { isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { getBaseRadius } from '../../conflict/combat/index.js';
import { getPlayerFaction } from '../../factions/index.js';

const config = () => GAME_CONFIG.corpseHaul;
// who carries them: a soldier or archer off a tower, or a worker with nothing in hand
const isHauler = s => !s.isPossessed && !s.towerAssignment && (s.role === 'soldier' || s.role === 'archer' || (s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.backpack));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Where the corpses go: past the base's edge on the side of the map's nearest edge, on ground a settler can
// stand on
export function getCorpseHeap() {
  const r = getBaseRadius() + config().corpseHeapTiles * TILE_SIZE;
  const edges = [[1, 0, game.WORLD_WIDTH - townHall.x], [-1, 0, townHall.x], [0, 1, game.WORLD_HEIGHT - townHall.y], [0, -1, townHall.y]];
  const [dx, dy] = edges.sort((a, b) => a[2] - b[2])[0];
  for (let k = 0; k < 6; k++) {
    for (const side of [0, 1, -1, 2, -2]) {
      const x = townHall.x + dx * (r - k * TILE_SIZE) + dy * side * TILE_SIZE, y = townHall.y + dy * (r - k * TILE_SIZE) + dx * side * TILE_SIZE;
      const g = getGridPos(x, y);
      if (g.gx > BORDER_MARGIN && g.gy > BORDER_MARGIN && g.gx < game.COLS - BORDER_MARGIN - 1 && g.gy < game.ROWS - BORDER_MARGIN - 1 && !isTileBlockedForSettler(g.gx, g.gy)) {
        return { x: g.gx * TILE_SIZE + 15, y: g.gy * TILE_SIZE + 15 };
      }
    }
  }
  return { x: townHall.x + dx * r, y: townHall.y + dy * r };
}

const inBase = c => dist(c, townHall) < getBaseRadius() + TILE_SIZE;

// A corpse on the way to the heap (before deliverCarrying would take it "home")
export function carryCorpse(s, tick) {
  const load = s.carrying && s.carrying.type === 'corpse' ? s.carrying : null;
  if (!load) return false;
  const heap = getCorpseHeap();
  s.patrolTarget = null;
  if (dist(heap, s) > 14 && !tick.isWaveActive) {
    moveEntityTowards(s, heap.x, heap.y, s.speed * config().speed, false, tick.dt);
    return true;
  }
  // there (or a wave: dropped where it is), a little apart from the others
  game.corpses.push(Object.assign(load.corpse, { x: s.x + ((s.id * 7) % 11) - 5, y: s.y + ((s.id * 5) % 11) - 5 }));
  s.carrying = null;
  return true;
}

// Between waves, one with nothing better to do goes for a corpse in the base, one each
export function haulCorpses(s, tick) {
  if (!isHauler(s) || s.carrying || tick.isWaveActive || getPlayerFaction().id === 'undead') { s.corpseTarget = null; return false; }
  const taken = new Set(game.settlers.filter(o => o !== s).map(o => o.corpseTarget).filter(Boolean));
  let corpse = s.corpseTarget;
  if (!corpse || !game.corpses.includes(corpse) || taken.has(corpse) || !inBase(corpse)) {
    corpse = game.corpses.filter(c => inBase(c) && !taken.has(c)).sort((a, b) => dist(a, s) - dist(b, s))[0] || null;
  }
  s.corpseTarget = corpse;
  if (!corpse) return false;
  s.patrolTarget = null;
  if (dist(corpse, s) > 14) { moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt); return true; }
  game.corpses.splice(game.corpses.indexOf(corpse), 1);
  s.carrying = { type: 'corpse', amount: 1, corpse };
  s.corpseTarget = null;
  return true;
}
