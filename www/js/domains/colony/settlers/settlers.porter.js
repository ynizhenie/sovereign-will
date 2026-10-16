// Porters (#199): a worker with no tool and no weapon, between waves, takes the load off a gatherer working
// far from any storage and carries it in, so the gatherer can go on; and it carries the corpses lying in
// the base out to a heap past its edge (heavy: slowly), away from where the colony lives. Not the undead's:
// their necromancers want the corpses.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, townHall } from '../../../engine/world/index.js';
import { isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { findNearestStorage, getCarryCapacity } from '../storage/index.js';
import { getBaseRadius } from '../../conflict/combat/index.js';
import { getPlayerFaction } from '../../factions/index.js';

const config = () => GAME_CONFIG.porter;
const isPorter = s => s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.isPossessed && !s.backpack;
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
// a gatherer with a load of what it gathered; far: farther than relayTiles from every storage
const loaded = w => w.role === 'worker' && w.carrying && !w.carrying.forBrew && !w.carrying.toHeap && (w.carrying.loads || 0) >= 1;
const farLoaded = w => loaded(w) && dist(w, findNearestStorage(w)) > config().relayTiles * TILE_SIZE;

// A porter is on its way to take this gatherer's load (the gatherer keeps walking in: they meet half way)
function isPorterComing(w) {
  return game.settlers.some(o => o !== w && o.porterTarget && o.porterTarget.kind === 'relay' && o.porterTarget.who === w);
}

// A porter's load on the way (before deliverCarrying would take a corpse "home"): a corpse to the heap.
// A load taken off a gatherer is full (loads = capacity), so deliverCarrying takes it in as ever
export function carryCorpse(s, tick) {
  const load = s.carrying && s.carrying.type === 'corpse' ? s.carrying : null;
  if (!load) return false;
  const heap = getCorpseHeap();
  s.patrolTarget = null;
  if (dist(heap, s) > 14 && !tick.isWaveActive) {
    moveEntityTowards(s, heap.x, heap.y, s.speed * config().corpseSpeed, false, tick.dt);
    return true;
  }
  // there (or a wave: dropped where it is), a little apart from the others
  game.corpses.push(Object.assign(load.corpse, { x: s.x + ((s.id * 7) % 11) - 5, y: s.y + ((s.id * 5) % 11) - 5 }));
  s.carrying = null;
  return true;
}

// A porter with nothing better to do between waves picks a job: a far gatherer's load, else a corpse in the
// base. One porter per gatherer, per corpse
export function porterWork(s, tick) {
  if (!isPorter(s) || s.carrying || tick.isWaveActive) { s.porterTarget = null; return false; }
  const taken = new Set(game.settlers.filter(o => o !== s).map(o => o.porterTarget).filter(Boolean));
  let target = s.porterTarget;
  const stillGood = target && !taken.has(target) && (target.kind === 'relay' ? game.settlers.includes(target.who) && loaded(target.who) : game.corpses.includes(target.who) && inBase(target.who));
  if (!stillGood) {
    const near = list => list.filter(o => !taken.has(o)).sort((a, b) => dist(a, s) - dist(b, s))[0];
    const relayTargets = game.settlers.filter(farLoaded);
    const gatherer = near(relayTargets.filter(w => !isPorterComing(w)));
    const corpse = getPlayerFaction().id === 'undead' ? null
      : near(game.corpses.filter(c => inBase(c) && !game.settlers.some(o => o !== s && o.porterTarget && o.porterTarget.who === c)));
    target = gatherer ? { kind: 'relay', who: gatherer } : corpse ? { kind: 'corpse', who: corpse } : null;
  }
  s.porterTarget = target;
  if (!target) return false;
  s.patrolTarget = null;
  const who = target.who;
  if (dist(who, s) > (target.kind === 'relay' ? 22 : 14)) { moveEntityTowards(s, who.x, who.y, s.speed, false, tick.dt); return true; }
  if (target.kind === 'relay') {
    // its load into the porter's hands, as a full load (straight in to a storage); the gatherer goes on
    s.carrying = { ...who.carrying, loads: getCarryCapacity(s) };
    who.carrying = null;
  } else {
    game.corpses.splice(game.corpses.indexOf(who), 1);
    s.carrying = { type: 'corpse', amount: 1, corpse: who };
  }
  s.porterTarget = null;
  return true;
}
