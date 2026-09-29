// A fisher at the town hall takes one seed as bait for the next catch
function takeFishingBait(s) {
  const bait = GAME_CONFIG.fishing.bait;
  if (s.tool === 'rod' && !s.bait && canAfford(bait)) {
    payCost(bait);
    s.bait = true;
  }
}

function giveResourceToSettler(s, type, amount) {
  if (!s) return;
  if (!s.carrying) {
    s.carrying = { type: type, amount: amount };
  } else if (s.carrying.type === type) {
    s.carrying.amount += amount;
  } else if (s.carrying.items) {
    let item = s.carrying.items.find(entry => entry.type === type);
    if (item) item.amount += amount;
    else s.carrying.items.push({ type: type, amount: amount });
  } else {
    s.carrying = { type: 'bundle', items: [{ type: s.carrying.type, amount: s.carrying.amount }, { type: type, amount: amount }] };
  }
}

// How many gathered loads this settler carries before heading home: its type's carryLoads, plus a
// backpack's. Fishers bring each catch home (they pick up bait there).
function getCarryCapacity(s) {
  if (s.tool === 'rod') return 1;
  const type = getDefinition('settlerTypes', s.type) || GAME_CONFIG.settlerTypes.normal;
  return (type.carryLoads || 1) + (s.backpack ? GAME_CONFIG.gear.backpack.extraLoads : 0);
}

// Count one more gathered load on what the settler carries
function addCarryLoad(s) {
  if (s && s.carrying) s.carrying.loads = (s.carrying.loads || 0) + 1;
}

// Carrying gathered loads but room for more (smelter runs etc. have no loads: always full)
function hasRoomToCarry(s) {
  return !!s.carrying && s.carrying.loads !== undefined && s.carrying.loads < getCarryCapacity(s);
}

// A shield only helps a melee soldier: a worker or an archer doesn't fight with it
function canUseShield(s) {
  return s.role === 'soldier' && !isBowWeapon(s.weapon);
}

function hasWorkingShield(s) {
  return !!s.shield && canUseShield(s);
}

// ---- Gear (GAME_CONFIG.gear): ordered with its button, put on / taken off at the town hall

// Who can wear each piece, and who gets it first when nobody who can is selected
const GEAR_RULES = {
  backpack: { canWear: s => s.role !== 'archer', first: s => s.role === 'worker' && s.tool !== 'rod' },
  armor: { canWear: () => true, first: s => s.role === 'soldier' && !isBowWeapon(s.weapon) },
  shield: { canWear: canUseShield, first: () => true }
};

function hasGear(s, id) {
  return id === 'armor' ? s.armor === 'iron' : !!s[id];
}

// Pay for a piece of gear and send a settler to pick it up at the town hall: the selected one if it can
// wear it, otherwise the first one the rules prefer, otherwise anyone who can
function orderGear(id) {
  const item = GAME_CONFIG.gear[id], rules = GEAR_RULES[id];
  const free = s => rules.canWear(s) && !hasGear(s, id) && !s.targetEquipment;
  const selected = getSelectedSettler() || getPossessed();
  const target = (selected && free(selected) ? selected : null) ||
    settlers.find(s => free(s) && rules.first(s)) || settlers.find(free);
  if (!target) {
    showNotification(`⚠️ Некому выдать: ${item.label}`, true);
    return;
  }
  if (!canAfford(item.cost)) {
    showCostError(item.cost, '❌ Не хватает ресурсов! Нужно');
    return;
  }
  payCost(item.cost);
  target.targetEquipment = { gear: id };
  showNotification(`✅ ${item.icon} ${item.label}: житель идёт за ним на базу`, false);
}

// Send the selected settler wearing it (or the first one) to the town hall to hand it back
function orderGearOff(id) {
  const item = GAME_CONFIG.gear[id];
  const selected = getSelectedSettler() || getPossessed();
  const target = selected && hasGear(selected, id) && !selected.targetEquipment
    ? selected
    : settlers.find(s => hasGear(s, id) && !s.targetEquipment);
  if (!target) {
    showNotification(`⚠️ Ни у кого нет: ${item.label}`, true);
    return;
  }
  target.targetEquipment = { gearOff: id };
  showNotification(`✅ ${item.icon} ${item.label}: житель несёт его на базу`, false);
}

