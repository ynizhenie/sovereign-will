// The colony at night (#257). Settlers go to sleep at their shelters (a tent, a grave, a den; the town hall
// with none), hunger stopped till they wake, then hungry. Soldiers keep watch by halves (the first half of the
// night one half, then the other): walking the base's edge, or by a campfire if there's one; the rest sleep.
// A wave due at night: wakeSeconds before it, everyone's woken. Awake out of the light, a settler fetches a
// crafted torch for the night, its tool or weapon on its back; with no torch for one, it keeps to the base.
// Torch posts are lit at dusk by a worker (postFirewood); a woodcutter gets firewood for the campfires.

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { TILE_SIZE, game, townHall } from '../../../engine/world/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { fetchFromStorage, findNearestStorage, getFreeStock, isAtStorage, moveSettlerToTownHall, stock, takeStock, walkToStorage } from '../storage/index.js';
import { getBaseRadius, isDefenseAlert } from '../../conflict/combat/index.js';
import { getPlayerFaction } from '../../factions/index.js';
import { getLights, getDayPhase, isNight, nightProgress } from '../../world/index.js';
import { faceTowards } from './settlers.draw.js';
import { says, someoneSays } from './settlers.voices.js';
import { hasPlayerOrderFor } from './settlers.corpses.js';
import { freeCampfireSeat } from './settlers.idle.js';
import { playSound, playWorkSound } from '../../../app/index.js';

const config = () => GAME_CONFIG.daytime;
const isFighter = s => (s.role === 'soldier' || s.role === 'archer') && !s.towerAssignment;
// a faction with firewood needs torches at night (the undead see in the dark)
export const needsTorches = () => !!GAME_CONFIG.resources.firewood.factions && GAME_CONFIG.resources.firewood.factions.includes(getPlayerFaction().id);

// Its watch: the fighters by id, half on in the first half of the night, the other half in the second
export function onWatch(s) {
  if (!isNight() || !isFighter(s)) return false;
  const fighters = game.settlers.filter(isFighter).sort((a, b) => a.id - b.id);
  const k = fighters.indexOf(s);
  return k >= 0 && (k % 2 === 0) === (nightProgress() < 0.5);
}

// The one up getting firewood for the night (a woodcutter, while a soldier's on watch to guard it)
export function onFuelDuty(s) {
  if (!isNight() || !needsTorches() || (stock.firewood || 0) >= 1) return false;
  if (!game.buildings.some(b => b.type === 'torch' || b.type === 'campfire')) return false;
  if (!game.settlers.some(o => onWatch(o))) return false;
  const cutter = game.settlers.filter(o => o.role === 'worker' && getDefinition('tools', o.tool) && getDefinition('tools', o.tool).family === 'axe' && !o.isPossessed).sort((a, b) => a.id - b.id)[0];
  return cutter === s;
}

// How far a settler may go now: at night with no torch to be had, only the base (#257)
export function nightReach(s) {
  if (!isNight() || !needsTorches() || (s && (s.torchInHand || onFuelDuty(s)))) return Infinity;
  return getFreeStock('torches') > 0 ? Infinity : getBaseRadius() + TILE_SIZE;
}

// Each tick: a new night counted, the morning puts torches out; who's awake out of the light takes a torch
export function tickNight() {
  if (game.gameMode !== 'endless') return;
  const night = isNight();
  if (night && !game.wasNight) { game.nightId = (game.nightId || 0) + 1; playSound('owl'); } // (#252)
  if (!night && game.wasNight) {
    playSound('dawn');
    someoneSays(game.settlers, getPlayerFaction().id, 'morning'); // (#252)
    for (const b of game.buildings) if (b.type === 'torch') b.lit = false;
    for (const s of game.settlers) {
      s.torchInHand = false;
      s.torchPickup = false;
      s.today = {}; // (a new day to tell of, #279)
      // awake: hungry (#257: hunger stood still in its sleep)
      if (s.asleep) { s.asleep = false; if (getPlayerFaction().eats) s.hunger = Math.min(s.hunger ?? 1, 1); }
    }
  }
  game.wasNight = night;
}

// Settlers awake outside the light go to a storage for a crafted torch before heading back out.
export function fetchNightTorch(s, tick) {
  if (!isNight() || !needsTorches() || s.asleep || s.torchInHand || s.torchNight === game.nightId ||
    s.isPossessed || s.carrying || !(onWatch(s) || onFuelDuty(s) || waveDue() || upForTents(s) || s.drowsy || s.temporary !== undefined)) return false;
  if (!s.torchPickup) {
    const lit = getLights().some(l => l.r > 0 && Math.hypot(l.x - s.x, l.y - s.y) < l.r * 0.8);
    if (lit || !(getFreeStock('torches') > 0)) return false;
    s.torchPickup = true;
  }
  if (!(getFreeStock('torches') > 0)) { s.torchPickup = false; return false; }
  const storage = findNearestStorage(s);
  s.patrolTarget = null;
  if (!isAtStorage(s, storage)) {
    walkToStorage(s, storage, tick.dt);
    return true;
  }
  if (takeStock('torches', 1) !== 1) { s.torchPickup = false; return false; }
  s.torchPickup = false;
  s.torchInHand = true;
  s.torchNight = game.nightId;
  playSound('ignite', s);
  return true;
}

