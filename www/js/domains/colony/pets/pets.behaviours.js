// (#314) Pets: each faction's own unit for hire (GAME_CONFIG.pets): the humans' dog, the demons' hellhound
// (a beast), the undead's ghost. They live in game.settlers like the rest, but on their own ways (tickPet):
// - a dog / a beast: keeps by the nearest soldier (the hall, with none), goes for an enemy near it, gets
//   hungry and is fed by a settler (feedPet), sleeps now and then with no enemy about; a dog flushes a boar
//   hidden in the grass, a beast eats a corpse by itself;
// - a ghost: hovers by a grave, goes with a necromancer to a fight, flies into an enemy (it panics), and is
//   gone a while, back by a grave. It can't be hurt.
// Possessed, they move by hand and take their own orders (a bite, a corpse, a dive).

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, rand, townHall } from '../../../engine/world/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { faceTowards, petKindOf, playerControlled } from '../settlers/index.js';
import { fetchFromStorage, stock, takeStock } from '../storage/index.js';
import { getWeaponStats } from '../equipment/index.js';
import { performAttack } from '../../conflict/combat/index.js';
import { shakeMorale } from '../../conflict/morale/index.js';
import { makeBoarFlee } from '../../economy/hunting/index.js';
import { playSound } from '../../../app/index.js';

const config = () => GAME_CONFIG.pets;

export const isPetHungry = pet => (pet.petHunger || 0) >= 1;

// Enemies about: those alive within r of (x, y)
const foesNear = (x, y, r) => game.enemies.filter(en => en.hp > 0 && !en.crumbled && Math.hypot(en.x - x, en.y - y) <= r);
const nearest = (list, o) => list.reduce((best, x) => (!best || Math.hypot(x.x - o.x, x.y - o.y) < Math.hypot(best.x - o.x, best.y - o.y) ? x : best), null);

// Straight there, through anything (a ghost)
function fly(s, x, y, speed) {
  const d = Math.hypot(x - s.x, y - s.y), step = speed * GAME_CONFIG.movementScale;
  if (d < 0.5) return true;
  faceTowards(s, x, y);
  if (d <= step) { s.x = x; s.y = y; return true; }
  s.x += (x - s.x) / d * step; s.y += (y - s.y) / d * step;
  return false;
}

// One tick of a pet; sets what it's doing (s.activity)
export function tickPet(s, tick) {
  const kind = petKindOf(s);
  s.isIdle = false;
  if (kind !== 'ghost') {
    s.petHunger = (s.petHunger || 0) + tick.dt / config().hungerSeconds * (s.petSleep > 0 ? 0.5 : 1);
    s.petHungry = isPetHungry(s);
  }
  if (s.isPossessed) { s.petSleep = 0; playerControlled(s, tick); s.activity = 'playerControlled'; return; }
  if (kind === 'ghost') { s.activity = tickGhost(s, tick); return; }
  s.activity = tickBeast(s, tick, kind);
}

// ---- A dog, a beast

