// A fisher at the town hall takes one seed as bait for the next catch
// The bait a fisher would take now: the first of GAME_CONFIG.fishing.bait the stock has (worms first)
function getFishingBait() {
  return GAME_CONFIG.fishing.bait.find(bait => canAfford(bait)) || null;
}

// A fisher at a storage takes one bait from it, if it has any (worms first)
function takeFishingBait(s, storage) {
  if (s.tool !== 'rod' || s.bait) return;
  const bait = GAME_CONFIG.fishing.bait.find(b => hasInStorage(storage, b));
  if (!bait) return;
  for (const [id, amount] of Object.entries(bait)) takeFrom(storage, id, amount);
  s.bait = true;
}

function hasInStorage(storage, amounts) {
  return Object.entries(amounts).every(([id, amount]) => (storage.contents[id] || 0) >= amount);
}

// Walk to the nearest storage with bait and take one; false if no storage has any
function fetchBait(s, dt) {
  const storage = findStorage(s, st => GAME_CONFIG.fishing.bait.some(b => hasInStorage(st, b)));
  if (!storage) return false;
  if (isAtStorage(s, storage)) takeFishingBait(s, storage);
  else walkToStorage(s, storage, dt);
  return true;
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
  shield: { canWear: canUseShield, first: () => true },
  wateringCan: { canWear: s => hasToolFamily(s.tool, 'hoe'), first: () => true }
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
    showNotification(t('gear.nobody', { name: item.label }), true);
    return;
  }
  if (!canAfford(item.cost)) {
    showCostError(item.cost, t('cost.notEnough'));
    return;
  }
  payCost(item.cost);
  target.targetEquipment = { gear: id };
  showNotification(t('gear.fetching', { icon: item.icon, name: item.label }), false);
}

