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

// attacker: the enemy dealing the damage, remembered so the settler can strike back (see update())
function damageSettler(settler, amount, attacker = null) {
  let damage = settler.armor === 'iron' ? amount * 0.65 : amount;
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

  if (includeArmor && settler.armor === 'iron') addResources(GAME_CONFIG.recipes.armor.cost);
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

  if (buildMode !== 'interact' && buildMode !== 'possess' && buildMode !== 'demolish') {
    if (isBorderZone(gxIdx, gyIdx)) {
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

function craftArmor() {
  const recipe = GAME_CONFIG.recipes.armor;
  if (canAfford(recipe.cost)) {
    payCost(recipe.cost);
    addResources(recipe.produces);
    showNotification("✅ Железная броня создана и отправлена на склад Ратуши!", false);
    updateUI();
  } else {
    showCostError(recipe.cost, `❌ ${recipe.label}: нужно`);
  }
}

function equipArmorToSelected() {
  let target = getSelectedSettler() || getPossessed();
  
  if (!target) {
    showNotification("⚠️ Сначала выберите поселенца или вселитесь в него!", true);
    return;
  }
  if (target.armor === 'iron') {
    showNotification("⚠️ У этого поселенца уже есть железная броня!", true);
    return;
  }
  if (stock.armor <= 0) {
    showNotification("❌ На складе Ратуши нет готовой брони! Сначала скрафтьте её.", true);
    return;
  }

  stock.armor--;
  target.armor = 'iron';
  target.hasArmor = true;
  const hpBonus = GAME_CONFIG.recipes.armor.hpBonus;
  target.maxHp = (target.maxHp || 100) + hpBonus;
  target.hp += hpBonus;

  showNotification("🛡️ Броня успешно надета на поселенца!", false);
  updateUI();
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
      armor: isDisarmingWeapon ? 'none' : (target.armor || 'none'),
      quiver: isDisarmingWeapon ? false : (target.quiver || false)
    };

    const notificationText = type === 'tool' ? "✅ Инструмент разобран" :
                             type === 'weapon' ? "✅ Оружие и броня разобраны" : "✅ Предмет разобран";
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