function tickBeast(s, tick, kind) {
  const c = config(), speed = s.speed * (s.petHungry ? c.hungryPace : 1);
  const keeper = nearest(game.settlers.filter(o => (o.role === 'soldier' || o.role === 'archer') && !o.leaving && o.hp > 0), s);
  const anchor = keeper && Math.hypot(keeper.x - s.x, keeper.y - s.y) < 20 * TILE_SIZE ? keeper : townHall;
  const guard = c.guardTiles * TILE_SIZE;
  const foe = nearest([...foesNear(s.x, s.y, guard), ...(anchor !== townHall ? foesNear(anchor.x, anchor.y, guard) : [])], s);
  // asleep: till an enemy comes near or a wave's on
  if (s.petSleep > 0) {
    if (foe || tick.isWaveActive) s.petSleep = 0;
    else { s.petSleep -= tick.dt; return 'petSleep'; }
  }
  // an enemy near: at it, and bite
  if (foe) {
    const bite = getWeaponStats(s, 'combat');
    if (Math.hypot(foe.x - s.x, foe.y - s.y) > bite.approach + foe.radius) moveEntityTowards(s, foe.x, foe.y, speed, false, tick.dt);
    else performAttack(s, foe.x, foe.y);
    return 'petFight';
  }
  // a beast, hungry: a corpse
  if (kind === 'beast' && s.petHungry) {
    const corpse = nearest(game.corpses.filter(co => Math.hypot(co.x - s.x, co.y - s.y) < 12 * TILE_SIZE && !co.raising), s);
    if (corpse && devour(s, corpse, tick)) return 'petDevour';
  }
  // a dog: a boar hidden in the grass, flushed out (the hunters see it and go after it)
  if (kind === 'dog' && !s.petHungry && game.pathTick >= (s.flushAfter || 0)) {
    const hidden = nearest(game.boars.filter(b => !b.isCarcass && (b.hidden || b.hideTarget) && Math.hypot(b.x - s.x, b.y - s.y) < c.flushTiles * TILE_SIZE), s);
    if (hidden) {
      if (Math.hypot(hidden.x - s.x, hidden.y - s.y) > 26) { moveEntityTowards(s, hidden.x, hidden.y, speed, false, tick.dt); return 'petFlush'; }
      Object.assign(hidden, { hidden: false, hideTarget: null, hideTimer: 0 });
      makeBoarFlee(hidden, s.x, s.y, false);
      playSound('bark', s);
      s.flushAfter = game.pathTick + c.flushSeconds * 60;
      return 'petFlush';
    }
  }
  // by its keeper (a place of its own round it)
  const a = (s.id * 2.399) % (Math.PI * 2), r = anchor === townHall ? townHall.radius + 26 : c.followTiles * TILE_SIZE;
  const spot = { x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r };
  if (Math.hypot(spot.x - s.x, spot.y - s.y) > 24) { moveEntityTowards(s, spot.x, spot.y, speed, false, tick.dt); return 'petFollow'; }
  // nothing about: now and then a sleep
  if (!tick.isWaveActive && rand() < c.sleepChance * tick.dt) s.petSleep = c.sleepSeconds[0] + rand() * (c.sleepSeconds[1] - c.sleepSeconds[0]);
  s.isIdle = true;
  return 'petRest';
}

// A beast at a corpse: eats it (devourSeconds), and it's gone; fed, and a little healed. False once it can't
export function devour(s, corpse, tick) {
  if (!game.corpses.includes(corpse)) { s.devouring = 0; return false; }
  if (Math.hypot(corpse.x - s.x, corpse.y - s.y) > 16) { moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt); return true; }
  faceTowards(s, corpse.x, corpse.y);
  s.working = 0.1; s.workKind = 'devour';
  s.devouring = (s.devouring || 0) + tick.dt;
  if (s.devouring < config().devourSeconds) return true;
  s.devouring = 0;
  game.corpses.splice(game.corpses.indexOf(corpse), 1);
  s.petHunger = 0; s.petHungry = false;
  s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.3);
  playSound('eat', s);
  return false;
}

// ---- A ghost

// The graves it's kept by (the graveyard itself, with none)
const ghostHomes = () => {
  const graves = game.buildings.filter(b => b.type === 'grave');
  return graves.length ? graves : [townHall];
};

