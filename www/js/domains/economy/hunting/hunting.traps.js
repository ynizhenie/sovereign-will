// Traps that take bait (#248): an iron trap baited with food draws boars and catches one at a chance, and
// holds an enemy that steps on it; a fish trap catches only while baited (what a fisher uses). A settler
// with free hands, or a fisher, fetches the bait from a storage and puts it in

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, rand } from '../../../engine/world/index.js';
import { canAfford, fetchFromStorage, takeStock } from '../../colony/storage/index.js';
import { collidesWithWall, collidesWithWater, moveEntityTowards } from '../../../engine/movement/index.js';
import { faceTowards } from '../../colony/settlers/index.js';
import { damageEnemy } from '../../conflict/combat/index.js';
import { getFishingBait } from '../fishing/index.js';
import { playSound } from '../../../app/index.js';

const ironTrapDef = () => GAME_CONFIG.buildings.iron_trap.ironTrap;

// A trap waiting for bait, and what would go in it now (null: none in the stock, or it needs none)
/** @returns {Object | null} */
function wantedBait(b) {
  if (b.type === 'fish_trap') return (b.baitLeft || 0) > 0 ? null : getFishingBait();
  if (b.type === 'iron_trap') return b.bait || b.holding ? null : ironTrapDef().bait.find(bait => canAfford(bait)) || null;
  return null;
}

// Between waves, a worker with free hands (or a fisher) takes bait to the nearest trap that wants it; the
// bait is in its hands on the way (a wave: it goes back to the stock, see deliverCarrying)
export function baitTrap(s, tick) {
  const load = s.carrying && s.carrying.forTrap ? s.carrying : null;
  if (s.role !== 'worker' || s.isPossessed || tick.isWaveActive) {
    if (load) delete load.forTrap; // (carried back)
    return false;
  }
  if (!load) {
    if (s.carrying || !((s.tool === 'none' && s.weapon === 'fist') || s.tool === 'rod')) return false;
    let trap = null, best = Infinity;
    for (const b of game.buildings) {
      if (tick.trapAssignments.has(b) || !wantedBait(b) || game.settlers.some(o => o.carrying && o.carrying.forTrap === b)) continue;
      const d = Math.hypot(b.x - s.x, b.y - s.y);
      if (d < best) { best = d; trap = b; }
    }
    if (!trap) return false;
    tick.trapAssignments.add(trap);
    const [id, amount] = Object.entries(wantedBait(trap) || {})[0];
    s.patrolTarget = null;
    return fetchFromStorage(s, id, tick.dt, () => { s.carrying = { type: id, amount: takeStock(id, amount), forTrap: trap }; });
  }
  const trap = load.forTrap;
  if (!game.buildings.includes(trap)) { delete load.forTrap; return false; } // gone: back to the stock
  tick.trapAssignments.add(trap);
  s.patrolTarget = null;
  if (Math.hypot(trap.x - s.x, trap.y - s.y) > 32) { moveEntityTowards(s, trap.x, trap.y, s.speed, false, tick.dt); return true; }
  faceTowards(s, trap.x, trap.y);
  if (trap.type === 'fish_trap') trap.baitLeft = (trap.baitLeft || 0) + GAME_CONFIG.buildings.fish_trap.fishTrap.baitCatches;
  else trap.bait = 1;
  s.carrying = null;
  return true;
}

// Each tick: iron traps catch what steps on them (an enemy: hurt and held a while; a boar drawn to the
// bait: caught at boarChance, or it eats the bait and goes), let go when the time's up, and set again
export function tickIronTraps(dt) {
  const def = ironTrapDef();
  for (const trap of game.buildings) {
    if (trap.type !== 'iron_trap') continue;
    if (trap.holding) {
      const held = trap.holding;
      const gone = !(game.enemies.includes(held) || game.boars.includes(held)) || held.hp <= 0 || held.isCarcass;
      if (gone || (held.trappedFor !== undefined && (held.trappedFor -= dt) <= 0)) {
        if (!gone) delete held.trappedFor;
        held.trapped = false;
        trap.holding = null;
        trap.rearm = def.rearmSeconds;
      } else {
        held.x = trap.x; held.y = trap.y; // (held fast)
      }
      continue;
    }
    if ((trap.rearm || 0) > 0) { trap.rearm = (trap.rearm || 0) - dt; continue; }
    const g = getGridPos(trap.x, trap.y);
    const onIt = u => { const p = getGridPos(u.x, u.y); return p.gx === g.gx && p.gy === g.gy; };
    const en = game.enemies.find(e => e.hp > 0 && onIt(e));
    if (en) {
      damageEnemy(en, def.enemyDamage);
      if (en.hp > 0) { trap.holding = en; en.trapped = true; en.trappedFor = def.holdSeconds; }
      else trap.rearm = def.rearmSeconds;
      playSound('hit', trap);
    }
  }
}

// A boar near a baited iron trap goes to it (tickBoars); there, it's caught at boarChance, or it eats the
// bait. True while it's on its way or held
export function boarToBait(b) {
  if (b.trapped) return true;
  const def = ironTrapDef();
  let trap = null, best = def.lureRange;
  for (const t of game.buildings) {
    if (t.type !== 'iron_trap' || !t.bait || t.holding || (t.rearm || 0) > 0) continue;
    const d = Math.hypot(t.x - b.x, t.y - b.y);
    if (d < best) { best = d; trap = t; }
  }
  if (!trap) return false;
  if (best > TILE_SIZE / 3) {
    const speed = Math.min(0.3 * GAME_CONFIG.movementScale, best);
    const vx = (trap.x - b.x) / best * speed, vy = (trap.y - b.y) / best * speed;
    if (collidesWithWall(b.x + vx, b.y + vy, 12) || collidesWithWater(b.x + vx, b.y + vy, 12)) return false; // (walled off: it wanders)
    b.x += vx; b.y += vy;
    return true;
  }
  trap.bait = 0;
  if (rand() < def.boarChance) {
    trap.holding = b;
    b.trapped = true;
    playSound('hit', trap);
  }
  return !!b.trapped;
}