// At the town hall (see equip()): put a piece on, or take it off and put its cost back in the stock
function putOnGear(s, id) {
  if (id === 'armor') {
    s.armor = 'iron';
    const bonus = GAME_CONFIG.gear.armor.hpBonus;
    s.maxHp = (s.maxHp || 100) + bonus;
    s.hp += bonus;
  } else {
    s[id] = true;
  }
}

function takeOffGear(s, id) {
  if (!hasGear(s, id)) return;
  if (id === 'armor') {
    s.armor = null;
    s.maxHp -= GAME_CONFIG.gear.armor.hpBonus;
    s.hp = Math.min(s.hp, s.maxHp);
  } else {
    s[id] = false;
  }
  addResources(GAME_CONFIG.gear[id].cost);
}

// attacker: the enemy dealing the damage, remembered so the settler can strike back (see update())
function damageSettler(settler, amount, attacker = null) {
  let damage = settler.armor === 'iron' ? amount * (1 - GAME_CONFIG.gear.armor.damageReduction) : amount;
  if (hasWorkingShield(settler)) damage *= 1 - GAME_CONFIG.gear.shield.damageReduction;
  settler.hp -= damage;
  if (attacker) {
    settler.lastAttacker = attacker;
    settler.lastAttackedTick = pathTick;
  }
}

// The enemy that hit this settler in the last few seconds, if it's still alive
function getRecentAttacker(settler) {
  const recent = pathTick - (settler.lastAttackedTick || -Infinity) < 4 * 60;
  return recent && enemies.includes(settler.lastAttacker) ? settler.lastAttacker : null;
}

// weapon / tool families, from GAME_CONFIG
function getToolFamily(tool) { const def = getDefinition('tools', tool); return def ? def.family : null; }
function getWeaponFamily(weapon) { const def = getDefinition('weapons', weapon); return def ? def.family : null; }
function hasAxeTool(tool) { return getToolFamily(tool) === 'axe'; }
function hasPickaxeTool(tool) { return getToolFamily(tool) === 'pickaxe'; }
function isClubWeapon(weapon) { return getWeaponFamily(weapon) === 'club'; }
function isSwordWeapon(weapon) { return getWeaponFamily(weapon) === 'sword'; }
function isSpearWeapon(weapon) { return getWeaponFamily(weapon) === 'spear'; }
function isBowWeapon(weapon) { return getWeaponFamily(weapon) === 'bow'; }

// A settler's weapon stats for `use` ('combat' or 'hunt'). Damage: the weapon's, or, for fists (and weapons
// with no damage for that use), the carried tool's, else bare hands; times the settler type's multiplier.
function getWeaponStats(s, use) {
  const fist = GAME_CONFIG.weapons.fist;
  const weapon = getDefinition('weapons', s.weapon) || fist;
  const stats = weapon[use];
  let damage = s.weapon !== 'fist' ? stats.damage : undefined;
  if (damage === undefined) {
    const tool = getDefinition('tools', s.tool);
    const toolDamage = tool && (use === 'combat' ? tool.combatDamage : tool.huntDamage);
    damage = toolDamage !== undefined && toolDamage !== null ? toolDamage : fist[use].damage;
  }
  const settlerType = GAME_CONFIG.settlerTypes[s.type];
  return { ...stats, damage, multiplier: settlerType ? settlerType.damageMultiplier : 1 };
}

