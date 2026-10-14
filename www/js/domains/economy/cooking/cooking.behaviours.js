// Cooking at a campfire: fuel, raw food in, food out

// ---- Cooking

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { fetchFromStorage, stock, takeStock } from '../../colony/storage/index.js';
import { claimBuildingJob, isBuildingJobFree } from '../building/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { faceTowards } from '../../colony/settlers/index.js';
import { isDefenseAlert } from '../../conflict/combat/index.js';

// A soldier (or archer) free to cook: on the ground, not on a tower, not steered by the player, and no
// enemy tent the player pointed at to go and destroy
function isSoldierCook(s) {
  return (s.role === 'soldier' || s.role === 'archer') && !s.isPossessed && !s.towerAssignment && !game.enemyTents.some(et => et.markedTarget);
}

// Enough soldiers free to cook at every campfire (between waves): the workers keep to their own work
function soldiersCoverFires(tick) {
  if (tick.isWaveActive || isDefenseAlert()) return false;
  const fires = game.buildings.filter(b => b.type === 'campfire').length;
  return fires > 0 && game.settlers.filter(isSoldierCook).length >= fires;
}

// Campfire cooks (GAME_CONFIG.cooking): while there's raw food in the stock, a campfire is looked after,
// one cook per fire: idle soldiers first between waves, then a worker with no tool if no soldier is free
// for it (#200). It fetches fuel from the town hall when the fire is out, then a batch of
// raw food, cooks it piece by piece and takes the food home. What it carries is ordinary stock (wood,
// raw meat...) marked with the fire it's for, so if it's called away (a wave) it just goes back in stock.
export function cook(s, tick) {
  if (s.isPossessed) return false;
  const cooking = GAME_CONFIG.cooking;
  const soldier = isSoldierCook(s);
  if (s.role !== 'worker' && !soldier) return false;
  if (s.role !== 'worker' && (tick.isWaveActive || isDefenseAlert())) return false; // to arms
  const job = s.carrying && s.carrying.forFire;
  // cooking is the idle soldiers' job between waves; workers' only where the soldiers don't cover every fire:
  // the free hands', and when the food runs low every worker's, tool in hand or in a wave too. "Low" leaves
  // room to hire with: meals for everyone plus GAME_CONFIG.cooking.hireReserve
  const workerNeeded = s.role === 'worker' && !soldiersCoverFires(tick);
  const freeHands = workerNeeded && s.tool === 'none' && s.weapon === 'fist' && !tick.isWaveActive;
  const runningLow = workerNeeded && stock.food < game.settlers.length * cooking.lowFood + cooking.hireReserve;
  if (!job && !soldier && !freeHands && !runningLow) return false;
  if (s.carrying && !job) return false; // carrying something else: deliver that first
  let fire = job && game.buildings.includes(job) ? job : null;
  if (!fire) {
    if (s.carrying) return false; // its fire is gone: deliverCarrying puts it back in the stock
    if (!cooking.raw.some(r => stock[r] > 0)) return false;
    fire = game.buildings.filter(b => b.type === 'campfire' && isBuildingJobFree(b, 'cook', s) && ((b.fuelLeft || 0) > 0 || findFuel()))
      .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    if (!fire) return false;
  }
  claimBuildingJob(fire, 'cook', s);
  s.patrolTarget = null;

  // empty-handed: fetch fuel if the fire is out, otherwise a batch of raw food (no more than the fuel
  // cooks), from the nearest storage
  if (!s.carrying) {
    const needsFuel = !(fire.fuelLeft > 0);
    const want = needsFuel ? findFuel() : cooking.raw.find(r => stock[r] > 0);
    if (!want) return false;
    return fetchFromStorage(s, want, tick.dt, () => {
      const amount = takeStock(want, needsFuel ? 1 : Math.min(cooking.batch, fire.fuelLeft));
      s.carrying = { type: want, amount, forFire: fire };
    });
  }

  // at the fire: put the fuel on, or cook what it brought one piece at a time
  if (Math.hypot(fire.x - s.x, fire.y - s.y) > 32) {
    moveEntityTowards(s, fire.x, fire.y, s.speed, false, tick.dt);
    return true;
  }
  const load = s.carrying;
  if (cooking.fuel[load.type]) {
    fire.fuelLeft = (fire.fuelLeft || 0) + cooking.fuel[load.type] * load.amount;
    s.carrying = null;
    return true;
  }
  if (!(fire.fuelLeft > 0)) {
    // out of fuel mid-batch: take the raw food back, fetch fuel next
    delete load.forFire;
    return false;
  }
  s.working = 0.1;
  faceTowards(s, fire.x, fire.y);
  fire.burning = 1; // drawn lit for a moment
  fire.cookProgress = (fire.cookProgress || 0) + tick.dt / cooking.seconds;
  if (fire.cookProgress >= 1) {
    fire.cookProgress = 0;
    fire.fuelLeft--;
    load.amount--;
    s.cooked = (s.cooked || 0) + cooking.makes;
    if (load.amount <= 0) {
      s.carrying = { type: cooking.dish[load.type] || 'cookedMeat', amount: s.cooked }; // home with it (deliverCarrying)
      s.cooked = 0;
    }
  }
  return true;
}

// The fuel the stock has, coal before wood (see GAME_CONFIG.cooking.fuel)
export function findFuel() {
  return Object.keys(GAME_CONFIG.cooking.fuel).find(f => stock[f] > 0) || null;
}
