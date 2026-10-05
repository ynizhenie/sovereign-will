const WAVE_WARNING_SECONDS = 15;

// Raised zombies crumble when their time is up (#164, #175); the player's leave rot behind
function updateTemporaryZombies(dt) {
  // gone at once: no corpse, no reward, and nothing can heal them back (a necromancer would)
  const crumbled = unit => unit.temporary !== undefined && (unit.temporary -= dt) <= 0;
  const gone = settlers.filter(crumbled);
  if (gone.length) {
    settlers = settlers.filter(s => !gone.includes(s));
    if (gone.includes(selectedSettler)) selectedSettler = null;
    stock.rot += gone.length * GAME_CONFIG.temporaryZombie.rot;
  }
  enemies = enemies.filter(en => !crumbled(en));
}

// Burning arrows (#165): what they hit burns a few seconds
function setBurning(unit) {
  unit.burning = GAME_CONFIG.burning.seconds;
}

function updateBurning(dt) {
  for (const unit of [...settlers, ...enemies]) {
    if (!(unit.burning > 0)) continue;
    unit.burning -= dt;
    if (settlers.includes(unit)) damageSettler(unit, GAME_CONFIG.burning.dps * dt, null);
    else unit.hp -= GAME_CONFIG.burning.dps * dt;
  }
}

// A corpse on blighted ground rises as a temporary zombie after a while (#164)
function raiseOnBlight(dt) {
  if (sides.player.faction !== 'undead') return;
  for (const corpse of [...corpses]) {
    if (!isBlighted(corpse.x, corpse.y)) continue;
    corpse.blightAge = (corpse.blightAge || 0) + dt;
    if (corpse.blightAge >= GAME_CONFIG.blight.riseSeconds) raiseTemporaryZombie(corpse);
  }
}

// One settler's meal (#178): food from the stock (2 for a big one), worms when it runs short; a few
// meals in, it needs to go (see relieve)
function eatMeal(s) {
  const cost = isBigBody(s) ? 2 : 1;
  const short = Math.max(0, cost - stock.food);
  stock.food = Math.max(0, stock.food - cost);
  stock.worms = Math.max(0, (stock.worms || 0) - short);
  s.meals = (s.meals || 0) + 1;
  if (s.meals >= GAME_CONFIG.relief.mealsBefore) s.needsRelief = true;
}

