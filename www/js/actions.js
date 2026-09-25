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

function damageSettler(settler, amount) {
  let damage = settler.armor === 'iron' ? amount * 0.65 : amount;
  settler.hp -= damage;
}

function hasAxeTool(tool) { return tool === 'axe' || tool === 'iron_axe'; }
function hasPickaxeTool(tool) { return tool === 'pickaxe' || tool === 'iron_pickaxe'; }
function isClubWeapon(weapon) { return weapon === 'club'; }
function isSwordWeapon(weapon) { return weapon === 'sword' || weapon === 'iron_sword'; }
function isSpearWeapon(weapon) { return weapon === 'spear' || weapon === 'iron_spear'; }
function isBowWeapon(weapon) { return weapon === 'bow'; }

function harvestResourceDirect(r, p) {
  if (!p || p.carrying || r.hidden || r.hideTarget) return;

  if (sticks.includes(r)) {
    sticks.splice(sticks.indexOf(r), 1);
    giveResourceToSettler(p, 'wood', 1);
    spawnResource('stick');
  } else if (pebbles.includes(r)) {
    pebbles.splice(pebbles.indexOf(r), 1);
    giveResourceToSettler(p, 'stone', 1);
    spawnResource('pebble');
  } else if (trees.includes(r)) {
    if (!hasAxeTool(p.tool) || r.isGrowing) return;
    r.hp -= p.tool === 'iron_axe' ? 1.5 : 1;
    if (r.hp <= 0) {
      trees.splice(trees.indexOf(r), 1);
      giveResourceToSettler(p, 'wood', 3);
      if (rand() < 0.5) saplings++;
      spawnResource('tree');
    }
  } else if (cacti.includes(r)) {
    if (!hasAxeTool(p.tool)) return;
    r.hp -= p.tool === 'iron_axe' ? 1.5 : 1;
    if (r.hp <= 0) {
      cacti.splice(cacti.indexOf(r), 1);
      giveResourceToSettler(p, 'wood', 1);
      spawnResource('cactus', r.x, r.y);
    }
  } else if (boulders.includes(r)) {
    if (!hasPickaxeTool(p.tool)) return;
    r.hp -= p.tool === 'iron_pickaxe' ? 1.5 : 1;
    if (r.hp <= 0) {
      boulders.splice(boulders.indexOf(r), 1);
      giveResourceToSettler(p, 'stone', 3);
      spawnResource('boulder');
    }
  } else if (ironOres.includes(r)) {
    if (!hasPickaxeTool(p.tool)) return;
    r.hp -= p.tool === 'iron_pickaxe' ? 1.5 : 1;
    if (r.hp <= 0) {
      ironOres.splice(ironOres.indexOf(r), 1);
      giveResourceToSettler(p, 'ironOre', 3);
      spawnResource('iron_ore', r.x, r.y);
    }
  } else if (coalOres.includes(r)) {
    if (!hasPickaxeTool(p.tool)) return;
    r.hp -= p.tool === 'iron_pickaxe' ? 1.5 : 1;
    if (r.hp <= 0) {
      coalOres.splice(coalOres.indexOf(r), 1);
      giveResourceToSettler(p, 'coal', 3);
      spawnResource('coal_ore', r.x, r.y);
    }
  } else if (naturalRocks.includes(r)) {
    if (!hasPickaxeTool(p.tool)) return;
    r.hp -= 25; 
    if (r.hp <= 0) {
      naturalRocks.splice(naturalRocks.indexOf(r), 1);
      giveResourceToSettler(p, 'stone', 15);
      invalidateAllPaths();
    }
  } else if (grassList.includes(r)) {
    grassList.splice(grassList.indexOf(r), 1);
    giveResourceToSettler(p, 'wheatSeeds', 1);
    spawnResource('grass');
  } else if (berryBushes.includes(r)) {
    berryBushes.splice(berryBushes.indexOf(r), 1);
    giveResourceToSettler(p, 'food', 2);
    spawnResource('berry_bush');
  } else if (r.isCarcass) {
    if (r.collector && r.collector !== p) return;
    boars.splice(boars.indexOf(r), 1);
    giveResourceToSettler(p, 'food', 6);
    giveResourceToSettler(p, 'leather', 2);
    invalidateAllPaths();
  } else if (boars.includes(r)) {
    r.hp -= 10;
    makeBoarFlee(r, p.x, p.y);
    if (r.hp <= 0) {
      boars.splice(boars.indexOf(r), 1);
      giveResourceToSettler(p, 'food', 6);
      giveResourceToSettler(p, 'leather', 2);
      invalidateAllPaths();
    }
  } else if (farmPlots.includes(r) && r.growth >= 100) {
    farmPlots.splice(farmPlots.indexOf(r), 1);
    giveResourceToSettler(p, 'food', 4);
  }
}