// The possessed settler works a resource with a click: a hit (GAME_CONFIG.mapResources `hit`), or taken at once
function harvestResourceDirect(r, p) {
  if (!p || p.carrying || r.hidden || r.hideTarget) return;

  if (r.isCarcass) {
    if (r.collector && r.collector !== p) return;
    finishHarvest(p, r, 'boar');
    return;
  }
  if (boars.includes(r)) {
    const hunt = getWeaponStats(p, 'hunt');
    r.hp -= hunt.damage * hunt.multiplier;
    makeBoarFlee(r, p.x, p.y);
    if (r.hp <= 0) finishHarvest(p, r, 'boar');
    return;
  }

  const kind = getMapResourceKind(r);
  if (!kind) return;
  const def = getMapResourceDef(kind);
  if (kind === 'farm' && !(r.growth >= 100)) return;
  if (def.tool && (!hasToolFamily(p.tool, def.tool) || r.isGrowing || r.oreSpawner)) return;
  if (def.hit) {
    r.hp -= def.hit[p.tool] ?? def.hit.default;
    if (r.hp > 0) return;
  }
  finishHarvest(p, r, kind);
}

function invalidateAllPaths() {
  resetTileIndex();
  settlers.forEach(s => { s.path = null; s.pathTarget = null; });
  enemies.forEach(en => { en.path = null; en.pathTarget = null; });
}

function refundEquipment(settler, includeArmor = false, includeQuiver = false) {
  // refund exactly what the item cost, as defined in GAME_CONFIG
  for (const item of [getDefinition('weapons', settler.weapon), getDefinition('tools', settler.tool)]) {
    addResources((item && item.cost) || {});
  }

  if (includeArmor && settler.armor === 'iron') takeOffGear(settler, 'armor');
  if (includeQuiver && settler.quiver) {
    stock.leather += 5;
    stock.arrows += settler.arrows || 0;
  }
}

