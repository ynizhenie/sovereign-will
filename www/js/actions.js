
function handleCanvasClick() {
  // battle mode: placing while setting up; in a fight, orders for a possessed unit (#166)
  if (gameMode === 'battle') {
    if (battle.phase === 'setup') battleTap(mouse.x, mouse.y);
    else if (battle.phase === 'fight' && getPossessed()) orderPossessed(getPossessed(), mouse.x, mouse.y);
    return;
  }
  if (gameMode === 'editor') { editorTap(mouse.x, mouse.y); return; }
  if (isDefeated()) return; // the defeat screen's own buttons (#191)

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
  if (p && orderPossessed(p, mouse.x, mouse.y)) return;

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
    // the demons' sacrificial circle (#43): the selected settler goes into it
    const circle = buildings.find(b => b.x === gx && b.y === gy && (getDefinition('buildings', b.type) || {}).sacrifice);
    if (circle) {
      const victim = getSelectedSettler();
      if (!victim) { showNotification(t('sacrifice.pick'), true); return; }
      victim.sacrificeAt = circle;
      selectedSettler = null;
      showNotification(t('sacrifice.going', { name: GAME_CONFIG.settlerTypes[victim.type].label }), false);
      return;
    }
  }

  // Blight tab (the undead, #164): mark ground for a necromancer to blight; the same tile again takes the
  // mark away, as farm zones (#186)
  if (buildMode === 'blight' || buildMode === 'blight_clear') {
    toggleBlightZone(gx, gy, gxIdx, gyIdx, buildMode === 'blight_clear');
    return;
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
      showNotification(t('build.zoneHere'), true);
      return;
    }
    if (!isBuildLocationAllowed(gx, gy)) {
      if (Math.hypot(gx - townHall.x, gy - townHall.y) < townHall.radius + 15) {
        showNotification(t('build.onHall'), true);
      } else {
        showNotification(t('build.occupied'), true);
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
      // an apple tree marked while it has apples gets its apples picked, not felled (see pickApples)
      if (clickedRes.apple) clickedRes.markIntent = clickedRes.applesReady ? 'apples' : 'chop';
      return;
    }

  } else if (getDefinition('buildings', buildMode)) {
    const building = getDefinition('buildings', buildMode);
    if (!canBuild(buildMode)) {
      showCostError(building.cost || {}, t('cost.needs', { name: building.label }), getFreeStock);
    } else if (isBuildLocationAllowed(gx, gy)) {
      // its cost stays in storage until builders bring it (#36)
      const bp = createBuildingBlueprint(buildMode, gx, gy);
      bp.needs = { ...(building.cost || {}) };
      blueprints.push(bp);
      // placed: back to Point, unless Shift is held to place another (a playtest found it stayed on)
      if (!shiftDown) setMode('interact');
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
      // materials already brought go back to storage
      const building = getDefinition('buildings', targetBp.type);
      if (building && targetBp.needs) {
        addResources(Object.fromEntries(Object.entries(building.cost || {}).map(([id, amount]) => [id, amount - (targetBp.needs[id] || 0)])));
      }
      blueprints.splice(blueprints.indexOf(targetBp), 1);
      return;
    }
  }
}

// Mark tile (x, y) as a farm zone for `crop` ('wheat' / 'sapling'), or unmark it: tapping a tile
// already in that zone, or with crop 'clear'. See canBeFarmZone for where it can go.
// A marked tile not blighted yet goes at once; blighted ground fades over clearSeconds (still blighted till
// then), and a tap while it fades keeps it. Ground blighted round the graveyard or a grave takes no mark (#186).
function toggleBlightZone(x, y, gx, gy, clearOnly) {
  const existing = blightZones.find(z => z.x === x && z.y === y);
  if (existing) {
    if (!existing.done) blightZones.splice(blightZones.indexOf(existing), 1);
    else if (existing.clearing === undefined) existing.clearing = GAME_CONFIG.blight.clearSeconds;
    else if (!clearOnly) delete existing.clearing;
    return;
  }
  if (clearOnly || isBorderZone(gx, gy) || isTileBlockedForSettler(gx, gy)) return;
  if (isBaseBlighted(x, y)) { showNotification(t('blight.already'), true); return; }
  blightZones.push({ x, y, done: false });
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

function togglePause() {
  if (!gameStarted) return;
  setPaused(!isPaused);
}

// Pausing opens the pause menu (Continue / Main menu)
function setPaused(paused) {
  isPaused = paused;
  const btn = document.getElementById('btn-pause-toggle');
  btn.innerHTML = iconHtml(isPaused ? 'play' : 'pause');
  btn.title = isPaused ? t('pause.resumeHint') : t('pause.pauseHint');
  btn.classList.toggle('paused', isPaused);
  document.getElementById('pause-menu').hidden = !isPaused;
}

function exitToMainMenu() {
  setPaused(false);
  gameStarted = false;
  document.getElementById('main-menu').style.display = '';
  showMenuScreen('home');
}

function setMode(mode) {
  buildMode = mode;
  document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  if (document.getElementById('btn-' + mode)) document.getElementById('btn-' + mode).classList.add('active');

  const item = getDefinition('buildings', mode);
  if (!item) return;

  if (!canAfford(item.cost || {})) {
    const missing = getMissingCost(item.cost || {});
    showNotification(t('build.costs', { name: item.label, cost: formatCost(item.cost || {}), missing }), true);
  }
}