// A wave coming at night: everyone woken (wakeSeconds before it)
function waveDue() {
  return game.waveTimer <= config().wakeSeconds || isDefenseAlert() || game.enemies.length > 0;
}

// (#279) the enemy's tents or portals still standing at night: the soldiers stay up to go and break them, or
// with no soldiers, everyone
function upForTents(s) {
  if (!game.enemyTents.length && !game.enemyTentBlueprints.length) return false;
  return isFighter(s) || !game.settlers.some(isFighter);
}

// (#279) the player ordered something done at night (a build, a resource or a boar marked): one it's for
// stays up to do it, slowly (drowsy, half its pace) and grumbling it wants to sleep
function upForOrder(s, tick) {
  if (s.isPossessed) return false;
  if (s.drowsy && s.carrying) return true; // (what it was bringing, first)
  // torch posts alone: a soldier on watch builds those (build), no one's got up for them
  if (s.role === 'worker' && game.blueprints.length && game.blueprints.every(bp => bp.type === 'torch') &&
    !tick.markedResources.some(r => (r.priority || 0) > 0) && game.settlers.some(onWatch)) return false;
  return hasPlayerOrderFor(s, tick) && nightCrew(tick).has(s);
}

// (#279) who's up for the player's orders at night: one for each, not everyone. For each blueprint and
// each marked thing, the nearest one fit for it (a worker to build; one with the tool it needs for a
// resource; a fighter for a boar), one already up first. Worked out once a tick
/** @type {{ tick: number, crew: Set<object> }} */
let crewCache = { tick: -1, crew: new Set() };
function nightCrew(tick) {
  if (crewCache.tick === game.pathTick) return crewCache.crew;
  const crew = new Set();
  const free = game.settlers.filter(o => !o.isPossessed && !onWatch(o) && o.temporary === undefined); // (one bringing what's needed for it, too)
  const fits = (o, need) => {
    if (need === 'boar') return isFighter(o);
    if (o.role !== 'worker') return false;
    if (!need) return true;
    const tool = getDefinition('tools', o.tool);
    return !!tool && (tool.family || o.tool) === need;
  };
  const take = (x, y, need) => {
    const pick = free.filter(o => !crew.has(o) && fits(o, need))
      .sort((a, b) => (a.asleep ? 1 : 0) - (b.asleep ? 1 : 0) || Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (pick) crew.add(pick);
  };
  for (const bp of game.blueprints) take(bp.x, bp.y, null);
  for (const r of tick.markedResources) {
    if (!((r.priority || 0) > 0)) continue;
    if (game.boars.includes(r)) { take(r.x, r.y, 'boar'); continue; }
    const def = GAME_CONFIG.mapResources[tick.resourceKind.get(r)];
    take(r.x, r.y, def ? def.tool || null : null);
  }
  crewCache = { tick: game.pathTick, crew };
  return crew;
}

// The shelter it sleeps at: the nearest of its faction's homes, or the town hall
function shelterFor(s) {
  const homes = game.buildings.filter(b => { const def = getDefinition('buildings', b.type) || {}; return def.population || def.healPerSecond; });
  return homes.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0] || townHall;
}

