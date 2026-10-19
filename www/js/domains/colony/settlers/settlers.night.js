// The colony at night (#257). Settlers go to sleep at their shelters (a tent, a grave, a den; the town hall
// with none), hunger stopped till they wake, then hungry. Soldiers keep watch by halves (the first half of the
// night one half, then the other): walking the base's edge, or by a campfire if there's one; the rest sleep.
// A wave due at night: wakeSeconds before it, everyone's woken. Awake out of the light, a settler takes a
// torch in hand for the night (torchFirewood), its tool or weapon on its back; with no firewood for one, it
// keeps to the base. Torch posts are lit at dusk by a worker (postFirewood). With no firewood at all for the
// fires and torches, one woodcutter stays up to get more, while a soldier keeps watch to guard it.

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { TILE_SIZE, game, townHall } from '../../../engine/world/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { fetchFromStorage, moveSettlerToTownHall, stock, takeStock } from '../storage/index.js';
import { getBaseRadius, isDefenseAlert } from '../../conflict/combat/index.js';
import { getPlayerFaction } from '../../factions/index.js';
import { getLights, getDayPhase, isNight, nightProgress } from '../../world/index.js';
import { faceTowards } from './settlers.draw.js';

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
  return (stock.firewood || 0) >= config().torchFirewood ? Infinity : getBaseRadius() + TILE_SIZE;
}

// Each tick: a new night counted, the morning puts torches out; who's awake out of the light takes a torch
export function tickNight() {
  if (game.gameMode !== 'endless') return;
  const night = isNight();
  if (night && !game.wasNight) game.nightId = (game.nightId || 0) + 1;
  if (!night && game.wasNight) {
    for (const b of game.buildings) if (b.type === 'torch') b.lit = false;
    for (const s of game.settlers) {
      s.torchInHand = false;
      // awake: hungry (#257: hunger stood still in its sleep)
      if (s.asleep) { s.asleep = false; if (getPlayerFaction().eats) s.hunger = Math.min(s.hunger ?? 1, 1); }
    }
  }
  game.wasNight = night;
  if (!night || !needsTorches()) return;
  const lights = getLights().filter(l => l.r > 0);
  for (const s of game.settlers) {
    if (s.asleep || s.torchInHand || s.torchNight === game.nightId) continue;
    // only one staying up (on watch, on fuel duty, or with a wave due): not one on its way to bed
    if (!(onWatch(s) || onFuelDuty(s) || waveDue())) continue;
    const lit = lights.some(l => Math.hypot(l.x - s.x, l.y - s.y) < l.r * 0.8);
    if (lit || s.isPossessed) continue;
    if ((stock.firewood || 0) < config().torchFirewood) continue;
    takeStock('firewood', config().torchFirewood);
    s.torchInHand = true;
    s.torchNight = game.nightId;
  }
}

// A wave coming at night: everyone woken (wakeSeconds before it)
function waveDue() {
  return game.waveTimer <= config().wakeSeconds || isDefenseAlert() || game.enemies.length > 0;
}

// The shelter it sleeps at: the nearest of its faction's homes, or the town hall
function shelterFor(s) {
  const homes = game.buildings.filter(b => { const def = getDefinition('buildings', b.type) || {}; return def.population || def.healPerSecond; });
  return homes.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0] || townHall;
}

// At night (a behaviour, early): to bed, unless on watch, on fuel duty, possessed or with a wave coming
export function sleepAtNight(s, tick) {
  const awake = !isNight() || waveDue() || s.isPossessed || onWatch(s) || onFuelDuty(s) || s.temporary !== undefined;
  if (awake) {
    if (s.asleep) {
      s.asleep = false;
      if (isNight() && waveDue()) s.orderBubble = { icon: 'warn', until: game.pathTick + 120 }; // (woken for the wave)
      if (getPlayerFaction().eats) s.hunger = Math.min(s.hunger ?? 1, 1);
    }
    // on watch: walking the edge, or by the campfire (its pastime for the night)
    if (onWatch(s) && !tick.isWaveActive && (!s.idle || (s.idle.act !== 'patrolEdge' && s.idle.act !== 'campfire'))) {
      const fire = game.buildings.find(b => b.type === 'campfire');
      s.idle = fire && s.id % 2 ? { act: 'campfire', left: 999, spot: { x: fire.x, y: fire.y }, partnerId: null } : { act: 'patrolEdge', left: 999, spot: null, partnerId: null };
    }
    return false;
  }
  if (s.carrying || tick.isWaveActive) return false; // (its load home first)
  const home = shelterFor(s);
  s.patrolTarget = null;
  // round its shelter, each its own place
  const sleepers = game.settlers.filter(o => o.asleep && o.sleepAt === home).length;
  if (!s.sleepSpot || s.sleepAt !== home) {
    // (out past its tile's edge: a body can't get into the building)
    const a = (s.id * 2.4) % (Math.PI * 2), r = (home === townHall ? townHall.radius + 14 : 32) + (sleepers % 3) * 4;
    s.sleepSpot = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
    s.sleepAt = home;
  }
  if (Math.hypot(s.sleepSpot.x - s.x, s.sleepSpot.y - s.y) > 12) {
    if (home === townHall && Math.hypot(townHall.x - s.x, townHall.y - s.y) > townHall.radius + 40) moveSettlerToTownHall(s, s.speed, tick.dt);
    else moveEntityTowards(s, s.sleepSpot.x, s.sleepSpot.y, s.speed, false, tick.dt);
    return true;
  }
  s.asleep = true;
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
  s.carrying = null;
  return true;
}
