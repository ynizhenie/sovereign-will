// Meals eaten (#248): a hungry settler goes to the nearest storage, takes its food and eats it there, a bite
// at a time, for meals.eatSeconds. An archer in a tower eats where it is; in a wave a meal waits till it's
// beaten (missed, it's eaten on the go when the next one's due, see tickMeals); with nothing to eat, there's
// no going for it

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { findNearestStorage, isAtStorage, stock, walkToStorage } from '../storage/index.js';
import { isDefenseAlert } from '../../conflict/combat/index.js';
import { eatMeal, isBigBody } from './settlers.rules.js';
import { says } from './settlers.voices.js';

// The kind of food most in the stock, to be seen eating it
function foodLook() {
  const kinds = Object.entries(game.foodMix || {}).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]);
  const kind = kinds.length ? GAME_CONFIG.foodKinds[kinds[0][0]] : null;
  return kind ? kind.icon : 'food';
}

// what a settler finishes before it goes to eat (its last tick's behaviour)
const BUSY = new Set(['harvest', 'harvestMarked', 'build', 'repairBuilding', 'fish', 'pickApples', 'tendFarmZones', 'waterCrops', 'deliverMaterials', 'craftItem', 'cook']);

export function goEat(s, tick) {
  if (s.eating) { s.patrolTarget = null; return true; } // (counted down in tickMeals)
  if (!s.wantsMeal || s.isPossessed) return false;
  const cost = isBigBody(s) ? 2 : 1;
  if (s.towerAssignment || (stock.food || 0) + (stock.worms || 0) < cost) {
    if ((stock.food || 0) + (stock.worms || 0) < cost) says(s, 'hungry'); // (nothing to eat, #252)
    s.wantsMeal = false; eatMeal(s); return false;
  }
  if (tick.isWaveActive || isDefenseAlert() || s.carrying) return false; // (later: after the wave, its load home first)
  // (#326) in the middle of a job (hunting, felling, building...): that finished first, for a while at most
  if (s.mealWaitFrom === undefined) s.mealWaitFrom = game.pathTick;
  if (BUSY.has(s.activity) && game.pathTick - s.mealWaitFrom < GAME_CONFIG.meals.finishJobSeconds * 60) return false;
  s.patrolTarget = null;
  const storage = findNearestStorage(s);
  if (!isAtStorage(s, storage)) { walkToStorage(s, storage, tick.dt); return true; }
  const look = foodLook();
  s.wantsMeal = false;
  s.mealWaitFrom = undefined;
  eatMeal(s);
  s.eating = { left: GAME_CONFIG.meals.eatSeconds, icon: look };
  return true;
}