// At night (a behaviour, early): to bed, unless on watch, on fuel duty, possessed or with a wave coming
export function sleepAtNight(s, tick) {
  const ordered = isNight() && !waveDue() && !onWatch(s) && !onFuelDuty(s) && upForOrder(s, tick);
  s.drowsy = ordered;
  if (ordered && !s.asleep && game.pathTick - (s.grumbledAt || -1e9) > 60 * 25 && says(s, 'sleepy')) s.grumbledAt = game.pathTick; // (once said, not again for a while)
  const awake = !isNight() || waveDue() || s.isPossessed || onWatch(s) || onFuelDuty(s) || s.temporary !== undefined || upForTents(s) || ordered;
  if (awake) {
    s.sleepSpot = null; // (a new one when it goes to bed again, from where it is then)
    if (s.asleep) {
      s.asleep = false;
      if (isNight() && waveDue()) { s.orderBubble = { icon: 'warn', until: game.pathTick + 120 }; playSound('alarm'); } // (woken for the wave)
      if (getPlayerFaction().eats) s.hunger = Math.min(s.hunger ?? 1, 1);
    }
    // on watch: walking the edge, or by the campfire (its pastime for the night)
    if (onWatch(s) && !tick.isWaveActive && (!s.idle || (s.idle.act !== 'patrolEdge' && s.idle.act !== 'campfire'))) {
      const free = s.id % 2 ? freeCampfireSeat(s) : null; // (#298: a seat at it free, or on patrol)
      s.idle = free ? { act: 'campfire', left: 999, spot: { x: free.fire.x, y: free.fire.y }, partnerId: null, seat: free.seat } : { act: 'patrolEdge', left: 999, spot: null, partnerId: null };
    }
    return false;
  }
  if (s.carrying || tick.isWaveActive) return false; // (its load home first)
  const home = shelterFor(s);
  s.patrolTarget = null;
  // (#279) a corpse lying by where it sleeps: taken away first (carryCorpse takes it on to the heap)
  if (!s.asleep && clearSleepingPlace(s, home, tick)) return true;
  // round its shelter, each its own place
  const sleepers = game.settlers.filter(o => o.asleep && o.sleepAt === home).length;
  if (!s.sleepSpot || s.sleepAt !== home) {
    // (out past its tile's edge: a body can't get into the building), on the side it comes from (#279: a
    // place by its id could be round the far side of the town hall, and it stood at the hall's wall)
    const a = Math.atan2(s.y - home.y, s.x - home.x) + ((s.id % 5) - 2) * 0.25, r = (home === townHall ? townHall.radius + 14 : 32) + (sleepers % 3) * 4;
    s.sleepSpot = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
    s.sleepAt = home;
  }
  if (Math.hypot(s.sleepSpot.x - s.x, s.sleepSpot.y - s.y) > 12) {
    if (home === townHall && Math.hypot(townHall.x - s.x, townHall.y - s.y) > townHall.radius + 40) moveSettlerToTownHall(s, s.speed, tick.dt);
    else moveEntityTowards(s, s.sleepSpot.x, s.sleepSpot.y, s.speed, false, tick.dt);
    return true;
  }
  if (!s.asleep && Math.random() < 0.3) says(s, 'sleep'); // (#252)
  s.asleep = true;
  // sleep mends it (#279): as its shelter would (the town hall: sleepHealPerSecond)
  const mend = (getDefinition('buildings', home.type) || {}).healPerSecond || config().sleepHealPerSecond;
  if (s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + mend * tick.dt);
  playWorkSound(s, 'snore', 3 + (s.id % 3)); // (#252)
  return true;
}

// A corpse by its shelter (within sleepCorpseTiles), no one else going for it: it goes and picks it up.
// True while it does
function clearSleepingPlace(s, home, tick) {
  const reach = config().sleepCorpseTiles * TILE_SIZE;
  const taken = new Set(game.settlers.filter(o => o !== s).map(o => o.corpseTarget).filter(Boolean));
  let corpse = s.corpseTarget && game.corpses.includes(s.corpseTarget) ? s.corpseTarget : null;
  if (!corpse) corpse = game.corpses.filter(c => !taken.has(c) && Math.hypot(c.x - home.x, c.y - home.y) < reach)
    .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0] || null;
  s.corpseTarget = corpse;
  if (!corpse) return false;
  if (Math.hypot(corpse.x - s.x, corpse.y - s.y) > 14) { moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt); return true; }
  game.corpses.splice(game.corpses.indexOf(corpse), 1);
  s.carrying = { type: 'corpse', amount: 1, corpse };
  s.corpseTarget = null;
  s.haulWalk = 0;
  return true;
}

// At dusk and through the night, a worker lights the torch posts (postFirewood each)
export function lightTorches(s, tick) {
  if (!needsTorches() || s.role !== 'worker' || s.isPossessed || tick.isWaveActive || s.asleep) return false;
  const phase = getDayPhase();
  if (phase !== 'evening' && phase !== 'night') return false;
  const load = s.carrying && s.carrying.forTorch ? s.carrying : null;
  const want = b => b.type === 'torch' && !b.lit && !game.settlers.some(o => o !== s && o.carrying && o.carrying.forTorch === b);
  if (!load) {
    if (s.carrying || (stock.firewood || 0) < config().postFirewood) return false;
    const post = game.buildings.filter(want).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    if (!post || game.settlers.some(o => o !== s && o.torchTarget === post)) return false;
    s.torchTarget = post;
    s.patrolTarget = null;
    return fetchFromStorage(s, 'firewood', tick.dt, () => { s.carrying = { type: 'firewood', amount: takeStock('firewood', config().postFirewood), forTorch: post }; s.torchTarget = null; });
  }
  const post = load.forTorch;
  if (!game.buildings.includes(post) || post.lit) { delete load.forTorch; return false; } // (back to the stock)
  s.patrolTarget = null;
  if (Math.hypot(post.x - s.x, post.y - s.y) > 26) { moveEntityTowards(s, post.x, post.y, s.speed, false, tick.dt); return true; }
  faceTowards(s, post.x, post.y);
  post.lit = true;
  playSound('ignite', post);
  s.carrying = null;
  return true;
}
