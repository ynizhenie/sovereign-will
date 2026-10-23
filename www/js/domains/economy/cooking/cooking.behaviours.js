// Cooking at a campfire: fuel, raw food in, food out

// ---- Cooking

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, onceThisTick } from '../../../engine/world/index.js';
import { fetchFromStorage, stock, takeStock } from '../../colony/storage/index.js';
import { hasAxeTool } from '../../colony/equipment/index.js';
import { playWorkSound } from '../../../app/index.js';
import { claimBuildingJob, isBuildingJobFree } from '../building/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { faceTowards, noteDay } from '../../colony/settlers/index.js';
import { isDefenseAlert } from '../../conflict/combat/index.js';
import { playSound } from '../../../app/index.js';

// A soldier (or archer) free to cook: on the ground, not on a tower, not steered by the player, and no
// enemy tent the player pointed at to go and destroy
function isSoldierCook(s) {
  return (s.role === 'soldier' || s.role === 'archer') && !s.isPossessed && !s.towerAssignment && !game.enemyTents.some(et => et.markedTarget);
}

// Enough soldiers free to cook at every campfire (between waves): the workers keep to their own work
const campfiresOnce = onceThisTick();
const soldiersCookOnce = onceThisTick();
function soldiersCoverFires(tick) {
  if (tick.isWaveActive || isDefenseAlert()) return false;
  // (#306) counted once a tick: it was counted again for every settler that came this way
  const fires = campfiresOnce(() => game.buildings.filter(b => b.type === 'campfire' && !b.campId).length);
  return fires > 0 && soldiersCookOnce(() => game.settlers.filter(isSoldierCook).length) >= fires;
}

// Campfire cooks (GAME_CONFIG.cooking): while there's raw food in the stock, a campfire is looked after,
// one cook per fire: idle soldiers first between waves, then a worker with no tool if no soldier is free
// for it (#200). It fetches fuel from the town hall when the fire is out, then a batch of
// raw food (as much as the fire will burn long enough for, #298: the fire burns its fuel down by itself),
// cooks it piece by piece and takes the food home. What it carries is ordinary stock (wood,
// raw meat...) marked with the fire it's for, so if it's called away (a wave) it just goes back in stock.
export function cook(s, tick) {
  if (s.isPossessed) return false;
  const cooking = GAME_CONFIG.cooking;
  const soldier = isSoldierCook(s);
  if (s.role !== 'worker' && !soldier) return false;
  if (s.role !== 'worker' && (tick.isWaveActive || isDefenseAlert())) return false; // to arms
  const job = s.carrying && s.carrying.forFire;
  // a boar the player marked comes before the fire: a soldier leaves the cooking to hunt it (#232); what
  // it was carrying for the fire goes back
  if (soldier && game.boars.some(b => b.priority > 0 && !b.isCarcass && !b.hidden)) {
    if (job) { stock[s.carrying.type] = (stock[s.carrying.type] || 0) + s.carrying.amount; s.carrying = null; }
    return false;
  }
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
    fire = game.buildings.filter(b => b.type === 'campfire' && !b.campId && isBuildingJobFree(b, 'cook', s) && isBuildingJobFree(b, 'light', s) &&
      ((b.fuelLeft || 0) > 0 || findFuel()))
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
    // (the pieces the fire has left in it: its fuel's time over a piece's)
    const pieces = Math.max(1, Math.floor(((fire.fuelLeft || 0) * cooking.fuelSeconds) / cooking.seconds));
    return fetchFromStorage(s, want, tick.dt, () => {
      const amount = takeStock(want, needsFuel ? 1 : Math.min(cooking.batch, pieces));
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
  fire.cookProgress = (fire.cookProgress || 0) + tick.dt / cooking.seconds;
  if (fire.cookProgress >= 1) {
    fire.cookProgress = 0;
    playSound('sizzle', fire);
    noteDay(s, 'cooked', 'cooked', 0.3); // (#279)
    load.amount--; // (the fuel: burning down by itself, tickCampfires)
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

// ---- Firewood (#199)

// A woodcutter with nothing to do (idle last tick), or any time the firewood is nearly out, chops firewood
// at a storage: takes up to perTrip wood and splits each into `makes` firewood in `seconds`, while the
// colony has a campfire and less firewood than `keep`. The wood is in its hands meanwhile. Once on its way
// it keeps going (chopTrip): it isn't idle any more, and it flickered between this and idle each tick (#261)
export function chopFirewood(s, tick) {
  const c = GAME_CONFIG.firewood;
  const load = s.carrying && s.carrying.forChop ? s.carrying : null;
  if (load && (tick.isWaveActive || s.isPossessed)) { stock.wood += load.amount; s.carrying = null; return false; }
  if (!load) {
    const can = s.role === 'worker' && hasAxeTool(s.tool) && !s.isPossessed && !s.carrying && !tick.isWaveActive &&
      game.buildings.some(b => b.type === 'campfire' && !b.campId) && stock.wood >= 1 && (stock.firewood || 0) < c.keep;
    if (!can || (!s.wasIdle && !s.chopTrip && (stock.firewood || 0) >= c.low)) { s.chopTrip = false; return false; }
    s.patrolTarget = null;
    s.chopTrip = fetchFromStorage(s, 'wood', tick.dt, () => { s.carrying = { type: 'wood', amount: takeStock('wood', c.perTrip), forChop: true }; s.chopTimer = 0; });
    return s.chopTrip;
  }
  // at the storage it took the wood from: split it there
  s.patrolTarget = null;
  s.working = 0.1;
  playWorkSound(s, 'chop', 0.5);
  s.chopTimer = (s.chopTimer || 0) + tick.dt;
  if (s.chopTimer >= c.seconds) {
    s.chopTimer = 0;
    load.amount--;
    stock.firewood = (stock.firewood || 0) + c.makes;
    if (load.amount <= 0) s.carrying = null;
  }
  return true;
}