function handleCanvasClick() {
  if (townHall.hp <= 0 || settlers.length === 0) {
    // the defeat screen is drawn in screen space (see render()), so hit-test in screen coords:
    // world coords only matched it with the camera centered at zoom 1
    const btn = getRestartButton();
    const x = mouse.screenX / screenPixelRatio, y = mouse.screenY / screenPixelRatio;
    if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
      resetGame();
    }
    return;
  }

  if (buildMode === 'possess') {
    for (let s of settlers) {
      if (Math.hypot(mouse.x - s.x, mouse.y - s.y) < s.visualRadius + 10) {
        settlers.forEach(s2 => s2.isPossessed = false);
        s.isPossessed = true;
        return;
      }
    }
    return;
  }

  const p = getPossessed();

  if (p) {
    let nearEnemy = enemies.find(en => Math.hypot(mouse.x - en.x, mouse.y - en.y) < en.radius + 15);
    let nearTent = enemyTents.find(et => Math.hypot(mouse.x - et.x, mouse.y - et.y) < 25);
    let nearBoar = boars.find(b => !b.isCarcass && Math.hypot(mouse.x - b.x, mouse.y - b.y) < 25);
    if (nearEnemy || nearTent || nearBoar || p.weapon === 'bow') {
      performAttack(p, mouse.x, mouse.y);
      return;
    }

    let allResources = getHarvestableResources();
    let clickedRes = allResources.find(r => Math.hypot(mouse.x - r.x, mouse.y - r.y) < 25);
    if (clickedRes) {
      if (Math.hypot(p.x - clickedRes.x, p.y - clickedRes.y) < 50) {
        harvestResourceDirect(clickedRes, p);
      }
      return;
    }

    let clickedWater = waterTiles.find(w => Math.hypot(mouse.x - w.x, mouse.y - w.y) < 20);
    if (clickedWater && Math.hypot(p.x - clickedWater.x, p.y - clickedWater.y) < 50) {
      for (const [item, amount] of Object.entries(GAME_CONFIG.fishing.catch)) giveResourceToSettler(p, item, amount);
      return;
    }
  }

  if (buildMode === 'interact') {
    let clickedSettler = settlers.find(s => Math.hypot(mouse.x - s.x, mouse.y - s.y) < s.visualRadius + 8);
    if (clickedSettler) {
      selectedSettler = (selectedSettler === clickedSettler) ? null : clickedSettler;
      return;
    }
  }

  let gxIdx = Math.floor(mouse.x / TILE_SIZE);
  let gyIdx = Math.floor(mouse.y / TILE_SIZE);
  let gx = gxIdx * TILE_SIZE + TILE_SIZE / 2;
  let gy = gyIdx * TILE_SIZE + TILE_SIZE / 2;

  if (Math.hypot(mouse.x - townHall.x, mouse.y - townHall.y) < townHall.radius + 10) {
    if (townHall.hp < townHall.maxHp) {
      townHall.repairRequested = !townHall.repairRequested;
      return;
    }
  }

  if (buildMode === 'interact') {
    const damaged = buildings.find(b => b.x === gx && b.y === gy && b.hp < b.maxHp);
    if (damaged && toggleBuildingRepair(damaged)) return;
  }

  // Farming tab: paint (or clear) farm zone tiles
  if (buildMode.startsWith('zone_')) {
    if (!isBorderZone(gxIdx, gyIdx)) toggleFarmZone(gx, gy, buildMode.slice('zone_'.length));
    return;
  }

  if (buildMode !== 'interact' && buildMode !== 'possess' && buildMode !== 'demolish') {
    if (isBorderZone(gxIdx, gyIdx)) {
      return;
    }
    if (farmZones.some(z => z.x === gx && z.y === gy)) {
      showNotification('❌ Здесь зона фермы: сначала уберите зону', true);
      return;
    }
    if (!isBuildLocationAllowed(gx, gy)) {
      if (Math.hypot(gx - townHall.x, gy - townHall.y) < townHall.radius + 15) {
        showNotification("❌ Нельзя строить на клетке ратуши", true);
      } else {
        showNotification("❌ Эта клетка занята", true);
      }
      return;
    }
  }

  if (buildMode === 'interact') {
    // pointing at an enemy marks it as a priority target for armed settlers; again to unmark
    let clickedEnemy = enemies.find(en => Math.hypot(mouse.x - en.x, mouse.y - en.y) < en.radius + 8);
    if (clickedEnemy) {
      clickedEnemy.markedTarget = !clickedEnemy.markedTarget;
      return;
    }

    let clickedWater = waterTiles.find(w => Math.hypot(mouse.x - w.x, mouse.y - w.y) < 18);
    if (clickedWater) {
      if (isWaterReachable(clickedWater)) {
        clickedWater.isFishing = !clickedWater.isFishing;
      }
      return;
    }

    let allResources = getHarvestableResources();
    let clickedRes = allResources.find(r => Math.hypot(mouse.x - r.x, mouse.y - r.y) < 22);

    if (clickedRes) {
      clickedRes.priority = ((clickedRes.priority || 0) + 1) % 4;
      return;
    }

  } else if (getDefinition('buildings', buildMode)) {
    const building = getDefinition('buildings', buildMode);
    if (!canBuild(buildMode)) {
      showCostError(building.cost || {}, `❌ ${building.label}: не хватает`);
    } else if (isBuildLocationAllowed(gx, gy)) {
      blueprints.push(createBuildingBlueprint(buildMode, gx, gy));
      payBuildingCost(buildMode);
    }
  } else if (buildMode === 'demolish') {
    let targetBuilding = buildings.find(b => Math.abs(b.x - gx) < 15 && Math.abs(b.y - gy) < 15);
    if (targetBuilding) {
      if (!targetBuilding.isDemolishing) {
        targetBuilding.isDemolishing = true;
        blueprints.push({ type: 'demolish_building', targetBuilding: targetBuilding, x: targetBuilding.x, y: targetBuilding.y, progress: 0, maxProgress: 50 });
      }
      return;
    }
    let targetBp = blueprints.find(b => Math.abs(b.x - gx) < 15 && Math.abs(b.y - gy) < 15);
    if (targetBp) {
      if (targetBp.type === 'demolish_building' && targetBp.targetBuilding) {
        targetBp.targetBuilding.isDemolishing = false;
      }
      blueprints.splice(blueprints.indexOf(targetBp), 1);
      return;
    }
  }
}

