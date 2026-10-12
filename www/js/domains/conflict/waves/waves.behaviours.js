// What enemies do by themselves, each tick

// Every enemy's tick, last first
function tickEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) tickEnemy(enemies[i], dt);
}

// One enemy: builds its tent, or picks a target (a settler near it or the town hall), shoots or walks up,
// breaks through what blocks its way, and strikes
function tickEnemy(en, dt) {
  clampEntityToBounds(en);

  if (en.buildTarget) {
    let site = en.buildTarget;
    if (!enemyTentBlueprints.includes(site)) {
      en.buildTarget = null;
    } else {
      const tentConfig = GAME_CONFIG.enemyTents;
      let distToSite = Math.hypot(site.x - en.x, site.y - en.y);
      if (distToSite > tentConfig.buildDistance) {
        moveEntityTowards(en, site.x, site.y, en.speed, true, dt);
      } else {
        site.progress += dt * tentConfig.buildRate;
        if (site.progress >= site.maxProgress) {
          enemyTents.push({ x: site.x, y: site.y, hp: tentConfig.hp, maxHp: tentConfig.hp, summonTimer: 0, summonsLeft: tentConfig.summonsPerWave });
          enemyTentBlueprints.splice(enemyTentBlueprints.indexOf(site), 1);
          en.buildTarget = null;
          invalidateAllPaths();
        }
      }
    }
    return;
  }

  const enemyDef = getEnemyDef(en);
  if (enemyDef.necromancer && enemyNecromancy(en, enemyDef.necromancer, dt)) return;
  let target = townHall;
  let minDist = Math.hypot(en.x - townHall.x, en.y - townHall.y);
  let closestSettler = null;

  settlers.forEach(s => {
    let d = Math.hypot(en.x - s.x, en.y - s.y);
    if (d < minDist) { minDist = d; closestSettler = s; }
  });

  let lockedTarget = en.attackTarget;
  if (lockedTarget && !settlers.includes(lockedTarget)) lockedTarget = null;
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
  let moveTarget = target;
  const quiver = enemyDef.quiver;
  if (quiver && en.arrows <= 0) {
    const tent = enemyArrowStock > 0 ? findNearestEnemyTent(en) : null;
    if (tent) {
      if (Math.hypot(tent.x - en.x, tent.y - en.y) <= GAME_CONFIG.enemyTents.buildDistance) {
        const taken = Math.min(quiver.refill, enemyArrowStock);
        en.arrows += taken;
        enemyArrowStock -= taken;
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
      projectiles.push({ x: en.x, y: en.y, vx: Math.cos(angle) * ranged.arrowSpeed, vy: Math.sin(angle) * ranged.arrowSpeed, damage: en.damage, life: ranged.arrowLife, fromEnemy: true, owner: en,
        fire: !!getEnemyDef(en).fireArrows }); // burning arrows (#165)
      startSwing(en, 0.3);
      faceTowards(en, target.x, target.y);
      en.attackCooldown = ranged.cooldown;
      if (quiver && gameMode !== 'battle') en.arrows--;
    }
  }

  // a melee enemy close enough to strike stands and fights instead of walking into its target
  // the drawn size of a settler: a big one is pushed off further (see separateSettlersFromEnemies)
  let attackRange = (target === townHall ? townHall.radius : (target.visualRadius || target.radius)) + en.radius + meleeDef.reach;
  const holdsGround = keepsAway || (inMelee && minDist < attackRange);

  // box distance, not center distance: an enemy pressed against a wall off-center is still touching it.
  // Use the same collision body as movement, so big enemies don't hit things beside the corridor.
  const contactRadius = Math.min(en.radius, 13) + 2;
  // spikes are walked over, not besieged
  let touchingBuilding = buildings.find(b => b.type !== 'spikes' && collidesWithBoxList(en.x, en.y, contactRadius, [b], 15));
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
        ...trees.filter(t => !t.isGrowing),
        ...boulders,
        ...berryBushes,
        ...grassList
      ];
      if (en.type === 'big') {
        // not naturalRocks: paths never go through rock, so a brute only ever grazed rock beside its
        // corridor and then spent ~25s chewing through 100 hp instead of walking on
        destroyableResources.push(...cacti, ...ironOres, ...coalOres);
      }
      for (let r of destroyableResources) {
        if (collidesWithBoxList(en.x, en.y, contactRadius, [r], 15)) {
          blockedRes = r;
          break;
        }
      }
    }

    if (blockedRes) {
      if (trees.includes(blockedRes)) {
        blockedRes.hp -= dt * enemyDef.siege.resources;
        if (blockedRes.hp <= 0) {
          trees.splice(trees.indexOf(blockedRes), 1);
          scheduleRespawn('tree');
          invalidateAllPaths();
        }
      } else if (boulders.includes(blockedRes)) {
        blockedRes.hp -= dt * enemyDef.siege.resources;
        if (blockedRes.hp <= 0) {
          boulders.splice(boulders.indexOf(blockedRes), 1);
          scheduleRespawn('boulder');
          invalidateAllPaths();
        }
      } else if (berryBushes.includes(blockedRes)) {
        berryBushes.splice(berryBushes.indexOf(blockedRes), 1);
        scheduleRespawn('berry_bush');
        invalidateAllPaths();
      } else if (grassList.includes(blockedRes)) {
        grassList.splice(grassList.indexOf(blockedRes), 1);
        scheduleRespawn('grass');
        invalidateAllPaths();
      } else if (en.type === 'big') {
        blockedRes.hp -= dt * enemyDef.siege.resources;
        if (blockedRes.hp <= 0) {
          const resourceLists = [cacti, ironOres, coalOres, naturalRocks];
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

      settlers.forEach(s => {
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
