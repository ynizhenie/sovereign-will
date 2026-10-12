// Hunting a boar and carrying its carcass home

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { townHall } from '../../../engine/world/state.js';
import { rand } from '../../../engine/world/rng.js';
import { getWeaponStats, isBowWeapon } from '../../colony/equipment/equipment.rules.js';
import { finishHarvest } from '../gathering/gathering.rules.js';
import { moveEntityTowards } from '../../../engine/movement/steering.js';
import { woundBoar } from './hunting.rules.js';
import { hasLineOfFire, performAttack } from '../../conflict/combat/combat.rules.js';
import { faceTowards, startSwing } from '../../colony/settlers/settlers.draw.js';
import { playWorkSound } from '../../../app/sounds.js';

// Hunt a boar or collect its carcass
export function huntBoar(s, boar, tick) {
  const dt = tick.dt;
  let dist = Math.hypot(boar.x - s.x, boar.y - s.y);
  if (boar.isCarcass) {
    if (dist > 25) {
      moveEntityTowards(s, boar.x, boar.y, s.speed, false, dt);
    } else {
      // butchered where it lies, the blade going (#172)
      boar.collector = s;
      s.working = 0.1;
      faceTowards(s, boar.x, boar.y);
      boar.butcher = (boar.butcher || 0) + dt / GAME_CONFIG.mapResources.boar.butcherSeconds;
      playWorkSound(s, 'chop', 0.4);
      if (boar.butcher >= 1) finishHarvest(s, boar, 'boar');
    }
    s.patrolTarget = null;
    return;
  }
  if (boar.hidden || boar.hideTarget) {
    s.path = null;
    if (!s.patrolTarget || Math.hypot(s.x - s.patrolTarget.x, s.y - s.patrolTarget.y) < 15) {
      let angle = rand() * Math.PI * 2;
      let patrolDistance = 30 + rand() * 120;
      s.patrolTarget = {
        x: townHall.x + Math.cos(angle) * patrolDistance,
        y: townHall.y + Math.sin(angle) * patrolDistance
      };
    }
    moveEntityTowards(s, s.patrolTarget.x, s.patrolTarget.y, s.speed * 0.5, false, dt);
    return;
  }
  const hunt = getWeaponStats(s, 'hunt');
  if (dist > hunt.range) {
    moveEntityTowards(s, boar.x, boar.y, s.speed, false, dt);
  } else {
    if (isBowWeapon(s.weapon)) {
      // only with a clear shot: no arrows wasted on trees and stones in the way (#173)
      if (hasLineOfFire(s.x, s.y, boar.x, boar.y)) performAttack(s, boar.x, boar.y);
      else moveEntityTowards(s, boar.x, boar.y, s.speed, false, dt);
    } else if (!((boar.fleeTimer || 0) > 0 && boar.sprinting) && s.attackCooldown <= 0) { // not mid-sprint
      woundBoar(boar, hunt.damage * hunt.multiplier, s, s.x, s.y);
      s.attackCooldown = hunt.cooldown;
      startSwing(s, Math.min(0.35, hunt.cooldown * 0.8));
      faceTowards(s, boar.x, boar.y);
    }
  }
  s.patrolTarget = null;
}