// A farm zone goes only on grass ground (not sand, water, rock, a building or a blueprint) with nothing
// on it that needs a tool (a grown tree, boulder, ore, cactus). What's gathered by hand (grass, sticks,
// pebbles, bushes) is fine: workers clear it (see findZoneBlockers).
function canBeFarmZone(x, y) {
  if (Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + 15) return false;
  const at = o => o.x === x && o.y === y;
  if (isDesertTile(x, y) || beachTiles.some(at)) return false;
  if (waterTiles.some(at) || buildings.some(at) || blueprints.some(at)) return false;
  for (const [kind, def] of Object.entries(GAME_CONFIG.mapResources)) {
    if (def.tool && WORLD[def.list].some(o => at(o) && !(kind === 'tree' && o.isGrowing))) return false;
  }
  return true;
}

// Mark tile (x, y) as a farm zone for `crop` ('wheat' / 'sapling'), or unmark it: tapping a tile
// already in that zone, or with crop 'clear'. See canBeFarmZone for where it can go.
function toggleFarmZone(x, y, crop) {
  const existing = farmZones.find(z => z.x === x && z.y === y);
  if (crop === 'clear' || (existing && existing.crop === crop)) {
    if (existing) farmZones.splice(farmZones.indexOf(existing), 1);
    return;
  }
  if (!existing && !canBeFarmZone(x, y)) {
    showNotification('❌ Зона — только на траве, где нет деревьев, камней и построек', true);
    return;
  }
  if (existing) existing.crop = crop;
  else farmZones.push({ x, y, crop });
}

function processInteraction(clientX, clientY) {
  updateInputPos(clientX, clientY);
  handleCanvasClick();
}

canvas.addEventListener('pointerup', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  if (e.pointerType === 'touch' && !isTap) return;

  processInteraction(e.clientX, e.clientY);
});

function ejectEntitiesFromTile(x, y) {
  const allEntities = [...settlers, ...enemies];
  allEntities.forEach(ent => {
    if (Math.abs(ent.x - x) < 16 + ent.radius && Math.abs(ent.y - y) < 16 + ent.radius) {
      const offsets = [
        {x: 0, y: -TILE_SIZE}, {x: 0, y: TILE_SIZE}, {x: -TILE_SIZE, y: 0}, {x: TILE_SIZE, y: 0}
      ];
      for (let off of offsets) {
        let nx = x + off.x, ny = y + off.y;
        if (!collidesWithWall(nx, ny, ent.radius)) {
          ent.x = nx; ent.y = ny;
          break;
        }
      }
    }
  });
}

function togglePause() {
  if (!gameStarted) return;
  setPaused(!isPaused);
}

// Pausing opens the pause menu (Continue / Main menu)
function setPaused(paused) {
  isPaused = paused;
  const btn = document.getElementById('btn-pause-toggle');
  btn.innerText = isPaused ? "▶️" : "⏸️";
  btn.title = isPaused ? "Продолжить [Space]" : "Пауза [Space]";
  btn.classList.toggle('paused', isPaused);
  document.getElementById('pause-menu').hidden = !isPaused;
}

function exitToMainMenu() {
  setPaused(false);
  gameStarted = false;
  document.getElementById('main-menu').style.display = '';
}

function assignTool(toolType) {
  const item = getDefinition('tools', toolType);
  if (!item) {
    showNotification('⚠️ Неизвестный инструмент: ' + toolType, true);
    return;
  }

  const cost = item.cost || {};
  if (!canAfford(cost)) {
    showCostError(cost, '❌ Не хватает ресурсов! Нужны');
    return;
  }

  let target = getSelectedSettler() || getPossessed();

  if (!target) {
    if (toolType === 'rod') {
      target = settlers.find(s => s.type === 'normal' && s.role === 'worker' && s.tool === 'none' && !s.targetEquipment) ||
               settlers.find(s => s.type === 'normal' && s.role === 'worker' && s.tool !== toolType && !s.targetEquipment);
    } else {
      target = settlers.find(s => s.type === 'normal' && s.role === 'worker' && s.tool === 'none' && !s.targetEquipment) ||
               settlers.find(s => s.role === 'worker' && s.tool === 'none' && !s.targetEquipment) || 
               settlers.find(s => s.role === 'worker' && s.tool !== toolType && !s.targetEquipment);
    }
  }

  if (!target) {
    showNotification('⚠️ Нет свободного поселенца для вручения инструмента!', true);
    return;
  }

  payCost(cost);
  target.targetEquipment = { weapon: 'fist', tool: toolType, role: 'worker' };
  showNotification('✅ Выдан инструмент (' + item.label + ')', false);
}

