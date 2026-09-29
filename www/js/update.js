function update(dt) {
  if (!gameStarted || isPaused) return;
  resetTileIndex();
  pathTick++;

  const possessed = getPossessed();
  const dpad = document.getElementById('mobile-dpad');

  if (possessed) {
    camera.x = possessed.x;
    camera.y = possessed.y;
    clampCamera();

    if (dpad && dpad.style.display !== 'flex') dpad.style.display = 'flex';
  } else {
    if (dpad && dpad.style.display !== 'none') dpad.style.display = 'none';
  }

  waveTimer -= dt;
  if (waveTimer <= 0) {
    startNextWave();
    waveTimer = waveInterval;
  }

  updatePendingRespawns(dt);

  foodTimer -= dt;
  if (foodTimer <= 0) {
    let mealCost = settlers.reduce((sum, s) => sum + (s.type === 'big' ? 2 : 1), 0);
    stock.food = Math.max(0, stock.food - mealCost);
    foodTimer = 25;
  }

  if (boars.length < BOAR_LIMIT) {
    boarRespawnTimer -= dt;
    if (boarRespawnTimer <= 0) {
      spawnResource('boar');
      boarRespawnTimer = 25;
    }
  } else {
    boarRespawnTimer = 25;
  }

  farmPlots.forEach(f => {
    if (f.growth < 100) f.growth += dt * 5;
  });

  trees.forEach(t => {
    if (t.isGrowing) {
      t.growProgress = (t.growProgress || 0) + dt;
      if (t.growProgress >= 20) {
        t.isGrowing = false;
        t.hp = 3;
      }
    } else if (t.apple && !t.applesReady) {
      t.appleGrowth += dt / GAME_CONFIG.appleTrees.growSeconds;
      if (t.appleGrowth >= 1) t.applesReady = true;
    }
  });

  boars.forEach(b => {
    if (b.isCarcass) return;

    if (b.hidden) {
      b.hideTimer -= dt;
      if (b.hideTimer <= 0) {
        b.hidden = false;
        b.hideTarget = null;
        b.wanderTimer = 0;
      }
      return;
    }

    if (b.fleeTimer > 0) b.fleeTimer -= dt;

    if ((b.fleeTimer || 0) <= 0 && !b.hideTarget) {
      let nearest = null, nearestDist = Infinity;
      settlers.forEach(s => {
        let d = Math.hypot(s.x - b.x, s.y - b.y);
        if (d < nearestDist) { nearestDist = d; nearest = s; }
      });
      if (nearest && nearestDist <= GAME_CONFIG.mapResources.boar.wary) makeBoarFlee(b, nearest.x, nearest.y, false, true);
    }

    if (b.hideTarget) {
      if (!grassList.includes(b.hideTarget)) {
        b.hideTarget = null;
      } else {
        let hideDistance = Math.hypot(b.hideTarget.x - b.x, b.hideTarget.y - b.y);
        if (hideDistance <= 18) {
          b.x = b.hideTarget.x;
          b.y = b.hideTarget.y;
          b.hidden = true;
          b.hideTimer = 2;
          b.fleeTimer = 0;
          invalidateAllPaths();
          return;
        }
        let hideDx = (b.hideTarget.x - b.x) / hideDistance;
        let hideDy = (b.hideTarget.y - b.y) / hideDistance;
        let hideSpeed = b.fleeSpeed || 1.35;
        if (!collidesWithWall(b.x + hideDx * hideSpeed, b.y + hideDy * hideSpeed, 12) &&
            !collidesWithWater(b.x + hideDx * hideSpeed, b.y + hideDy * hideSpeed, 12)) {
          b.x += hideDx * hideSpeed;
          b.y += hideDy * hideSpeed;
        } else {
          b.hideTarget = null;
          b.fleeTimer = 0;
        }
        return;
      }
    }

    b.wanderTimer = (b.wanderTimer || 0) + dt;
    if ((b.fleeTimer || 0) <= 0 && b.wanderTimer >= (b.wanderInterval || 4.0)) {
      b.wanderTimer = 0;
      b.wanderInterval = 3 + rand() * 3;
      let ang = rand() * Math.PI * 2;
      let dist = 15 + rand() * 35;
      b.targetX = Math.max(60, Math.min(WORLD_WIDTH - 60, b.x + Math.cos(ang) * dist));
      b.targetY = Math.max(60, Math.min(WORLD_HEIGHT - 60, b.y + Math.sin(ang) * dist));
    }
    let dx = (b.targetX !== undefined ? b.targetX : b.x) - b.x;
    let dy = (b.targetY !== undefined ? b.targetY : b.y) - b.y;
    let dist = Math.hypot(dx, dy);
    if (dist > 2) {
      let speed = b.fleeTimer > 0 ? (b.fleeSpeed || 0.65) : 0.3;
      let vx = (dx / dist) * speed;
      let vy = (dy / dist) * speed;
      if (!collidesWithWall(b.x + vx, b.y + vy, 12) && !collidesWithWater(b.x + vx, b.y + vy, 12)) {
        b.x += vx;
        b.y += vy;
      } else {
        b.wanderTimer = b.wanderInterval || 4.0;
        if (b.fleeTimer > 0) b.fleeTimer = 0;
      }
    }
  });

  buildings.filter(b => b.type === 'smelter').forEach(smelter => {
    smelter.oreLoaded = smelter.oreLoaded || 0;
    smelter.coalLoaded = smelter.coalLoaded || 0;
    smelter.ironProduced = smelter.ironProduced || 0;

    if (smelter.oreLoaded > 0 && smelter.coalLoaded > 0) {
      smelter.smeltProgress = (smelter.smeltProgress || 0) + dt;
      if (smelter.smeltProgress >= 4.0) {
        smelter.oreLoaded--;
        smelter.coalLoaded--;
        smelter.ironProduced++;
        smelter.smeltProgress = 0;
      }
    } else {
      smelter.smeltProgress = 0;
    }
  });

  const p = getPossessed();
  if (p) {
    let dx = 0, dy = 0;
    if (keys['w'] || keys['ц']) dy -= 1;
    if (keys['s'] || keys['ы']) dy += 1;
    if (keys['a'] || keys['ф']) dx -= 1;
    if (keys['d'] || keys['в']) dx += 1;
    if (dx !== 0 || dy !== 0) {
      let vx = dx * p.speed;
      let vy = dy * p.speed;
      if (!collidesWithWall(p.x + vx, p.y, p.radius)) p.x += vx;
      if (!collidesWithWall(p.x, p.y + vy, p.radius)) p.y += vy;
    }
  }

  // settler AI: see behaviours.js
  const settlerTick = createSettlerTick(dt);
  assignTowerArchers();

  settlers.forEach(s => {
    prepareSettler(s, dt);
    s.isIdle = false;
    for (const behaviour of SETTLER_BEHAVIOURS) {
      if (behaviour(s, settlerTick)) {
        s.isIdle = behaviour === patrol;
        return;
      }
    }
  });

  for (let i = enemyTents.length - 1; i >= 0; i--) {
    let et = enemyTents[i];
    if (et.hp <= 0) {
      enemyTents.splice(i, 1);
      invalidateAllPaths();
    }
  }

  enemyTents.forEach(et => {
    et.summonTimer = (et.summonTimer || 0) + dt;
    const tentConfig = GAME_CONFIG.enemyTents;
    if ((et.summonsLeft || 0) > 0 && et.summonTimer >= tentConfig.summonInterval && enemies.length < tentConfig.maxEnemies) {
      et.summonTimer = 0;
      et.summonsLeft--;
      let spawnPos = {
        x: Math.max(15, Math.min(WORLD_WIDTH - 15, et.x + (rand() - 0.5) * 30)),
        y: Math.max(15, Math.min(WORLD_HEIGHT - 15, et.y + (rand() - 0.5) * 30))
      };
      const summoned = createConfiguredEnemy(spawnPos, tentConfig.summonEnemy);
      summoned.summoned = true; // from a tent, not the wave: doesn't call off an assault on the tents
      enemies.push(summoned);
    }
  });

  for (let i = projectiles.length - 1; i >= 0; i--) {
    let proj = projectiles[i];
    if (!proj.startTile) proj.startTile = getGridPos(proj.x, proj.y);
    proj.x += proj.vx; proj.y += proj.vy; proj.life--;
    let hit = false;

    if (proj.fromEnemy) {
      if (Math.hypot(townHall.x - proj.x, townHall.y - proj.y) < townHall.radius) {
        townHall.hp -= proj.damage;
        hit = true;
      }
      for (let s of settlers) {
        if (hit) break;
        if (Math.hypot(s.x - proj.x, s.y - proj.y) < s.radius + 3) {
          damageSettler(s, proj.damage, proj.owner);
          hit = true;
        }
      }
    } else {
      for (let j = enemies.length - 1; j >= 0 && !hit; j--) {
        let en = enemies[j];
        if (Math.hypot(en.x - proj.x, en.y - proj.y) < en.radius + 3) {
          en.hp -= proj.damage;
          hit = true;
        }
      }
      for (let j = enemyTents.length - 1; j >= 0 && !hit; j--) {
        let et = enemyTents[j];
        if (Math.hypot(et.x - proj.x, et.y - proj.y) < 18) {
          et.hp -= proj.damage;
          hit = true;
        }
      }
      for (let j = boars.length - 1; j >= 0 && !hit; j--) {
        let b = boars[j];
        if (!b.isCarcass && !b.hidden && !b.hideTarget && Math.hypot(b.x - proj.x, b.y - proj.y) < 12) {
          b.hp -= proj.damage;
          makeBoarFlee(b, proj.owner ? proj.owner.x : proj.x, proj.owner ? proj.owner.y : proj.y);
          hit = true;
          if (b.hp <= 0) {
            b.isCarcass = true;
            b.collector = proj.owner || null;
            b.fleeTimer = 0;
            b.hideTarget = null;
          }
        }
      }
    }
    // gone: it hit something, flew its full range, or struck an obstacle past its shooter's own tile
    const tile = getGridPos(proj.x, proj.y);
    const leftStartTile = tile.gx !== proj.startTile.gx || tile.gy !== proj.startTile.gy;
    if (hit || proj.life <= 0 || (leftStartTile && isArrowBlockedAt(proj.x, proj.y, !!proj.fromTower))) projectiles.splice(i, 1);
  }


  for (let i = enemies.length - 1; i >= 0; i--) {
    let en = enemies[i];
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
      continue;
    }

    const enemyDef = getEnemyDef(en);
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
        projectiles.push({ x: en.x, y: en.y, vx: Math.cos(angle) * ranged.arrowSpeed, vy: Math.sin(angle) * ranged.arrowSpeed, damage: en.damage, life: ranged.arrowLife, fromEnemy: true, owner: en });
        en.attackCooldown = ranged.cooldown;
        if (quiver) en.arrows--;
      }
    }

    // a melee enemy close enough to strike stands and fights instead of walking into its target
    let attackRange = (target === townHall ? townHall.radius : target.radius) + en.radius + meleeDef.reach;
    const holdsGround = keepsAway || (inMelee && minDist < attackRange);

    // box distance, not center distance: an enemy pressed against a wall off-center is still touching it.
    // Use the same collision body as movement, so big enemies don't hit things beside the corridor.
    const contactRadius = Math.min(en.radius, 13) + 2;
    // spikes are walked over, not besieged
    let touchingBuilding = buildings.find(b => b.type !== 'spikes' && collidesWithBoxList(en.x, en.y, contactRadius, [b], 15));
    let blockedRes = null;

    if (touchingBuilding) {
      if (touchingBuilding.type === 'tent') {
        touchingBuilding.hp -= dt * enemyDef.siege.buildings;
        if (touchingBuilding.hp <= 0) {
          buildings.splice(buildings.indexOf(touchingBuilding), 1);
          invalidateAllPaths();
        }
      } else if (en.type === 'big' || en.isBlockedPath || (!isBuildingSingle(touchingBuilding) && !en.pathViaSpikes)) {
        // a lone wall can be walked around, unless it's what blocks the only way in; an enemy on its
        // way in over spikes squeezes past the walls beside them
        touchingBuilding.hp -= dt * enemyDef.siege.buildings;
        if (touchingBuilding.hp <= 0) {
          buildings.splice(buildings.indexOf(touchingBuilding), 1);
          invalidateAllPaths();
        }
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
    if (inMelee && minDist < attackRange) {
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

  separateSettlersFromEnemies();
  applySpikeTraps();

  settlers.forEach(s => {
    if (s.hp <= 0 && !s.deadProcessed) {
      s.deadProcessed = true;
      refundEquipment(s);
      addCorpse(s, 'settler', s.type);
      if (selectedSettler === s) selectedSettler = null;
    }
  });
  settlers = settlers.filter(s => s.hp > 0);
  enemies.forEach(en => {
    if (en.hp <= 0 && !en.rewardGranted) {
      grantEnemyReward(en);
      en.rewardGranted = true;
      addCorpse(en, 'enemy', en.enemyKey);
    }
  });
  enemies = enemies.filter(en => en.hp > 0);
  enemyTentBlueprints = enemyTentBlueprints.filter(site => enemies.includes(site.builder));
  updateCorpses(dt);

  updateUnitCounts();
  updateUI();
}