// Send the selected settler wearing it (or the first one) to the town hall to hand it back
function orderGearOff(id) {
  const item = GAME_CONFIG.gear[id];
  const selected = getSelectedSettler() || getPossessed();
  const target = selected && hasGear(selected, id) && !selected.targetEquipment
    ? selected
    : settlers.find(s => hasGear(s, id) && !s.targetEquipment);
  if (!target) {
    showNotification(t('gear.noneHas', { name: item.label }), true);
    return;
  }
  target.targetEquipment = { gearOff: id };
  showNotification(t('gear.returning', { icon: item.icon, name: item.label }), false);
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

// ---- Animation state (drawn by getHeldItemPose in render.js)

// A strike: the held weapon or tool swings through once over `seconds`
function startSwing(unit, seconds) {
  unit.swingT = seconds;
  unit.swingLen = seconds;
}

function tickAnimation(unit, dt) {
  if (unit.swingT > 0) unit.swingT = Math.max(0, unit.swingT - dt);
  if (unit.working > 0) unit.working = Math.max(0, unit.working - dt);
  if (unit.usingCan > 0) unit.usingCan = Math.max(0, unit.usingCan - dt);
  if (unit.bloodAge !== undefined) unit.bloodAge += dt;
  if (unit.weaponBloodAge !== undefined) unit.weaponBloodAge += dt;
}

// Point the held weapon or tool at (x, y): what the unit strikes or works on (drawn by applyHeldItemPose)
function faceTowards(unit, x, y) {
  if (x !== unit.x || y !== unit.y) unit.facing = Math.atan2(y - unit.y, x - unit.x);
}

// A unit was hurt: blood on it, a splat under it (at most every half second per unit) and on the melee
// weapon that did it (GAME_CONFIG.blood)
function bleed(unit, attacker) {
  unit.bloodAge = 0;
  if (attacker && !isBowWeapon(attacker.weapon) && Math.hypot(attacker.x - unit.x, attacker.y - unit.y) < 80) attacker.weaponBloodAge = 0;
  if (pathTick - (unit.lastBleedTick ?? -Infinity) < 30) return;
  unit.lastBleedTick = pathTick;
  const h = tileVariantHash(pathTick, bloodSplats.length);
  bloodSplats.push({ x: unit.x + (h % 11) - 5, y: unit.y + ((h >>> 8) % 11) - 5, r: 3 + (h >>> 16) % 4, age: 0 });
  if (bloodSplats.length > GAME_CONFIG.blood.maxSplats) bloodSplats.shift();
}

// Stepping in a pool of blood or in dung: the unit then leaves footprints for a few steps. Footprints
// themselves don't smear further. Whoever left the dung can't step in it until it has walked off first.
function trackFootprints(unit) {
  for (const pile of dung) {
    if (pile.by === unit && !pile.byLeft && Math.hypot(unit.x - pile.x, unit.y - pile.y) > 20) pile.byLeft = true;
  }
  if (!unit.smear || unit.smear.steps <= 0) {
    const pool = bloodSplats.find(b => b.kind !== 'trail' && Math.hypot(unit.x - b.x, unit.y - b.y) < b.r + 4);
    const pile = dung.find(p => (p.by !== unit || p.byLeft) && Math.hypot(unit.x - p.x, unit.y - p.y) < 9);
    if (pool || pile) unit.smear = { color: pile ? 'dung' : 'blood', steps: GAME_CONFIG.smears.steps, x: unit.x, y: unit.y };
    return;
  }
  if (Math.hypot(unit.x - unit.smear.x, unit.y - unit.smear.y) < GAME_CONFIG.smears.stepGap) return;
  unit.smear.x = unit.x; unit.smear.y = unit.y;
  unit.smear.steps--;
  bloodSplats.push({ x: unit.x, y: unit.y, r: 2.2, age: 0, kind: 'trail', color: unit.smear.color });
  if (bloodSplats.length > GAME_CONFIG.blood.maxSplats) bloodSplats.shift();
}

// How visible the blood on a unit's body is: it doesn't dry while the unit is badly wounded
function bodyBloodAlpha(unit) {
  if (unit.bloodAge === undefined) return 0;
  return bloodAlpha(unit.bloodAge, unit.hp <= unit.maxHp * GAME_CONFIG.blood.woundedShare);
}

// How visible blood of this age is (1..0); `wounded` blood on a badly hurt unit never fades
function bloodAlpha(age, wounded = false) {
  if (age === undefined) return 0;
  const blood = GAME_CONFIG.blood;
  if (wounded || age <= blood.fadeAfter) return 1;
  return Math.max(0, 1 - (age - blood.fadeAfter) / blood.fadeSeconds);
}

// attacker: the enemy dealing the damage, remembered so the settler can strike back (see update())
function damageSettler(settler, amount, attacker = null) {
  let damage = settler.armor === 'iron' ? amount * (1 - GAME_CONFIG.gear.armor.damageReduction) : amount;
  if (hasWorkingShield(settler)) damage *= 1 - GAME_CONFIG.gear.shield.damageReduction;
  settler.hp -= damage;
  if (damage > 0) bleed(settler, attacker);
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

// A tap while possessing a settler is an order for it (carried out by followOrder() in behaviours.js):
// an enemy or tent — attack it; a boar — hunt it; a resource — gather it, if the settler has the right
// tool; an apple tree with apples — pick them; water — fish (needs a rod); a blueprint — build; a damaged
// building — repair; the town hall — hand in what it carries (or repair the hall). An archer shoots
// wherever else the tap lands. Returns false if the tap wasn't on anything for it.
function orderPossessed(p, x, y) {
  const near = (o, r) => Math.hypot(x - o.x, y - o.y) < r;
  const order = (kind, target) => { p.order = { kind, target }; p.path = null; return true; };
  const refuse = key => { showNotification(t(key), true); return true; };

  const enemy = enemies.find(en => near(en, en.radius + 15)) || enemyTents.find(et => near(et, 25));
  if (enemy) return order('attack', enemy);
  const boar = boars.find(b => near(b, 25) && !b.hidden && !b.hideTarget && !(b.isCarcass && b.collector && b.collector !== p));
  if (boar) return order('hunt', boar);

  // a storage: hand in what it carries (#36)
  const warehouse = buildings.find(b => b.contents && near(b, 18));
  if (warehouse && p.carrying) return order('deliver', warehouse);
  if (near(townHall, townHall.radius + 10)) {
    if (p.carrying) return order('deliver', townHall);
    if (townHall.hp < townHall.maxHp) return order('repairHall', townHall);
  }
  const blueprint = blueprints.find(bp => near(bp, 18));
  if (blueprint) return order('build', blueprint);
  const damaged = buildings.find(b => near(b, 18) && b.hp < b.maxHp);
  if (damaged) return canAfford(getRepairStep(damaged).cost) ? order('repair', damaged) : refuse('possess.noRepairCost');

  const resource = getHarvestableResources().find(r => near(r, 25));
  if (resource) {
    const handsFull = p.carrying && !hasRoomToCarry(p);
    if (resource.apple && resource.applesReady && !hasAxeTool(p.tool)) return handsFull ? refuse('possess.handsFull') : order('apples', resource);
    const kind = getMapResourceKind(resource);
    const def = getMapResourceDef(kind);
    if (def.tool && (!hasToolFamily(p.tool, def.tool) || resource.isGrowing)) return refuse(`possess.needs.${def.tool}`);
    if (kind === 'farm' && !(resource.growth >= 100)) return refuse('possess.notRipe');
    return handsFull ? refuse('possess.handsFull') : order('harvest', resource);
  }

  const water = waterTiles.find(w => near(w, 20));
  if (water) {
    if (p.tool !== 'rod') return refuse('possess.needsRod');
    if (!p.bait && !getFishingBait()) return refuse('possess.noBait');
    return p.carrying && !hasRoomToCarry(p) ? refuse('possess.handsFull') : order('fish', water);
  }

  if (isBowWeapon(p.weapon)) {
    p.order = null;
    performAttack(p, x, y);
    return true;
  }
  return false;
}

function invalidateAllPaths() {
  resetTileIndex();
  settlers.forEach(s => { s.path = null; s.pathTarget = null; });
  enemies.forEach(en => { en.path = null; en.pathTarget = null; });
}

function refundEquipment(settler, includeArmor = false, includeQuiver = false) {
  // a medic's herbs go back with the bag
  if (settler.bagHerbs > 0) { stock.herbs += settler.bagHerbs; settler.bagHerbs = 0; }
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
  if (gameMode === 'battle') { battleTap(mouse.x, mouse.y); return; }
  if (gameMode === 'editor') { editorTap(mouse.x, mouse.y); return; }
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
    if (buildMode === 'interact') { showStoragePopup(townHall); return; }
  }

  if (buildMode === 'interact') {
    const damaged = buildings.find(b => b.x === gx && b.y === gy && b.hp < b.maxHp);
    if (damaged && toggleBuildingRepair(damaged)) return;
    // what a warehouse holds (#36)
    const warehouse = buildings.find(b => b.x === gx && b.y === gy && b.contents);
    if (warehouse) { showStoragePopup(warehouse); return; }
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
    showNotification(t('zone.badTile'), true);
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

function assignTool(toolType) {
  const item = getDefinition('tools', toolType);
  if (!item) {
    showNotification(t('tool.unknown', { id: toolType }), true);
    return;
  }

  const cost = item.cost || {};
  if (!canAfford(cost)) {
    showCostError(cost, t('cost.notEnough'));
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
    showNotification(t('tool.nobody'), true);
    return;
  }

  payCost(cost);
  target.targetEquipment = { weapon: 'fist', tool: toolType, role: 'worker' };
  showNotification(t('tool.given', { name: item.label }), false);
}

function craftWeapon(type) {
  const item = getDefinition('weapons', type);
  if (!item) {
    showNotification(t('weapon.unknown', { id: type }), true);
    return;
  }

  const cost = item.cost || {};
  if (!canAfford(cost)) {
    showCostError(cost, t('cost.notEnough'));
    return;
  }

  let target = getSelectedSettler() || getPossessed();

  if (!target) {
    target = settlers.find(s => s.type === 'big' && s.weapon === 'fist' && !s.targetEquipment) ||
             settlers.find(s => s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.targetEquipment) ||
             settlers.find(s => s.weapon !== type && !s.targetEquipment);
  }

  if (!target) {
    showNotification(t('weapon.nobody'), true);
    return;
  }

  payCost(cost);
  target.targetEquipment = { weapon: type, tool: 'none', role: type === 'bow' ? 'archer' : 'soldier' };
  if (type === 'bow') {
    target.targetEquipment.quiver = true;
    target.targetEquipment.quiverOnly = true;
  }
  showNotification(t('weapon.made', { name: item.label }), false);
}

function craftArrows() {
  let target = getSelectedSettler() || getPossessed();
  if (!target) target = settlers.find(s => s.weapon === 'bow' && s.quiver);
  if (!target || target.weapon !== 'bow' || !target.quiver) {
    showNotification(t('arrows.needArcher'), true);
    return;
  }
  const recipe = GAME_CONFIG.recipes.arrows;
  if (!canAfford(recipe.cost)) {
    showCostError(recipe.cost, t('cost.needs', { name: recipe.label }));
    return;
  }

  payCost(recipe.cost);
  addResources(recipe.produces);
  showNotification(t('arrows.made', { count: recipe.produces.arrows }), false);
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

    const notificationText = t(type === 'tool' ? 'disarm.tool' : type === 'weapon' ? 'disarm.weapon' : 'disarm.item');
    showNotification(notificationText, false);
  } else {
    const errorText = t(type === 'tool' ? 'disarm.noTool' : type === 'weapon' ? 'disarm.noWeapon' : 'disarm.noItem');
    showNotification(errorText, true);
  }
}

function spawnSettler(type = 'normal') {
  const settlerType = GAME_CONFIG.settlerTypes[type];
  if (!settlerType) return;

  if (getCurrentPop() + settlerType.population > getMaxPop()) {
    showNotification(t('pop.limit'), true);
    return;
  }
  if (!canAfford(settlerType.hireCost)) {
    showCostError(settlerType.hireCost, t('cost.needs', { name: settlerType.label }));
    return;
  }
  payCost(settlerType.hireCost);
  settlers.push(createSettler(type, Date.now() + rand(), townHall.x + (rand() - 0.5) * 30, townHall.y + (rand() - 0.5) * 30, { armor: 'none', hasArmor: false }));
  showNotification(t('hire.done', { name: settlerType.label }), false);
}

function upgradeToBig(target) {
  const normal = GAME_CONFIG.settlerTypes.normal, big = GAME_CONFIG.settlerTypes.big;
  if (!target) target = getSelectedSettler() || getPossessed();
  if (!target || target.type !== 'normal') target = settlers.find(s => s.type === 'normal');

  if (!target || target.type !== 'normal') {
    showNotification(t('upgrade.noone'), true);
    return;
  }
  if (getCurrentPop() + big.population - normal.population > getMaxPop()) {
    showNotification(t('pop.limit'), true);
    return;
  }
  if (!canAfford(big.upgradeCost)) {
    showCostError(big.upgradeCost, t('upgrade.needs', { name: big.label }));
    return;
  }

  payCost(big.upgradeCost);

  target.type = 'big';
  target.maxHp = big.hp;
  target.hp = Math.min(target.hp + (big.hp - normal.hp), big.hp);
  target.speed = big.speed;
  target.radius = big.radius;
  target.visualRadius = big.visualRadius;
  showNotification(t('upgrade.done', { name: big.label }), false);
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
