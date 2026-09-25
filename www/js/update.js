function update(dt) {
  if (!gameStarted || isPaused) return;

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

  foodTimer -= dt;
  if (foodTimer <= 0) {
    let mealCost = settlers.reduce((sum, s) => sum + (s.type === 'big' ? 2 : 1), 0);
    food = Math.max(0, food - mealCost);
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
      b.targetX = Math.max(60, Math.min(canvas.width - 60, b.x + Math.cos(ang) * dist));
      b.targetY = Math.max(60, Math.min(canvas.height - 60, b.y + Math.sin(ang) * dist));
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

  let tents = buildings.filter(b => b.type === 'tent');

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

  let workerAssignments = new Map();
  let blueprintAssignments = new Map();
  let allResources = getHarvestableResources();
  let markedResources = allResources.filter(r => (r.priority || 0) > 0);
  markedResources.sort((a, b) => b.priority - a.priority);

  let activeWaterSpots = waterTiles.filter(w => w.isFishing && isWaterReachable(w));
  let assignedFishersCount = 0;

  let defendersCount = settlers.filter(s => s.role === 'soldier' || s.role === 'archer' || s.weapon !== 'fist').length;
  let workersCount = settlers.filter(s => s.role === 'worker' && s.weapon === 'fist').length;
  let workersHelpTents = (defendersCount === 0 || defendersCount < workersCount);
  assignTowerArchers();

  settlers.forEach(s => {
    clampEntityToBounds(s);
    rescueSettlerFromResource(s);
    if (s.attackCooldown > 0) s.attackCooldown -= dt;
    if (s.towerAttackCooldown > 0) s.towerAttackCooldown -= dt;

    if (!s.isPossessed && s.role === 'worker' && s.weapon === 'fist' && s.tool === 'none' &&
        !s.carrying && !s.targetEquipment) {
      const towerForArrows = findTowerForArrows(s);
      if (towerForArrows) {
        updateTowerArrowLoader(s, towerForArrows, dt);
        s.patrolTarget = null;
        return;
      }
    }

    if (!s.carrying && s.role === 'worker' && !s.isPossessed && !s.targetEquipment) {
      let smelterWithIron = buildings.find(b => b.type === 'smelter' && b.ironProduced > 0);
      if (smelterWithIron) {
        let dist = Math.hypot(smelterWithIron.x - s.x, smelterWithIron.y - s.y);
        if (dist > (smelterWithIron.radius || 15) + s.radius + 8) {
          moveEntityTowards(s, smelterWithIron.x, smelterWithIron.y, s.speed, false, dt);
        } else {
          s.carrying = { type: 'iron', amount: smelterWithIron.ironProduced };
          smelterWithIron.ironProduced = 0;
        }
        return;
      }
    }

    if (!s.carrying && s.role === 'worker' && !s.isPossessed && !s.targetEquipment) {
      let smelterNeedsOre = buildings.find(b => b.type === 'smelter' && (b.oreLoaded || 0) < 10);
      let smelterNeedsCoal = buildings.find(b => b.type === 'smelter' && (b.coalLoaded || 0) < 10);

      if (ironOreStock > 0 && smelterNeedsOre) {
        let distToTH = Math.hypot(townHall.x - s.x, townHall.y - s.y);
        if (distToTH > townHall.radius + s.radius + 4) {
          moveSettlerToTownHall(s, s.speed, dt);
        } else {
          let amountToTake = Math.min(ironOreStock, 2);
          ironOreStock -= amountToTake;
          s.carrying = { type: 'smelterDelivery', resource: 'ironOre', amount: amountToTake, targetSmelter: smelterNeedsOre };
        }
        return;
      }

      if (coal > 0 && smelterNeedsCoal) {
        let distToTH = Math.hypot(townHall.x - s.x, townHall.y - s.y);
        if (distToTH > townHall.radius + s.radius + 4) {
          moveSettlerToTownHall(s, s.speed, dt);
        } else {
          let amountToTake = Math.min(coal, 2);
          coal -= amountToTake;
          s.carrying = { type: 'smelterDelivery', resource: 'coal', amount: amountToTake, targetSmelter: smelterNeedsCoal };
        }
        return;
      }
    }

    if (s.carrying && s.carrying.type === 'smelterDelivery') {
      let targetSmelter = s.carrying.targetSmelter;
      if (!buildings.includes(targetSmelter)) {
        if (s.carrying.resource === 'ironOre') ironOreStock += s.carrying.amount;
        if (s.carrying.resource === 'coal') coal += s.carrying.amount;
        s.carrying = null;
        return;
      }
      let dist = Math.hypot(targetSmelter.x - s.x, targetSmelter.y - s.y);
      if (dist > (targetSmelter.radius || 15) + s.radius + 8) {
        moveEntityTowards(s, targetSmelter.x, targetSmelter.y, s.speed, false, dt);
      } else {
        if (s.carrying.resource === 'ironOre') {
          targetSmelter.oreLoaded = (targetSmelter.oreLoaded || 0) + s.carrying.amount;
        } else if (s.carrying.resource === 'coal') {
          targetSmelter.coalLoaded = (targetSmelter.coalLoaded || 0) + s.carrying.amount;
        }
        s.carrying = null;
      }
      return;
    }

    if (s.towerAssignment) {
      if (enemies.length < s.towerAssignment.tower.minEnemies || enemies.some(enemy => Math.hypot(enemy.x - townHall.x, enemy.y - townHall.y) <= 260)) {
        releaseTowerGuard(s);
      } else {
        updateTowerGuard(s, s.towerAssignment, dt);
      }
      s.patrolTarget = null;
      if (s.towerAssignment) return;
    }

    if (townHall.repairRequested && townHall.hp < townHall.maxHp && s.role === 'worker' && !s.carrying && !s.targetEquipment && !s.isPossessed) {
      if (wood >= 15 && stone >= 15) {
        let dist = Math.hypot(townHall.x - s.x, townHall.y - s.y);
        if (dist > townHall.radius + s.radius + 4) {
          moveSettlerToTownHall(s, s.speed, dt);
          return;
        } else {
          wood -= 15; stone -= 15;
          townHall.hp = Math.min(townHall.maxHp, townHall.hp + 35);
          if (townHall.hp >= townHall.maxHp) townHall.repairRequested = false;
          return;
        }
      }
    }

    const damagedTower = buildings.find(building => building.type === 'watchtower' && building.hp < building.maxHp);
    if (damagedTower && s.role === 'worker' && !s.carrying && !s.targetEquipment && !s.isPossessed && !s.towerAssignment) {
      const distanceToTower = Math.hypot(damagedTower.x - s.x, damagedTower.y - s.y);
      if (distanceToTower > 34) {
        moveEntityTowards(s, damagedTower.x, damagedTower.y, s.speed, false, dt);
      } else if (wood >= 10 && stone >= 10) {
        damagedTower.repairTimer = (damagedTower.repairTimer || 0) - dt;
        if (damagedTower.repairTimer <= 0) {
          wood -= 10;
          stone -= 10;
          damagedTower.hp = Math.min(damagedTower.maxHp, damagedTower.hp + 35);
          damagedTower.repairTimer = 1;
        }
      }
      s.patrolTarget = null;
      return;
    }

    if (s.targetEquipment) {
      let dist = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (dist > townHall.radius + s.radius) {
        moveSettlerToTownHall(s, s.speed, dt);
      } else {
        let equipment = s.targetEquipment;
        if (!equipment.armorOnly) refundEquipment(s, equipment.armor === 'none', equipment.quiver === false);
        if (equipment.weapon !== undefined) s.weapon = equipment.weapon;
        if (equipment.tool !== undefined) s.tool = equipment.tool;
        if (equipment.role !== undefined) s.role = equipment.role;
        if (equipment.armor !== undefined) s.armor = equipment.armor === 'none' ? null : equipment.armor;
        if (equipment.quiverOnly) {
          s.quiver = true;
          s.quiverCapacity = 12;
          s.arrows = 0;
        }
        if (equipment.quiver !== undefined) s.quiver = equipment.quiver;
        s.targetEquipment = null;
      }
      return;
    }

    if (s.carrying) {
      let dist = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (dist > townHall.radius + s.radius) {
        moveSettlerToTownHall(s, s.speed, dt);
      } else {
        let carriedItems = s.carrying.items || [s.carrying];
        carriedItems.forEach(item => {
          if (item.type === 'wood') wood += item.amount;
          if (item.type === 'stone') stone += item.amount;
          if (item.type === 'iron') iron += item.amount;
          if (item.type === 'ironOre') ironOreStock += item.amount;
          if (item.type === 'coal') coal += item.amount;
          if (item.type === 'leather') leather += item.amount;
          if (item.type === 'food') food += item.amount;
          if (item.type === 'wheatSeeds') wheatSeeds += item.amount;
        });
        s.carrying = null;
      }
      return;
    }

    if (s.role === 'worker' && !s.isPossessed) {
      let damagedTent = buildings.find(b => b.type === 'tent' && b.hp < b.maxHp);
      if (damagedTent) {
        let tentThreatened = enemies.some(en => Math.hypot(en.x - damagedTent.x, en.y - damagedTent.y) < 120);
        if (!tentThreatened) {
          let distToTent = Math.hypot(damagedTent.x - s.x, damagedTent.y - s.y);
          if (distToTent > 32) {
            moveEntityTowards(s, damagedTent.x, damagedTent.y, s.speed, false, dt);
          } else {
            damagedTent.hp = Math.min(damagedTent.maxHp, damagedTent.hp + dt * 15);
          }
          s.patrolTarget = null;
          return;
        }
      }
    }

    if (s.hp < s.maxHp && tents.length > 0 && !s.isPossessed) {
      let nearbyThreat = enemies.some(en => Math.hypot(en.x - s.x, en.y - s.y) < 100);
      if (!nearbyThreat) {
        let nearestTent = tents.reduce((closest, t) => {
          let d = Math.hypot(t.x - s.x, t.y - s.y);
          return d < closest.d ? { tent: t, d: d } : closest;
        }, { tent: tents[0], d: Math.hypot(tents[0].x - s.x, tents[0].y - s.y) }).tent;

        let distToTent = Math.hypot(nearestTent.x - s.x, nearestTent.y - s.y);
        if (distToTent > 32) {
          moveEntityTowards(s, nearestTent.x, nearestTent.y, s.speed, false, dt);
          s.patrolTarget = null;
          return;
        } else {
          s.hp = Math.min(s.maxHp, s.hp + dt * 20);
          s.patrolTarget = null;
          if (s.hp < s.maxHp) return;
        }
      }
    }

    if (!s.isPossessed) {
      let isWaveActive = enemies.length > 0;

      let targetEnemy = null;
      let minBaseDist = Infinity;
      enemies.forEach(en => {
        let dToTown = Math.hypot(en.x - townHall.x, en.y - townHall.y);
        let dToSettler = Math.hypot(en.x - s.x, en.y - s.y);
        let score = dToTown + (dToSettler < 180 ? 0 : dToSettler * 0.4);
        if (score < minBaseDist) { minBaseDist = score; targetEnemy = en; }
      });

    if (isBowWeapon(s.weapon) && s.quiver) {
	  let currentArrows = s.arrows || 0;
	  let capacity = s.quiverCapacity || 12;
    let nearbyTower = findNearestArrowTower(s);
	  let townDistance = Math.hypot(townHall.x - s.x, townHall.y - s.y);
	  let isNearTownHall = townDistance <= townHall.radius + s.radius;
    let towerDistance = nearbyTower ? Math.hypot(nearbyTower.x - s.x, nearbyTower.y - s.y) : Infinity;

    if (nearbyTower && currentArrows < capacity) {
    if (towerDistance > 32) {
      moveEntityTowards(s, nearbyTower.x, nearbyTower.y, s.speed, false, dt);
      s.patrolTarget = null;
      return;
    }
    refillArcherFromTower(s, nearbyTower);
    currentArrows = s.arrows;
    }

    if (isNearTownHall && currentArrows < capacity && arrowsStock > 0) {
		let loadAmount = Math.min(arrowsStock, capacity - currentArrows);
		s.arrows = currentArrows + loadAmount;
		arrowsStock -= loadAmount;
		currentArrows = s.arrows;
	  }

	  if (currentArrows === 0 && arrowsStock > 0) {
		if (!isNearTownHall) {
		  moveSettlerToTownHall(s, s.speed, dt);
		  s.patrolTarget = null;
		  return;
		}
	  }
	}

      if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) {
        s.patrolTarget = null;
        return;
      }

      let distToClosestEn = targetEnemy ? Math.hypot(targetEnemy.x - s.x, targetEnemy.y - s.y) : Infinity;

      let isUnarmedOrRod = (s.weapon === 'fist');
      let isToolWorker = isUnarmedOrRod && (hasAxeTool(s.tool) || hasPickaxeTool(s.tool));
      let enemyNearTownHall = targetEnemy && Math.hypot(targetEnemy.x - townHall.x, targetEnemy.y - townHall.y) < 240;
      if (targetEnemy && (isWaveActive || distToClosestEn < 260 || s.role !== 'worker')) {
        if (isUnarmedOrRod && defendersCount > 0 && !(isToolWorker && enemyNearTownHall)) {
          let distToTown = Math.hypot(townHall.x - s.x, townHall.y - s.y);
          if (distToTown > townHall.radius + 15) {
            moveSettlerToTownHall(s, s.speed, dt);
          }
          s.patrolTarget = null;
          return;
        }

        let dist = distToClosestEn;
        if (isBowWeapon(s.weapon) && dist < 140) {
          performAttack(s, targetEnemy.x, targetEnemy.y);
        } else if (dist > (isSpearWeapon(s.weapon) ? 45 : 22)) {
          moveEntityTowards(s, targetEnemy.x, targetEnemy.y, s.speed, false, dt);
        } else {
          performAttack(s, targetEnemy.x, targetEnemy.y);
        }
        s.patrolTarget = null;
        return;
      }

      if (enemies.length <= 5 && enemyTents.length > 0) {
        let isSoldier = (s.role !== 'worker' || s.weapon !== 'fist');
        let shouldAttackTents = isSoldier || workersHelpTents;

        if (shouldAttackTents) {
          let nearestTent = null, minDist = Infinity;
          enemyTents.forEach(et => {
            let d = Math.hypot(et.x - s.x, et.y - s.y);
            if (d < minDist) { minDist = d; nearestTent = et; }
          });
          if (nearestTent) {
            let attackDist = isBowWeapon(s.weapon) ? 140 : 25;
            if (minDist > attackDist) {
              moveEntityTowards(s, nearestTent.x, nearestTent.y, s.speed, false, dt);
            } else {
              performAttack(s, nearestTent.x, nearestTent.y);
            }
            s.patrolTarget = null;
            return;
          }
        }
      }

      if (blueprints.length > 0 && !s.carrying && s.role === 'worker') {
        let hasNearbyEnemy = enemies.some(en => Math.hypot(en.x - s.x, en.y - s.y) < 220);
        if (!hasNearbyEnemy) {
          let bestBp = null;
          let minDist = Infinity;
          blueprints.forEach(bp => {
            let assignedCount = blueprintAssignments.get(bp) || 0;
            if (assignedCount < 3) {
              let d = Math.hypot(bp.x - s.x, bp.y - s.y);
              if (d < minDist) { minDist = d; bestBp = bp; }
            }
          });

          if (bestBp) {
            blueprintAssignments.set(bestBp, (blueprintAssignments.get(bestBp) || 0) + 1);
            let dist = Math.hypot(bestBp.x - s.x, bestBp.y - s.y);
            if (dist > 30) {
              moveEntityTowards(s, bestBp.x, bestBp.y, s.speed, false, dt);
            } else {
              bestBp.progress += dt * 40;
              if (bestBp.progress >= bestBp.maxProgress) {
                if (bestBp.type === 'demolish_building') {
                  let bIdx = buildings.indexOf(bestBp.targetBuilding);
                  if (bIdx !== -1) {
                    let b = buildings[bIdx];
                    if (b.type === 'wall_wood') wood += 3;
                    else if (b.type === 'wall_stone') stone += 3;
                    else if (b.type === 'door') wood += 3;
                    else if (b.type === 'tent') wood += 5;
                    else if (b.type === 'watchtower') { wood += 12; stone += 10; }
                    buildings.splice(bIdx, 1);
                  }
                  invalidateAllPaths();
                } else if (bestBp.type === 'wheat') {
                  farmPlots.push({ x: bestBp.x, y: bestBp.y, growth: 0, priority: 0, harvestProgress: 0 });
                } else if (bestBp.type === 'sapling') {
                  trees.push({ x: bestBp.x, y: bestBp.y, hp: 1, maxHp: 3, isGrowing: true, growProgress: 0, priority: 0 });
                } else {
                  buildings.push(bestBp);
                  ejectEntitiesFromTile(bestBp.x, bestBp.y);
                  invalidateAllPaths();
                }
                blueprints.splice(blueprints.indexOf(bestBp), 1);
              }
            }
            s.patrolTarget = null;
            return;
          }
        }
      }

      if (s.role === 'worker' || (s.role !== 'worker' && !isWaveActive)) {
        if (s.role === 'worker' && s.tool === 'rod') {
          let fishSpot = activeWaterSpots[assignedFishersCount];
          if (fishSpot) {
            assignedFishersCount++;
            let dist = Math.hypot(fishSpot.x - s.x, fishSpot.y - s.y);
            if (dist > 32) {
              moveEntityTowards(s, fishSpot.x, fishSpot.y, s.speed, false, dt);
            } else {
              fishSpot.fishTimer = (fishSpot.fishTimer || 0) + dt;
              if (fishSpot.fishTimer >= 3.0) {
                giveResourceToSettler(s, 'food', 2);
                fishSpot.fishTimer = 0;
              }
            }
            s.patrolTarget = null;
            return;
          }
        }

        const canHarvest = (r) => {
          if (s.role !== 'worker') {
            if (r.isCarcass) return r.collector === s;
            if (boars.includes(r)) return !isWaveActive && !r.hidden && !r.hideTarget;
            return false;
          }
          if (r.isCarcass) return r.collector === s;
          if (boars.includes(r)) {
            if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) return false;
            if (hasAxeTool(s.tool) || hasPickaxeTool(s.tool)) return false;
            if (r.hidden || r.hideTarget) return false;
            let hasNothing = (s.tool === 'none' && s.weapon === 'fist');
            let hasRod = (s.tool === 'rod');
            return !hasNothing && !hasRod;
          }

          if (grassList.includes(r) && boars.some(b => (b.hidden || b.hideTarget) && b.hideTarget === r)) return false;
          
          if (trees.includes(r)) return hasAxeTool(s.tool) && !r.isGrowing;
          if (cacti.includes(r)) return hasAxeTool(s.tool);
          if (boulders.includes(r)) return hasPickaxeTool(s.tool);
          if (ironOres.includes(r)) return hasPickaxeTool(s.tool);
          if (coalOres.includes(r)) return hasPickaxeTool(s.tool);
          if (naturalRocks.includes(r)) return hasPickaxeTool(s.tool);
          
          let hasPriority = (r.priority || 0) > 0;
          if (sticks.includes(r) || pebbles.includes(r) || grassList.includes(r) || berryBushes.includes(r) || (farmPlots.includes(r) && r.growth >= 100)) {
            return s.tool === 'none' || hasPriority;
          }
          
          return false;
        };

        let assignedRes = null;
        for (let r of markedResources) {
          if (canHarvest(r)) {
            let currentWorkers = workerAssignments.get(r) || 0;
            if (currentWorkers < r.priority) {
              assignedRes = r;
              workerAssignments.set(r, currentWorkers + 1);
              break;
            }
          }
        }

        if (!assignedRes && !isWaveActive) {
          let availableRes = allResources.filter(r => canHarvest(r) && (!r.priority || r.priority === 0) && !naturalRocks.includes(r));
          let minDist = Infinity;
          availableRes.forEach(r => {
            let d = Math.hypot(r.x - s.x, r.y - s.y);
            if (d < minDist) { minDist = d; assignedRes = r; }
          });
        }

        if (assignedRes) {
          let dist = Math.hypot(assignedRes.x - s.x, assignedRes.y - s.y);
          let approachPos = getResourceApproachPoint(s, assignedRes);
          if (!approachPos) {
            s.patrolTarget = null;
            return;
          }
          let distToApproach = Math.hypot(approachPos.x - s.x, approachPos.y - s.y);
          
          if (boars.includes(assignedRes)) {
            if (assignedRes.isCarcass) {
              if (dist > 25) {
                moveEntityTowards(s, assignedRes.x, assignedRes.y, s.speed, false, dt);
              } else {
                boars.splice(boars.indexOf(assignedRes), 1);
                giveResourceToSettler(s, 'food', 6);
                giveResourceToSettler(s, 'leather', 2);
                invalidateAllPaths();
              }
              s.patrolTarget = null;
              return;
            }
            if (assignedRes.hidden || assignedRes.hideTarget) {
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
            let attackDist = isBowWeapon(s.weapon) ? 140 : (isSpearWeapon(s.weapon) ? 65 : (isSwordWeapon(s.weapon) ? 42 : 28));
            if (dist > attackDist) {
              moveEntityTowards(s, assignedRes.x, assignedRes.y, s.speed, false, dt);
            } else {
              if (isBowWeapon(s.weapon)) {
                performAttack(s, assignedRes.x, assignedRes.y);
              } else if ((assignedRes.fleeTimer || 0) <= 0 && s.attackCooldown <= 0) {
                makeBoarFlee(assignedRes, s.x, s.y);
                let boarDamage = isSpearWeapon(s.weapon) ? (s.weapon === 'iron_spear' ? 28 : 22) : (isSwordWeapon(s.weapon) ? (s.weapon === 'iron_sword' ? 40 : 32) : (hasAxeTool(s.tool) ? (s.tool === 'iron_axe' ? 22 : 16) : (hasPickaxeTool(s.tool) ? (s.tool === 'iron_pickaxe' ? 21 : 15) : (s.tool === 'rod' ? 13 : 5))));
                assignedRes.hp -= boarDamage * (s.type === 'big' ? 1.8 : 1);
                s.attackCooldown = isSwordWeapon(s.weapon) ? 0.7 : (isSpearWeapon(s.weapon) ? 0.9 : 0.6);
                if (assignedRes.hp <= 0) {
                  boars.splice(boars.indexOf(assignedRes), 1);
                  giveResourceToSettler(s, 'food', 6);
                  giveResourceToSettler(s, 'leather', 2);
                  invalidateAllPaths();
                }
              }
            }
          } else {
            let harvestDist = 10;
            if (distToApproach > harvestDist) {
              moveEntityTowards(s, approachPos.x, approachPos.y, s.speed, false, dt);
            } else {
              if (trees.includes(assignedRes) && (!hasAxeTool(s.tool) || assignedRes.isGrowing)) return;
              if (cacti.includes(assignedRes) && !hasAxeTool(s.tool)) return;
              if (boulders.includes(assignedRes) && !hasPickaxeTool(s.tool)) return;
              if (ironOres.includes(assignedRes) && !hasPickaxeTool(s.tool)) return;
              if (coalOres.includes(assignedRes) && !hasPickaxeTool(s.tool)) return;
              if (naturalRocks.includes(assignedRes) && !hasPickaxeTool(s.tool)) return;

              if (sticks.includes(assignedRes)) {
                sticks.splice(sticks.indexOf(assignedRes), 1);
                giveResourceToSettler(s, 'wood', 1);
                spawnResource('stick');
              } else if (pebbles.includes(assignedRes)) {
                pebbles.splice(pebbles.indexOf(assignedRes), 1);
                giveResourceToSettler(s, 'stone', 1);
                spawnResource('pebble');
              } else if (ironOres.includes(assignedRes)) {
                assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
                assignedRes.harvestDuration = s.tool === 'iron_pickaxe' ? 2.0 : 3.0;
                assignedRes.hp = Math.max(0, assignedRes.maxHp * (1 - assignedRes.harvestProgress / assignedRes.harvestDuration));
                if (assignedRes.harvestProgress >= assignedRes.harvestDuration) {
                  ironOres.splice(ironOres.indexOf(assignedRes), 1);
                  giveResourceToSettler(s, 'ironOre', 3);
                  spawnResource('iron_ore', assignedRes.x, assignedRes.y);
                }
              } else if (coalOres.includes(assignedRes)) {
                assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
                assignedRes.harvestDuration = s.tool === 'iron_pickaxe' ? 1.7 : 2.5;
                assignedRes.hp = Math.max(0, assignedRes.maxHp * (1 - assignedRes.harvestProgress / assignedRes.harvestDuration));
                if (assignedRes.harvestProgress >= assignedRes.harvestDuration) {
                  coalOres.splice(coalOres.indexOf(assignedRes), 1);
                  giveResourceToSettler(s, 'coal', 3);
                  spawnResource('coal_ore', assignedRes.x, assignedRes.y);
                }
              } else if (farmPlots.includes(assignedRes)) {
                assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
                if (assignedRes.harvestProgress >= 2.5) {
                  farmPlots.splice(farmPlots.indexOf(assignedRes), 1);
                  giveResourceToSettler(s, 'food', 4);
                }
              } else if (grassList.includes(assignedRes) || berryBushes.includes(assignedRes)) {
                let harvestDuration = grassList.includes(assignedRes) ? 1.5 : 2.0;
                assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
                assignedRes.harvestDuration = harvestDuration;
                assignedRes.hp = Math.max(0, 1 - assignedRes.harvestProgress / harvestDuration);
                if (assignedRes.harvestProgress >= harvestDuration) {
                  if (grassList.includes(assignedRes)) {
                    grassList.splice(grassList.indexOf(assignedRes), 1);
                    giveResourceToSettler(s, 'wheatSeeds', 1);
                    spawnResource('grass');
                  } else {
                    berryBushes.splice(berryBushes.indexOf(assignedRes), 1);
                    giveResourceToSettler(s, 'food', 2);
                    spawnResource('berry_bush');
                  }
                }
              } else if (naturalRocks.includes(assignedRes)) {
                assignedRes.hp -= dt * (s.tool === 'iron_pickaxe' ? 38 : 25);
                if (assignedRes.hp <= 0) {
                  naturalRocks.splice(naturalRocks.indexOf(assignedRes), 1);
                  giveResourceToSettler(s, 'stone', 15);
                  invalidateAllPaths();
                }
              } else {
                let harvestSpeed = s.tool === 'iron_axe' ? 1.9 : 1;
                assignedRes.hp -= dt * (s.type === 'big' ? 2.5 : 1.5) * harvestSpeed;
                if (assignedRes.hp <= 0) {
                  if (trees.includes(assignedRes)) {
                    giveResourceToSettler(s, 'wood', 3);
                    if (rand() < 0.5) saplings++;
                    trees.splice(trees.indexOf(assignedRes), 1);
                    spawnResource('tree');
                  }
                  else if (cacti.includes(assignedRes)) { giveResourceToSettler(s, 'wood', 1); cacti.splice(cacti.indexOf(assignedRes), 1); spawnResource('cactus', assignedRes.x, assignedRes.y); }
                  else if (boulders.includes(assignedRes)) { giveResourceToSettler(s, 'stone', 3); boulders.splice(boulders.indexOf(assignedRes), 1); spawnResource('boulder'); }
                  else if (ironOres.includes(assignedRes)) { giveResourceToSettler(s, 'iron', 3); ironOres.splice(ironOres.indexOf(assignedRes), 1); spawnResource('iron_ore'); }
                }
              }
            }
          }
          s.patrolTarget = null;
          return;
        }
      }

      if (!s.patrolTarget || Math.hypot(s.x - s.patrolTarget.x, s.y - s.patrolTarget.y) < 15) {
        let ang = rand() * Math.PI * 2;
        let dist = 30 + rand() * 120;
        let px = townHall.x + Math.cos(ang) * dist;
        let py = townHall.y + Math.sin(ang) * dist;
        s.patrolTarget = { x: px, y: py };
      }
      moveEntityTowards(s, s.patrolTarget.x, s.patrolTarget.y, s.speed * 0.5, false, dt);
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
    if ((et.summonsLeft || 0) > 0 && et.summonTimer >= 5.0 && enemies.length < 60) {
      et.summonTimer = 0;
      et.summonsLeft--;
      let spawnPos = {
        x: Math.max(15, Math.min(canvas.width - 15, et.x + (rand() - 0.5) * 30)),
        y: Math.max(15, Math.min(canvas.height - 15, et.y + (rand() - 0.5) * 30))
      };
      enemies.push(createNormalEnemy(spawnPos));
    }
  });

  for (let i = projectiles.length - 1; i >= 0; i--) {
    let proj = projectiles[i];
    proj.x += proj.vx; proj.y += proj.vy; proj.life--;

    if (proj.fromEnemy) {
      if (Math.hypot(townHall.x - proj.x, townHall.y - proj.y) < townHall.radius) {
        townHall.hp -= proj.damage;
        projectiles.splice(i, 1);
        continue;
      }
      for (let s of settlers) {
        if (Math.hypot(s.x - proj.x, s.y - proj.y) < s.radius + 3) {
          damageSettler(s, proj.damage);
          projectiles.splice(i, 1);
          break;
        }
      }
    } else {
      for (let j = enemies.length - 1; j >= 0; j--) {
        let en = enemies[j];
        if (Math.hypot(en.x - proj.x, en.y - proj.y) < en.radius + 3) {
          en.hp -= proj.damage;
          projectiles.splice(i, 1);
          break;
        }
      }
      for (let j = enemyTents.length - 1; j >= 0; j--) {
        let et = enemyTents[j];
        if (Math.hypot(et.x - proj.x, et.y - proj.y) < 18) {
          et.hp -= proj.damage;
          projectiles.splice(i, 1);
          break;
        }
      }
      for (let j = boars.length - 1; j >= 0; j--) {
        let b = boars[j];
        if (!b.isCarcass && !b.hidden && !b.hideTarget && Math.hypot(b.x - proj.x, b.y - proj.y) < 12) {
          b.hp -= proj.damage;
          makeBoarFlee(b, proj.owner ? proj.owner.x : proj.x, proj.owner ? proj.owner.y : proj.y);
          projectiles.splice(i, 1);
          if (b.hp <= 0) {
            b.isCarcass = true;
            b.collector = proj.owner || null;
            b.fleeTimer = 0;
            b.hideTarget = null;
          }
          break;
        }
      }
    }
    if (proj.life <= 0) projectiles.splice(i, 1);
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    let en = enemies[i];
    clampEntityToBounds(en);

    if (en.buildTarget) {
      let site = en.buildTarget;
      if (!enemyTentBlueprints.includes(site)) {
        en.buildTarget = null;
      } else {
        let distToSite = Math.hypot(site.x - en.x, site.y - en.y);
        if (distToSite > 28) {
          moveEntityTowards(en, site.x, site.y, en.speed, true, dt);
        } else {
          site.progress += dt * 20;
          if (site.progress >= site.maxProgress) {
            enemyTents.push({ x: site.x, y: site.y, hp: 60, maxHp: 60, summonTimer: 0, summonsLeft: 2 });
            enemyTentBlueprints.splice(enemyTentBlueprints.indexOf(site), 1);
            en.buildTarget = null;
            invalidateAllPaths();
          }
        }
      }
      continue;
    }

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

    if (en.type === 'archer') {
      en.attackCooldown = (en.attackCooldown || 0) - dt;
      if (minDist < 180 && en.attackCooldown <= 0) {
        let angle = Math.atan2(target.y - en.y, target.x - en.x);
        projectiles.push({ x: en.x, y: en.y, vx: Math.cos(angle) * 3.8, vy: Math.sin(angle) * 3.8, damage: en.damage, life: 75, fromEnemy: true });
        en.attackCooldown = 1.5;
      }
    }

    // box distance, not center distance: an enemy pressed against a wall off-center is still touching it
    let touchingBuilding = buildings.find(b => collidesWithBoxList(en.x, en.y, en.radius + 2, [b], 15));
    let blockedRes = null;

    if (touchingBuilding) {
      if (touchingBuilding.type === 'tent') {
        touchingBuilding.hp -= dt * (en.type === 'big' ? 25 : 10);
        if (touchingBuilding.hp <= 0) {
          buildings.splice(buildings.indexOf(touchingBuilding), 1);
          invalidateAllPaths();
        }
      } else if (en.type === 'big' || !isBuildingSingle(touchingBuilding)) {
        touchingBuilding.hp -= dt * (en.type === 'big' ? 25 : 10);
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
        if (en.type === 'archer' && minDist < 150) {
        } else {
          moveEntityTowards(en, target.x, target.y, en.speed, true, dt);
        }
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
          destroyableResources.push(...cacti, ...ironOres, ...coalOres, ...naturalRocks);
        }
        for (let r of destroyableResources) {
          if (collidesWithBoxList(en.x, en.y, en.radius + 2, [r], 15)) {
            blockedRes = r;
            break;
          }
        }
      }

      if (blockedRes) {
        if (trees.includes(blockedRes)) {
          blockedRes.hp -= dt * (en.type === 'big' ? 4 : 2);
          if (blockedRes.hp <= 0) {
            trees.splice(trees.indexOf(blockedRes), 1);
            spawnResource('tree');
            invalidateAllPaths();
          }
        } else if (boulders.includes(blockedRes)) {
          blockedRes.hp -= dt * (en.type === 'big' ? 4 : 2);
          if (blockedRes.hp <= 0) {
            boulders.splice(boulders.indexOf(blockedRes), 1);
            spawnResource('boulder');
            invalidateAllPaths();
          }
        } else if (berryBushes.includes(blockedRes)) {
          berryBushes.splice(berryBushes.indexOf(blockedRes), 1);
          spawnResource('berry_bush');
          invalidateAllPaths();
        } else if (grassList.includes(blockedRes)) {
          grassList.splice(grassList.indexOf(blockedRes), 1);
          spawnResource('grass');
          invalidateAllPaths();
        } else if (en.type === 'big') {
          blockedRes.hp -= dt * 4;
          if (blockedRes.hp <= 0) {
            const resourceLists = [cacti, ironOres, coalOres, naturalRocks];
            const list = resourceLists.find(resources => resources.includes(blockedRes));
            if (list) list.splice(list.indexOf(blockedRes), 1);
            invalidateAllPaths();
          }
        }
      } else {
        if (en.type === 'archer' && minDist < 150) {
        } else {
          moveEntityTowards(en, target.x, target.y, en.speed, true, dt);
        }
      }
    }

    let weaponReach = en.weapon === 'spear' ? 24 : (en.weapon === 'sword' ? 12 : 6);
    let attackRange = (target === townHall ? townHall.radius : target.radius) + en.radius + weaponReach;
    if (en.type !== 'archer' && minDist < attackRange) {
      if (en.type === 'big') {
        let splashRadius = 70;
        let splashDamage = dt * en.damage * 0.6;
        if (target === townHall) townHall.hp -= dt * en.damage;
        else damageSettler(target, dt * en.damage);

        settlers.forEach(s => {
          if (s !== target && Math.hypot(en.x - s.x, en.y - s.y) < splashRadius + s.radius) {
            damageSettler(s, splashDamage);
          }
        });

        if (target !== townHall && Math.hypot(en.x - townHall.x, en.y - townHall.y) < splashRadius + townHall.radius) {
          townHall.hp -= splashDamage;
        }
      } else {
        if (target === townHall) townHall.hp -= dt * en.damage;
        else damageSettler(target, dt * en.damage);
      }
    }
  }

  settlers.forEach(s => {
    if (s.hp <= 0 && !s.deadProcessed) {
      s.deadProcessed = true;
      refundEquipment(s);
      if (selectedSettler === s) selectedSettler = null;
    }
  });
  settlers = settlers.filter(s => s.hp > 0);
  enemies.forEach(en => {
    if (en.hp <= 0 && !en.rewardGranted) {
      grantEnemyReward(en);
      en.rewardGranted = true;
    }
  });
  enemies = enemies.filter(en => en.hp > 0);
  enemyTentBlueprints = enemyTentBlueprints.filter(site => enemies.includes(site.builder));

  updateUnitCounts();
  updateUI();
}