function invalidateAllPaths() {
  settlers.forEach(s => { s.path = null; s.pathTarget = null; });
  enemies.forEach(en => { en.path = null; en.pathTarget = null; });
}

function refundEquipment(settler, includeArmor = false, includeQuiver = false) {
  // refund exactly what the item cost, as defined in GAME_CONFIG
  let wallet = getWallet();
  for (const item of [getDefinition('weapons', settler.weapon), getDefinition('tools', settler.tool)]) {
    for (const [resource, amount] of Object.entries((item && item.cost) || {})) {
      wallet = spendResources(wallet, { [resource]: -amount });
    }
  }
  applyWallet(wallet);

  if (includeArmor && settler.armor === 'iron') iron += 8;
  if (includeQuiver && settler.quiver) {
    leather += 5;
    arrowsStock += settler.arrows || 0;
  }
}

function handleCanvasClick() {
  if (townHall.hp <= 0 || settlers.length === 0) {     
    let btnX = canvas.width / 2 - 100;     
    let btnY = canvas.height / 2 + 50;     
    if (mouse.x >= btnX && mouse.x <= btnX + 200 && mouse.y >= btnY && mouse.y <= btnY + 45) {       
      resetGame();       
      return;     
    }   
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
      giveResourceToSettler(p, 'food', 2);
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
  isPaused = !isPaused;
  const btn = document.getElementById('btn-pause-toggle');
  
  btn.innerText = isPaused ? "▶️" : "⏸️";
  btn.title = isPaused ? "Продолжить [Space]" : "Пауза [Space]";
  btn.classList.toggle('paused', isPaused);
}

function assignTool(toolType) {
  const item = getDefinition('tools', toolType);
  if (!item) {
    showNotification('⚠️ Неизвестный инструмент: ' + toolType, true);
    return;
  }

  const cost = item.cost || {};
  const wallet = getWallet();
  if (!canAfford(wallet, cost)) {
    showCostError(cost, '❌ Не хватает ресурсов! Нужны');
    return;
  }

  let target = (selectedSettler && settlers.includes(selectedSettler)) ? selectedSettler : null;
  if (!target) target = getPossessed();

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

  applyWallet(spendResources(wallet, cost));
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
  const wallet = getWallet();
  if (!canAfford(wallet, cost)) {
    showCostError(cost, '❌ Не хватает ресурсов! Нужно');
    return;
  }

  let target = (selectedSettler && settlers.includes(selectedSettler)) ? selectedSettler : null;
  if (!target) target = getPossessed();

  if (!target) {
    target = settlers.find(s => s.type === 'big' && s.weapon === 'fist' && !s.targetEquipment) ||
             settlers.find(s => s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.targetEquipment) ||
             settlers.find(s => s.weapon !== type && !s.targetEquipment);
  }

  if (!target) {
    showNotification('⚠️ Нет свободного поселенца для выдачи оружия!', true);
    return;
  }

  applyWallet(spendResources(wallet, cost));
  target.targetEquipment = { weapon: type, tool: 'none', role: type === 'bow' ? 'archer' : 'soldier' };
  if (type === 'bow') {
    target.targetEquipment.quiver = true;
    target.targetEquipment.quiverOnly = true;
  }
  showNotification('✅ Создано оружие (' + item.label + ')', false);
}

function craftArrows() {
  let target = (selectedSettler && settlers.includes(selectedSettler)) ? selectedSettler : null;
  if (!target) target = getPossessed();
  if (!target) target = settlers.find(s => s.weapon === 'bow' && s.quiver);
  if (!target || target.weapon !== 'bow' || !target.quiver) {
    showNotification("⚠️ Сначала нужен лучник с колчаном", true);
    return;
  }
  if (wood < 3 || stone < 1) {
    showNotification("❌ Для стрел нужно 3🪵 и 1🪨", true);
    return;
  }

  wood -= 3;
  stone -= 1;
  arrowsStock += 6;
  showNotification("✅ Создано 6 стрел. Они хранятся в ратуше", false);
}

function craftArmor() {
  if (iron >= 8) {
    iron -= 8;
    armorStock++;
    showNotification("✅ Железная броня создана и отправлена на склад Ратуши!", false);
    updateUI();
  } else {
    showNotification("❌ Не хватает переплавленного железа! Нужно 8🔩", true);
  }
}

function equipArmorToSelected() {
  let target = (selectedSettler && settlers.includes(selectedSettler)) ? selectedSettler : getPossessed();
  
  if (!target) {
    showNotification("⚠️ Сначала выберите поселенца или вселитесь в него!", true);
    return;
  }
  if (target.armor === 'iron') {
    showNotification("⚠️ У этого поселенца уже есть железная броня!", true);
    return;
  }
  if (armorStock <= 0) {
    showNotification("❌ На складе Ратуши нет готовой брони! Сначала скрафтьте её.", true);
    return;
  }

  armorStock--;
  target.armor = 'iron';
  target.hasArmor = true;
  target.maxHp = (target.maxHp || 100) + 50;
  target.hp += 50;

  showNotification("🛡️ Броня успешно надета на поселенца!", false);
  updateUI();
}

function disarmSettler(type = 'all') {
  let target = (selectedSettler && settlers.includes(selectedSettler)) ? selectedSettler : null;
  if (!target) target = getPossessed();

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
  let curPop = getCurrentPop();
  let maxPop = getMaxPop();
  let needed = (type === 'big' ? 2 : 1);

  if (curPop + needed > maxPop) {
    showNotification("⚠️ Превышен лимит поселенцев! Постройте палатку (🏕️)", true);
    return;
  }

  if (type === 'normal') {
    if (food < 15) {
      showNotification("❌ Не хватает еды! Нужно 15🍞 (у вас " + Math.floor(food) + "🍞)", true);
      return;
    }
    food -= 15;
    settlers.push({
    id: Date.now() + rand(),
    x: townHall.x + (rand() - 0.5) * 30,
    y: townHall.y + (rand() - 0.5) * 30,
	  hp: 100, maxHp: 100, 
	  armor: 'none',
	  hasArmor: false,
	  isPossessed: false, speed: 1.0, radius: 11, visualRadius: 11, weapon: 'fist', tool: 'none', role: 'worker', type: 'normal', carrying: null, targetEquipment: null, attackCooldown: 0, path: [], pathTarget: null, patrolTemplate: null, deadProcessed: false
	});
    showNotification("✅ Нанят рабочий!", false);
  } else if (type === 'big') {
    if (food < 30 || wood < 15) {
      let missing = [];
      if (food < 30) missing.push((30 - Math.floor(food)) + "🍞");
      if (wood < 15) missing.push((15 - Math.floor(wood)) + "🪵");
      showNotification("❌ Не хватает ресурсов! Нужно 30🍞 15🪵 (не хватает " + missing.join(", ") + ")", true);
      return;
    }
    food -= 30; wood -= 15;
    settlers.push({
    id: Date.now() + rand(),
    x: townHall.x + (rand() - 0.5) * 30,
    y: townHall.y + (rand() - 0.5) * 30,
	  hp: 250, maxHp: 250, 
	  armor: 'none',
	  hasArmor: false,
	  isPossessed: false, speed: 0.7, radius: 13, visualRadius: 18, weapon: 'fist', tool: 'none', role: 'worker', type: 'big', carrying: null, targetEquipment: null, attackCooldown: 0, path: [], pathTarget: null, patrolTemplate: null, deadProcessed: false
	});
    showNotification("✅ Нанят Богатырь!", false);
  }
}

function upgradeToBig(target) {
  if (!target) target = (selectedSettler && settlers.includes(selectedSettler)) ? selectedSettler : getPossessed();
  if (!target || target.type !== 'normal') target = settlers.find(s => s.type === 'normal');

  if (!target || target.type !== 'normal') {
    showNotification("❌ Нет подходящего обычного поселенца для улучшения!", true);
    return;
  }
  if (getCurrentPop() + 1 > getMaxPop()) {
    showNotification("⚠️ Превышен лимит поселенцев! Постройте палатку (🏕️)", true);
    return;
  }
  if (food < 15 || wood < 15) {
    let missing = [];
    if (food < 15) missing.push((15 - Math.floor(food)) + "🍞");
    if (wood < 15) missing.push((15 - Math.floor(wood)) + "🪵");
    showNotification("❌ Не хватает ресурсов! Нужно 15🍞 и 15🪵 (не хватает " + missing.join(", ") + ")", true);
    return;
  }

  food -= 15;
  wood -= 15;

  target.type = 'big';
  target.maxHp = 250;
  target.hp = Math.min(target.hp + 150, 250);
  target.speed = 0.7;
  target.radius = 13;
  target.visualRadius = 18;
  showNotification("✅ Поселенец улучшен в Богатыря!", false);
}

function setMode(mode) {
  buildMode = mode;
  document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  if (document.getElementById('btn-' + mode)) document.getElementById('btn-' + mode).classList.add('active');

  const item = getDefinition('buildings', mode);
  if (!item) return;

  const wallet = getWallet();
  if (!canAfford(wallet, item.cost || {})) {
    const missing = Object.entries(item.cost || {})
      .filter(([key, amount]) => Number(wallet[key] || 0) < Number(amount || 0))
      .map(([key, amount]) => `${Number(amount) - Number(wallet[key] || 0)}${getResourceIcon(key)}`)
      .join(', ');
    showNotification('💡 ' + item.label + ' стоит ' + formatCost(item.cost || {}) + ' (у вас не хватает ' + missing + ')', true);
  }
}

function getPossessed() { return settlers.find(s => s.isPossessed); }

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