function tickGhost(s, tick) {
  const g = config().ghost;
  // gone: back by a grave after a while
  if (s.ghostGone > 0) {
    s.ghostGone -= tick.dt;
    if (s.ghostGone <= 0) {
      const home = ghostHomes()[Math.floor(rand() * ghostHomes().length)];
      s.x = home.x + (rand() - 0.5) * 30; s.y = home.y - 10 + (rand() - 0.5) * 20; s.ghostGone = 0;
    }
    return 'ghostGone';
  }
  // with a necromancer going to a fight (an enemy near it, or a wave on): at most `carry` to one
  const necros = game.settlers.filter(o => o.tool === 'necro_staff' && o.hp > 0 && !o.leaving);
  const fighting = n => tick.isWaveActive || foesNear(n.x, n.y, 12 * TILE_SIZE).length > 0;
  if (s.escort && (!necros.includes(s.escort) || !fighting(s.escort))) s.escort = null;
  if (!s.escort) {
    const taken = n => game.settlers.filter(o => o !== s && o.escort === n).length;
    s.escort = nearest(necros.filter(n => fighting(n) && taken(n) < g.carry), s);
  }
  // an enemy near it (or its necromancer): into it
  const reach = g.diveTiles * TILE_SIZE;
  const foe = nearest([...foesNear(s.x, s.y, reach), ...(s.escort ? foesNear(s.escort.x, s.escort.y, reach) : [])].filter(en => !en.panic), s);
  if (foe) {
    if (fly(s, foe.x, foe.y, g.diveSpeed) || Math.hypot(foe.x - s.x, foe.y - s.y) < foe.radius + s.radius + 4) haunt(s, foe);
    return 'ghostDive';
  }
  // hovering round its necromancer, or its grave
  const homes = ghostHomes(), home = s.escort || homes[Math.floor(Math.abs(s.id)) % homes.length];
  const t = game.pathTick / 60 + s.id;
  fly(s, home.x + Math.cos(t * 0.8) * 26, home.y - 12 + Math.sin(t * 1.1) * 14, s.speed * 0.6);
  s.isIdle = !s.escort;
  return s.escort ? 'ghostEscort' : 'ghostHover';
}

// Into an enemy: it panics at once; the ghost is gone a while
export function haunt(s, foe) {
  shakeMorale(foe, 9999, 'enemy', true);
  s.ghostGone = config().ghost.backSeconds;
  s.escort = null;
  playSound('ghost', foe);
}

// ---- Fed by a settler

// A worker with nothing better to do takes a pet's food from the stock and gives it (one at a time to a pet)
export function feedPet(s, tick) {
  if (s.role !== 'worker' || s.isPossessed || s.leaving || tick.isWaveActive || petKindOf(s)) return false;
  const carryingFood = s.carrying && s.carrying.forPet;
  let pet = s.feeding;
  if (pet && (!game.settlers.includes(pet) || !isPetHungry(pet))) {
    if (carryingFood) { stock[s.carrying.type] = (stock[s.carrying.type] || 0) + s.carrying.amount; s.carrying = null; }
    s.feeding = null; pet = null;
  }
  if (!pet) {
    if (s.carrying) return false;
    const food = config().foods.find(id => (stock[id] || 0) >= 1);
    const fed = new Set(game.settlers.filter(o => o.feeding).map(o => o.feeding));
    pet = food ? nearest(game.settlers.filter(o => isPetHungry(o) && !fed.has(o) && !o.isPossessed && petKindOf(o) !== 'ghost'), s) : null;
    if (!pet) return false;
    s.feeding = pet;
  }
  if (!(s.carrying && s.carrying.forPet)) {
    const food = config().foods.find(id => (stock[id] || 0) >= 1);
    if (!food) { s.feeding = null; return false; }
    fetchFromStorage(s, food, tick.dt, () => { s.carrying = { type: food, amount: takeStock(food, 1), forPet: pet }; });
    return true;
  }
  if (Math.hypot(pet.x - s.x, pet.y - s.y) > 22) { moveEntityTowards(s, pet.x, pet.y, s.speed, false, tick.dt); return true; }
  faceTowards(s, pet.x, pet.y);
  pet.petHunger = 0; pet.petHungry = false; pet.petSleep = 0;
  s.carrying = null; s.feeding = null;
  playSound('eat', pet);
  return true;
}
