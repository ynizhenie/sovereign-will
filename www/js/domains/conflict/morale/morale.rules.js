// Morale and panic (#207): everyone has it (settlers, enemies, boars), 0..max. Hits, an ally falling close
// by, being outnumbered and a wave losing most of its number shake it; a foe falling close by, quiet and an
// own tent lift it. Below panicBelow a unit panics until it's back above calmAbove (what it does then:
// morale.behaviours.js). How steady each side is depends on its faction (GAME_CONFIG.morale).

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, townHall } from '../../../engine/world/index.js';
import { countNear } from '../../../engine/movement/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../factions/index.js';
import { getNecromancy } from '../../factions/undead/index.js';
import { getEnemyDef } from '../waves/index.js';

const config = () => GAME_CONFIG.morale;

// whose a unit is: 'settler', 'enemy' or 'boar'
function sideOf(unit) {
  if (game.settlers.includes(unit)) return 'settler';
  if (game.enemies.includes(unit)) return 'enemy';
  return 'boar';
}

function factionOf(unit, side = sideOf(unit)) {
  if (side === 'settler') return getPlayerFaction().id;
  if (side === 'enemy') return getEnemyFaction().id;
  return 'boar';
}

// Where a unit's morale starts and settles back to: its faction's, lower for the humans against demons or
// the undead
export function baseMorale(unit, side = sideOf(unit)) {
  const c = config();
  const faction = factionOf(unit, side);
  const foe = side === 'settler' ? getEnemyFaction().id : side === 'enemy' ? getPlayerFaction().id : null;
  return (c.base[faction] ?? c.base.humans) + ((c.scaryFoes[faction] || {})[foe] || 0);
}

export function getMorale(unit) {
  if (unit.morale === undefined) unit.morale = baseMorale(unit);
  return unit.morale;
}

// An undead unit near a living necromancer of its side keeps its morale (the necromancer's own too)
function heldByNecromancer(unit, side) {
  if (factionOf(unit, side) !== 'undead') return false;
  const range = config().necroRange;
  const allies = side === 'settler' ? game.settlers : game.enemies;
  const isNecro = side === 'settler' ? s => !!getNecromancy(s) : en => !!getEnemyDef(en).necromancer;
  return allies.some(a => a.hp > 0 && isNecro(a) && Math.hypot(a.x - unit.x, a.y - unit.y) <= range);
}

// below panicBelow: panic, until back at calmAbove (or its own base, if that's lower: the undead's)
function setMorale(unit, value, side = sideOf(unit)) {
  const c = config();
  unit.morale = Math.max(0, Math.min(c.max, value));
  if (unit.morale < c.panicBelow) unit.panic = true;
  else if (unit.panic && unit.morale >= Math.min(c.calmAbove, baseMorale(unit, side))) unit.panic = false;
}

// (everyone: the armed take it whole too — a wave falling apart)
export function shakeMorale(unit, amount, side = sideOf(unit), everyone = false) {
  if (game.gameMode === 'menu' || heldByNecromancer(unit, side)) return;
  const armed = !everyone && side !== 'boar' && unit.weapon && unit.weapon !== 'fist';
  setMorale(unit, getMorale(unit) - amount * (armed ? config().armedShare : 1), side);
}

export function liftMorale(unit, amount, side = sideOf(unit)) {
  setMorale(unit, getMorale(unit) + amount, side);
}

// A hit: a little each, a lot more as it falls below lowHpShare of its health
export function shakeOnHit(unit) {
  const c = config();
  const low = unit.maxHp > 0 && unit.hp < unit.maxHp * c.lowHpShare;
  shakeMorale(unit, c.hit + (low && !unit.wasLow ? c.lowHp : 0));
  if (low) unit.wasLow = true;
}

// Someone fell: its side close by is shaken, the other side heartened (demons the more)
export function onUnitDeath(unit, side) {
  const c = config();
  const near = list => list.filter(o => o !== unit && o.hp > 0 && Math.hypot(o.x - unit.x, o.y - unit.y) <= c.nearRange);
  const own = side === 'settler' ? game.settlers : side === 'enemy' ? game.enemies : game.boars.filter(b => !b.isCarcass);
  const foes = side === 'settler' ? game.enemies : side === 'enemy' ? game.settlers : [];
  near(own).forEach(o => shakeMorale(o, c.allyDeath, side === 'boar' ? 'boar' : side));
  const foeSide = side === 'settler' ? 'enemy' : 'settler';
  near(foes).forEach(o => liftMorale(o, factionOf(o, foeSide) === 'demons' ? c.foeDeath * 2 : c.foeDeath, foeSide));
}

// A wave that's lost routShare of its number: everyone left of it is shaken hard, most will run
function checkRout() {
  const c = config();
  if (game.waveRouted || !game.waveSize) return;
  const left = game.enemies.filter(en => en.fromWave).length;
  if (left > 0 && left <= game.waveSize * (1 - c.routShare) + 1e-9) { // (1 - 0.8 is a hair under 0.2)
    game.waveRouted = true;
    game.enemies.filter(en => en.fromWave).forEach(en => shakeMorale(en, c.rout, 'enemy', true));
  }
}

// Every step: outnumbered units are shaken, quiet ones settle back towards their base; the necromancer's
// undead hold
export function tickMorale(dt) {
  if (game.gameMode === 'menu') return;
  const c = config();
  checkRout();
  /** @type {[string, any[], any[]][]} */
  const groups = [['settler', game.settlers, game.enemies], ['enemy', game.enemies, game.settlers], ['boar', game.boars.filter(b => !b.isCarcass), game.settlers]];
  for (const [side, units, foes] of groups) {
    for (const unit of units) {
      if (unit.morale === undefined) unit.morale = baseMorale(unit, side);
      if (heldByNecromancer(unit, side)) { setMorale(unit, Math.max(unit.morale, baseMorale(unit, side)), side); continue; }
      // a panic passes by itself, foes about or not
      if (unit.panic) { setMorale(unit, unit.morale + c.panicRecoverPerSecond * dt, side); continue; }
      const foesNear = side === 'boar' ? 0 : countNear(foes, unit.x, unit.y, c.nearRange, o => o.hp > 0);
      if (foesNear > 0 && foesNear > (countNear(units, unit.x, unit.y, c.nearRange, o => o.hp > 0) + 1) * c.outnumbered) {
        shakeMorale(unit, c.outnumberedPerSecond * dt, side);
      } else if (foesNear === 0) {
        const base = baseMorale(unit, side);
        const atHome = side === 'settler' && Math.hypot(townHall.x - unit.x, townHall.y - unit.y) < townHall.radius + 60;
        if (unit.morale < base) setMorale(unit, Math.min(base, unit.morale + (atHome ? 2 : 1) * c.recoverPerSecond * dt), side);
      }
    }
  }
}