function craftWeapon(type) {
  const item = getDefinition('weapons', type);
  if (!item) {
    showNotification('⚠️ Неизвестное оружие: ' + type, true);
    return;
  }

  const cost = item.cost || {};
  if (!canAfford(cost)) {
    showCostError(cost, '❌ Не хватает ресурсов! Нужно');
    return;
  }

  let target = getSelectedSettler() || getPossessed();

  if (!target) {
    target = settlers.find(s => s.type === 'big' && s.weapon === 'fist' && !s.targetEquipment) ||
             settlers.find(s => s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.targetEquipment) ||
             settlers.find(s => s.weapon !== type && !s.targetEquipment);
  }

  if (!target) {
    showNotification('⚠️ Нет свободного поселенца для выдачи оружия!', true);
    return;
  }

  payCost(cost);
  target.targetEquipment = { weapon: type, tool: 'none', role: type === 'bow' ? 'archer' : 'soldier' };
  if (type === 'bow') {
    target.targetEquipment.quiver = true;
    target.targetEquipment.quiverOnly = true;
  }
  showNotification('✅ Создано оружие (' + item.label + ')', false);
}

function craftArrows() {
  let target = getSelectedSettler() || getPossessed();
  if (!target) target = settlers.find(s => s.weapon === 'bow' && s.quiver);
  if (!target || target.weapon !== 'bow' || !target.quiver) {
    showNotification("⚠️ Сначала нужен лучник с колчаном", true);
    return;
  }
  const recipe = GAME_CONFIG.recipes.arrows;
  if (!canAfford(recipe.cost)) {
    showCostError(recipe.cost, `❌ ${recipe.label}: нужно`);
    return;
  }

  payCost(recipe.cost);
  addResources(recipe.produces);
  showNotification(`✅ Создано ${recipe.produces.arrows} стрел. Они хранятся в ратуше`, false);
}

function disarmSettler(type = 'all') {
  let target = getSelectedSettler() || getPossessed();

  const hasTargetItem = (s) => {
    if (type === 'tool') return s.tool && s.tool !== 'none';
    if (type === 'weapon') return (s.weapon && s.weapon !== 'fist') || s.role !== 'worker';
    return (s.tool !== 'none' || s.weapon !== 'fist' || s.role !== 'worker');
  };

  if (target && !hasTargetItem(target)) {
    target = null;
  }

  if (!target) {
    target = settlers.find(s => hasTargetItem(s) && !s.targetEquipment);
  }

  if (target) {
    const isDisarmingWeapon = type === 'weapon' || type === 'all';
    const isDisarmingTool = type === 'tool' || type === 'all';

    target.targetEquipment = {
      weapon: isDisarmingWeapon ? 'fist' : (target.weapon || 'fist'),
      tool: isDisarmingTool ? 'none' : (target.tool || 'none'),
      role: isDisarmingWeapon ? 'worker' : (target.role || 'worker'),
      armor: target.armor || 'none', // armour has its own button now (orderGearOff)
      quiver: isDisarmingWeapon ? false : (target.quiver || false)
    };

    const notificationText = type === 'tool' ? "✅ Инструмент разобран" :
                             type === 'weapon' ? "✅ Оружие разобрано" : "✅ Предмет разобран";
    showNotification(notificationText, false);
  } else {
    const errorText = type === 'tool' ? "⚠️ Нет поселенца с инструментом!" :
                      type === 'weapon' ? "⚠️ Нет поселенца с оружием или броней!" : "⚠️ Нет поселенца с предметом для разбора!";
    showNotification(errorText, true);
  }
}

