// What enemies do by themselves, each tick

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { game, townHall } from '../../../engine/world/index.js';
import { isBuildingSingle, removeBuilding } from '../../economy/building/index.js';
import { findNearestEnemyTent, getEnemyDef } from './waves.rules.js';
import { damageSettler, faceTowards, startSwing } from '../../colony/settlers/index.js';
import { scheduleRespawn } from '../../economy/gathering/index.js';
import { isShelter } from '../healing/index.js';
import { enemyNecromancy } from '../../factions/undead/index.js';
import { clampEntityToBounds, collidesWithBoxList, invalidateAllPaths, moveEntityTowards } from '../../../engine/movement/index.js';
import { hasLineOfFire } from '../combat/index.js';
import { playSound } from '../../../app/index.js';

// Every enemy's tick, last first
export function tickEnemies(dt) {
  for (let i = game.enemies.length - 1; i >= 0; i--) tickEnemy(game.enemies[i], dt);
}

// One enemy: builds its tent, or picks a target (a settler near it or the town hall), shoots or walks up,
// breaks through what blocks its way, and strikes
export function tickEnemy(en, dt) {
  clampEntityToBounds(en);

  if (en.buildTarget) {
    let site = en.buildTarget;
    if (!game.enemyTentBlueprints.includes(site)) {
      en.buildTarget = null;
    } else {
      const tentConfig = GAME_CONFIG.enemyTents;
      let distToSite = Math.hypot(site.x - en.x, site.y - en.y);
      if (distToSite > tentConfig.buildDistance) {
        moveEntityTowards(en, site.x, site.y, en.speed, true, dt);
      } else {
        site.progress += dt * tentConfig.buildRate;
        if (site.progress >= site.maxProgress) {
          game.enemyTents.push({ x: site.x, y: site.y, hp: tentConfig.hp, maxHp: tentConfig.hp, summonTimer: 0, summonsLeft: tentConfig.summonsPerWave });
          game.enemyTentBlueprints.splice(game.enemyTentBlueprints.indexOf(site), 1);
          en.buildTarget = null;
          invalidateAllPaths();
        }
      }
    }
    return;
  }

  const enemyDef = getEnemyDef(en);
  if (enemyDef.necromancer && enemyNecromancy(en, enemyDef.necromancer, dt)) return;
  /** @type {import('../../../engine/world/types.js').Settler | import('../../../engine/world/types.js').TownHall} */
  let target = townHall;
  let minDist = Math.hypot(en.x - townHall.x, en.y - townHall.y);
  let closestSettler = /** @type {import('../../../engine/world/types.js').Settler | null} */ (null);

  game.settlers.forEach(s => {
    let d = Math.hypot(en.x - s.x, en.y - s.y);
    if (d < minDist) { minDist = d; closestSettler = s; }
  });

  let lockedTarget = en.attackTarget;
  if (lockedTarget && !game.settlers.includes(lockedTarget)) lockedTarget = null;
  if (lockedTarget) {
    let lockedDist = Math.hypot(en.x - lockedTarget.x, en.y - lockedTarget.y);
    if (!closestSettler || lockedDist <= minDist + 40) {
      target = lockedTarget;
      minDist = lockedDist;
    } else {
      target = closestSettler;
      en.attackTarget = closestSettler;
      minDist = Math.hypot(en.x - closestSettler.x, en.y - closestSettler.y);
    }
  } else if (closestSettler) {
    target = closestSettler;
    en.attackTarget = closestSettler;
    minDist = Math.hypot(en.x - closestSettler.x, en.y - closestSettler.y);
  }

  const ranged = enemyDef.ranged;
  // an archer with an empty quiver walks to the nearest enemy tent for more arrows,
  // or fights like its melee enemy when the tents have none left
  let shooting = en.type === 'archer';
  let meleeDef = enemyDef;
  /** @type {{ x: number, y: number }} */
  let moveTarget = target;
  const quiver = enemyDef.quiver;
  if (quiver && en.arrows <= 0) {
    const tent = game.enemyArrowStock > 0 ? findNearestEnemyTent(en) : null;
    if (tent) {
      if (Math.hypot(tent.x - en.x, tent.y - en.y) <= GAME_CONFIG.enemyTents.buildDistance) {
        const taken = Math.min(quiver.refill, game.enemyArrowStock);
        en.arrows += taken;
        game.enemyArrowStock -= taken;
      } else {
        shooting = false;
        moveTarget = tent;
      }
    } else {
      shooting = false;
      meleeDef = getDefinition('enemies', quiver.melee) || enemyDef;
    }
  }
  en.weapon = meleeDef.weapon || 'sword';
  const inMelee = !shooting && moveTarget === target;
  // an archer with no clear shot walks closer instead of standing off
  const clearShot = shooting && hasLineOfFire(en.x, en.y, target.x, target.y);
  const keepsAway = clearShot && minDist < ranged.keepAway;

  if (shooting) {
    en.attackCooldown = (en.attackCooldown || 0) - dt;
    if (clearShot && minDist < ranged.range && en.attackCooldown <= 0) {
      let angle = Math.atan2(target.y - en.y, target.x - en.x);
      playSound('bow', en);
      game.projectiles.push({ x: en.x, y: en.y, vx: Math.cos(angle) * ranged.arrowSpeed, vy: Math.sin(angle) * ranged.arrowSpeed, damage: en.damage, life: ranged.arrowLife, fromEnemy: true, owner: en,
        fire: !!getEnemyDef(en).fireArrows }); // burning arrows
      startSwing(en, 0.3);
      faceTowards(en, target.x, target.y);
      en.attackCooldown = ranged.cooldown;
      if (quiver && game.gameMode !== 'battle') en.arrows--;
    }
  }

  // a melee enemy close enough to strike stands and fights instead of walking into its target
  // the drawn size of a settler: a big one is pushed off further (see separateSettlersFromEnemies)
  let attackRange = (target === townHall ? townHall.radius : (/** @type {import('../../../engine/world/types.js').Settler} */ (target).visualRadius || target.radius)) + en.radius + meleeDef.reach;
  const holdsGround = keepsAway || (inMelee && minDist < attackRange);

  // box distance, not center distance: an enemy pressed against a wall off-center is still touching it.
  // Use the same collision body as movement, so big enemies don't hit things beside the corridor.
  const contactRadius = Math.min(en.radius, 13) + 2;
  // spikes are walked over, not besieged
  let touchingBuilding = game.buildings.find(b => b.type !== 'spikes' && collidesWithBoxList(en.x, en.y, contactRadius, [b], 15));
  let blockedRes = null;

  if (touchingBuilding) {
    if (isShelter(touchingBuilding)) {
      touchingBuilding.hp -= dt * enemyDef.siege.buildings;
      if (touchingBuilding.hp <= 0) removeBuilding(touchingBuilding);
    } else if (en.type === 'big' || en.isBlockedPath || (!isBuildingSingle(touchingBuilding) && !en.pathViaSpikes)) {
      // a lone wall can be walked around, unless it's what blocks the only way in; an enemy on its
      // way in over spikes squeezes past the walls beside them
      touchingBuilding.hp -= dt * enemyDef.siege.buildings;
      if (touchingBuilding.hp <= 0) removeBuilding(touchingBuilding);
    } else {
      let dx = en.x - touchingBuilding.x;
      let dy = en.y - touchingBuilding.y;
      let dist = Math.hypot(dx, dy);
      let minDist = en.radius + 15;
      if (dist < minDist && dist > 0) {
        en.x += (dx / dist) * (minDist - dist);
        en.y += (dy / dist) * (minDist - dist);
      }
      if (!holdsGround) moveEntityTowards(en, moveTarget.x, moveTarget.y, en.speed, true, dt);
    }
  } else {
    if (en.isBlockedPath) {
      let destroyableResources = [
        ...game.trees.filter(t => !t.isGrowing),
        ...game.boulders,
        ...game.berryBushes,
        ...game.grassList
      ];
      if (en.type === 'big') {
        // not naturalRocks: paths never go through rock, so a brute only ever grazed rock beside its
        // corridor and then spent ~25s chewing through 100 hp instead of walking on
        destroyableResources.push(...game.cacti, ...game.ironOres, ...game.coalOres);
      }
      for (let r of destroyableResources) {
        if (collidesWithBoxList(en.x, en.y, contactRadius, [r], 15)) {
          blockedRes = r;
          break;
        }
      }
    }

    if (blockedRes) {
      if (game.trees.includes(blockedRes)) {
        blockedRes.hp -= dt * enemyDef.siege.resources;
        if (blockedRes.hp <= 0) {
          game.trees.splice(game.trees.indexOf(blockedRes), 1);
          scheduleRespawn('tree');
          invalidateAllPaths();
        }
      } else if (game.boulders.includes(blockedRes)) {
        blockedRes.hp -= dt * enemyDef.siege.resources;
        if (blockedRes.hp <= 0) {
          game.boulders.splice(game.boulders.indexOf(blockedRes), 1);
          scheduleRespawn('boulder');
          invalidateAllPaths();
        }
      } else if (game.berryBushes.includes(blockedRes)) {
        game.berryBushes.splice(game.berryBushes.indexOf(blockedRes), 1);
        scheduleRespawn('berry_bush');
        invalidateAllPaths();
      } else if (game.grassList.includes(blockedRes)) {
        game.grassList.splice(game.grassList.indexOf(blockedRes), 1);
        scheduleRespawn('grass');
        invalidateAllPaths();
      } else if (en.type === 'big') {
        blockedRes.hp -= dt * enemyDef.siege.resources;
        if (blockedRes.hp <= 0) {
          const resourceLists = [game.cacti, game.ironOres, game.coalOres, game.naturalRocks];
          const list = resourceLists.find(resources => resources.includes(blockedRes));
          if (list) list.splice(list.indexOf(blockedRes), 1);
          invalidateAllPaths();
        }
      }
    } else {
      if (!holdsGround) moveEntityTowards(en, moveTarget.x, moveTarget.y, en.speed, true, dt);
    }
  }

  const meleeDamage = meleeDef === enemyDef ? en.damage : meleeDef.damage;
  if (inMelee && minDist < attackRange) faceTowards(en, target.x, target.y);
  if (inMelee && minDist < attackRange) {
    if (!(en.swingT > 0)) startSwing(en, 0.5); // keeps swinging while it hits
    if (en.type === 'big') {
      let splashRadius = enemyDef.splash.radius;
      let splashDamage = dt * en.damage * enemyDef.splash.share;
      if (target === townHall) townHall.hp -= dt * en.damage;
      else damageSettler(target, dt * en.damage, en);

      game.settlers.forEach(s => {
        if (s !== target && Math.hypot(en.x - s.x, en.y - s.y) < splashRadius + s.radius) {
          damageSettler(s, splashDamage, en);
        }
      });

      if (target !== townHall && Math.hypot(en.x - townHall.x, en.y - townHall.y) < splashRadius + townHall.radius) {
        townHall.hp -= splashDamage;
      }
    } else {
      if (target === townHall) townHall.hp -= dt * meleeDamage;
      else damageSettler(target, dt * meleeDamage, en);
    }
  }
}