function update(dt) {
  if (!gameStarted || isPaused || gameMode === 'editor') return;
  // battle mode: units stand still while being placed, and the result shows for a moment
  if (gameMode === 'battle') {
    updateBattle(dt);
    if (battle.phase !== 'fight') return;
  }
  resetTileIndex();
  pathTick++;

  const possessed = getPossessed();
  const joystickEl = document.getElementById('mobile-joystick');

  if (possessed) {
    camera.x = possessed.x;
    camera.y = possessed.y;
    clampCamera();

    if (joystickEl.style.display !== 'block') joystickEl.style.display = 'block';
  } else {
    if (joystickEl.style.display !== 'none') joystickEl.style.display = 'none';
  }

  const before = waveTimer;
  waveTimer -= dt;
  // one warning, 15 s before the wave (holds of the timer in tests keep it above)
  if (before > WAVE_WARNING_SECONDS && waveTimer <= WAVE_WARNING_SECONDS) showNotification(t('wave.warning', { seconds: WAVE_WARNING_SECONDS }), true);
  if (waveTimer <= 0) {
    startNextWave();
    waveTimer = waveInterval;
  }

  updatePendingRespawns(dt);

  // the undead make bones by themselves: their graveyard and each grave (#43)
  const bonesRate = getPlayerFaction().bonesPerSecond;
  if (bonesRate && gameMode === 'endless') {
    stock.bones += dt * (bonesRate.hall + buildings.filter(b => b.type === 'grave').length * bonesRate.grave);
  }
  // and rot, from each grave (#164)
  const rotRate = getPlayerFaction().rotPerSecond;
  if (rotRate && gameMode === 'endless') {
    stock.rot += dt * (rotRate.hall + buildings.filter(b => b.type === 'grave').length * rotRate.grave);
  }
  updateTemporaryZombies(dt);
  // blighted zones taken away fade (#186)
  for (const z of blightZones) if (z.clearing !== undefined) z.clearing -= dt;
  if (blightZones.some(z => z.clearing <= 0)) blightZones = blightZones.filter(z => !(z.clearing <= 0));
  updateBurning(dt);
  raiseOnBlight(dt);

  // meals, each settler on its own clock (#178), for a faction that eats (the undead don't)
  if (gameMode === 'endless' && getPlayerFaction().eats) {
    const meals = GAME_CONFIG.meals;
    for (const s of settlers) {
      if (s.hunger === undefined) s.hunger = meals.seconds * (meals.firstShare + (1 - meals.firstShare) * rand());
      s.hunger -= dt;
      if (s.hunger <= 0) { s.hunger = meals.seconds; eatMeal(s); }
    }
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
    if (f.growth < 100) f.growth += dt * 5 * (f.watered ? GAME_CONFIG.gear.wateringCan.growthFactor : 1);
  });

  trees.forEach(t => {
    if (t.isGrowing) {
      t.growProgress = (t.growProgress || 0) + dt * (t.watered ? GAME_CONFIG.gear.wateringCan.growthFactor : 1);
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
    if (b.bloodAge !== undefined) b.bloodAge += dt;
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
        let hideSpeed = (b.fleeSpeed || 1.35) * GAME_CONFIG.movementScale;
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
      let speed = (b.fleeTimer > 0 ? (b.fleeSpeed || 0.65) : 0.3) * GAME_CONFIG.movementScale;
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

  buildings.forEach(b => { if (b.type === 'campfire' && b.burning > 0) b.burning = Math.max(0, b.burning - dt); });

  buildings.filter(b => b.type === 'smelter').forEach(smelter => {
    smelter.oreLoaded = smelter.oreLoaded || 0;
    smelter.coalLoaded = smelter.coalLoaded || 0;
    smelter.ironProduced = smelter.ironProduced || 0;

    const limits = getSmelterLimits();
    if (smelter.oreLoaded > 0 && smelter.coalLoaded > 0 && smelter.ironProduced < limits.maxIron) {
      smelter.smeltProgress = (smelter.smeltProgress || 0) + dt;
      if (smelter.smeltProgress >= limits.seconds) {
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
    // the joystick, or WASD (a diagonal isn't faster than straight)
    let dx = joystick.x, dy = joystick.y;
    if (keys['w'] || keys['ц']) dy -= 1;
    if (keys['s'] || keys['ы']) dy += 1;
    if (keys['a'] || keys['ф']) dx -= 1;
    if (keys['d'] || keys['в']) dx += 1;
    const push = Math.hypot(dx, dy);
    if (push > 1) { dx /= push; dy /= push; }
    if (push > 0.1) {
      p.order = null; // moving by hand cancels a tap order
      faceTowards(p, p.x + dx, p.y + dy);
      let vx = dx * p.speed * GAME_CONFIG.movementScale;
      let vy = dy * p.speed * GAME_CONFIG.movementScale;
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
        s.activity = behaviour.name; // what it's doing, for the selected settler's info (#180)
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
      const summoned = createConfiguredEnemy(spawnPos, getEnemyFaction().summonEnemy || tentConfig.summonEnemy);
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
          if (proj.fire) setBurning(s);
          hit = true;
        }
      }
    } else {
      for (let j = enemies.length - 1; j >= 0 && !hit; j--) {
        let en = enemies[j];
        if (Math.hypot(en.x - proj.x, en.y - proj.y) < en.radius + 3) {
          en.hp -= proj.damage;
          bleed(en, proj.owner);
          if (proj.fire) setBurning(en);
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
          woundBoar(b, proj.damage, proj.owner || null, proj.owner ? proj.owner.x : proj.x, proj.owner ? proj.owner.y : proj.y);
          hit = true;
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
    if (enemyDef.necromancer && enemyNecromancy(en, enemyDef.necromancer, dt)) continue;
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

  separateSettlersFromEnemies();
  for (const unit of settlers) tickAnimation(unit, dt);
  for (const splat of bloodSplats) splat.age += dt;
  bloodSplats = bloodSplats.filter(splat => bloodAlpha(splat.age) > 0);
  for (const pile of dung) pile.age += dt;
  dung = dung.filter(pile => pile.age < GAME_CONFIG.relief.dungSeconds);
  for (const unit of settlers) trackFootprints(unit);
  for (const unit of enemies) trackFootprints(unit);
  for (const unit of enemies) tickAnimation(unit, dt);
  applySpikeTraps();

  settlers.forEach(s => {
    if (s.hp <= 0 && !s.deadProcessed) {
      s.deadProcessed = true;
      refundEquipment(s);
      if (!s.crumbled) addCorpse(s, 'settler', s.type); // a crumbled zombie leaves only rot (#164)
      if (selectedSettler === s) selectedSettler = null;
    }
  });
  settlers = settlers.filter(s => s.hp > 0);
  enemies.forEach(en => {
    if (en.hp <= 0 && !en.rewardGranted) {
      en.rewardGranted = true;
      if (!en.crumbled) { grantEnemyReward(en); addCorpse(en, 'enemy', en.enemyKey); }
    }
  });
  enemies = enemies.filter(en => en.hp > 0);
  enemyTentBlueprints = enemyTentBlueprints.filter(site => enemies.includes(site.builder));
  updateCorpses(dt);

  updateUnitCounts();
  updateUI();
}
