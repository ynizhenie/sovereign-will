// Demons walk into the sacrificial circle when sent, and heal by eating corpses

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { game, getGridPos } from '../../../engine/world/index.js';
import { showNotification } from '../../../ui/index.js';
import { getReachSteps, getSettlerReach, moveEntityTowards } from '../../../engine/movement/index.js';
import { faceTowards } from '../../colony/settlers/index.js';
import { campMeals } from './demons.camp.js';

// A settler the player sent into a sacrificial circle walks there and dies in it; everyone else is
// healed to full (see the circle tap in handleCanvasClick)
export function goToSacrifice(s, tick) {
  const circle = s.sacrificeAt;
  if (!circle) return false;
  if (!game.buildings.includes(circle)) { s.sacrificeAt = null; return false; }
  s.patrolTarget = null;
  if (Math.hypot(circle.x - s.x, circle.y - s.y) > 30) {
    moveEntityTowards(s, circle.x, circle.y, s.speed, false, tick.dt);
    return true;
  }
  s.sacrificeAt = null;
  s.hp = 0;
  for (const other of game.settlers) if (other !== s) other.hp = other.maxHp;
  showNotification(t('sacrifice.done'), false);
  return true;
}

// Demons heal by eating a corpse, when nothing is attacking (eatCorpseSeconds per corpse: back to full)
export function eatCorpse(s, tick) {
  if (!(getDefinition('settlerTypes', s.type) || {}).eatsCorpses || s.hp >= s.maxHp || tick.isWaveActive || s.carrying) return false;
  let corpse = null, best = Infinity;
  // only one lying where it can walk to (#232: one in a wall had it trying for good); or one in a corpse pit
  // or a cage (#250)
  const reach = getSettlerReach(s);
  const reachable = c => { const g = getGridPos(c.x, c.y); return getReachSteps(reach, g.gx, g.gy) >= 0; };
  for (const c of [...game.corpses, ...campMeals()]) {
    const d = Math.hypot(c.x - s.x, c.y - s.y);
    if (d < best && !tick.raiseAssignments.has(c) && (c.take || reachable(c))) { best = d; corpse = c; }
  }
  if (!corpse) return false;
  tick.raiseAssignments.add(corpse);
  s.patrolTarget = null;
  if (best > (corpse.take ? 30 : 16)) {
    moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt);
    s.eatTimer = 0;
    return true;
  }
  s.working = 0.1;
  faceTowards(s, corpse.x, corpse.y);
  s.eatTimer = (s.eatTimer || 0) + tick.dt;
  if (s.eatTimer >= GAME_CONFIG.eatCorpseSeconds) {
    s.eatTimer = 0;
    s.hp = s.maxHp;
    if (corpse.take) corpse.take();
    else game.corpses.splice(game.corpses.indexOf(corpse), 1);
  }
  return true;
}