function spawnSettler(type = 'normal') {
  const settlerType = GAME_CONFIG.settlerTypes[type];
  if (!settlerType) return;

  if (getCurrentPop() + settlerType.population > getMaxPop()) {
    showNotification("⚠️ Превышен лимит поселенцев! Постройте палатку (🏕️)", true);
    return;
  }
  if (!canAfford(settlerType.hireCost)) {
    showCostError(settlerType.hireCost, `❌ ${settlerType.label}: нужно`);
    return;
  }
  payCost(settlerType.hireCost);
  settlers.push(createSettler(type, Date.now() + rand(), townHall.x + (rand() - 0.5) * 30, townHall.y + (rand() - 0.5) * 30, { armor: 'none', hasArmor: false }));
  showNotification(`✅ Нанят: ${settlerType.label}!`, false);
}

function upgradeToBig(target) {
  const normal = GAME_CONFIG.settlerTypes.normal, big = GAME_CONFIG.settlerTypes.big;
  if (!target) target = getSelectedSettler() || getPossessed();
  if (!target || target.type !== 'normal') target = settlers.find(s => s.type === 'normal');

  if (!target || target.type !== 'normal') {
    showNotification("❌ Нет подходящего обычного поселенца для улучшения!", true);
    return;
  }
  if (getCurrentPop() + big.population - normal.population > getMaxPop()) {
    showNotification("⚠️ Превышен лимит поселенцев! Постройте палатку (🏕️)", true);
    return;
  }
  if (!canAfford(big.upgradeCost)) {
    showCostError(big.upgradeCost, `❌ Улучшение в ${big.label}а: нужно`);
    return;
  }

  payCost(big.upgradeCost);

  target.type = 'big';
  target.maxHp = big.hp;
  target.hp = Math.min(target.hp + (big.hp - normal.hp), big.hp);
  target.speed = big.speed;
  target.radius = big.radius;
  target.visualRadius = big.visualRadius;
  showNotification(`✅ Поселенец улучшен: ${big.label}!`, false);
}

function setMode(mode) {
  buildMode = mode;
  document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  if (document.getElementById('btn-' + mode)) document.getElementById('btn-' + mode).classList.add('active');

  const item = getDefinition('buildings', mode);
  if (!item) return;

  if (!canAfford(item.cost || {})) {
    const missing = getMissingCost(item.cost || {});
    showNotification('💡 ' + item.label + ' стоит ' + formatCost(item.cost || {}) + ' (у вас не хватает ' + missing + ')', true);
  }
}

function getPossessed() { return settlers.find(s => s.isPossessed); }

// the settler picked in the UI, if it's still alive
function getSelectedSettler() {
  return selectedSettler && settlers.includes(selectedSettler) ? selectedSettler : null;
}

let lastPossessedIndex = -1;

function unpossess() {
  const currentIdx = settlers.findIndex(s => s.isPossessed);
  if (currentIdx !== -1) {
    lastPossessedIndex = currentIdx;
  }
  settlers.forEach(s => s.isPossessed = false);
}

function switchPossession() {
  if (settlers.length === 0) return;

  const currentPossessed = getPossessed();

  if (selectedSettler) {
    if (currentPossessed === selectedSettler) {
      unpossess();
    } else {
      unpossess();
      selectedSettler.isPossessed = true;

      const idx = settlers.indexOf(selectedSettler);
      if (idx !== -1) lastPossessedIndex = idx;
    }
    return;
  }

  if (currentPossessed) {
    unpossess();
  } else {
    let nextIdx = (lastPossessedIndex + 1) % settlers.length;
    if (nextIdx >= settlers.length || nextIdx < 0) nextIdx = 0;

    settlers[nextIdx].isPossessed = true;
    lastPossessedIndex = nextIdx;
  }
}
