// Gear picked up at and handed back to the town hall (#94)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources, placeBuilding } } = window.sim;

  // An archer, a swordsman and a worker, all a way off the town hall. Orders one piece of gear with its
  // button and follows who gets it: not worn at once, worn once they've been to the town hall.
  function orderGearFor({ seed = 'gear-test', id, only }) {
    start(seed);
    boars.length = 0; // a hunt would bring leather in and blur what was paid
    const hx = townHall.x, hy = townHall.y;
    const all = {
      archer: makeSettler(1, hx - 150, hy, { weapon: 'bow', role: 'archer', quiver: true, isPossessed: false }),
      soldier: makeSettler(2, hx + 150, hy, { weapon: 'sword', role: 'soldier' }),
      worker: makeSettler(3, hx, hy + 150)
    };
    settlers = only ? only.map(k => all[k]) : Object.values(all);
    selectedSettler = null;
    stock.iron = 20; stock.leather = 20; stock.wood = 20; stock.rope = 5;
    const before = { iron: stock.iron, leather: stock.leather };
    if (GAME_CONFIG.gear[id].cost.iron) placeBuilding('smithy', hx + 15 - (hx % 30) + 90, hy + 15 - (hy % 30) + 90); // (#211)
    else window.sim.helpers.placeWorkshop(); // (#248)
    document.getElementById(`btn-${id}`).click();
    const wornAtOnce = Object.values(all).some(s => hasGear(s, id));
    const noBoars = { each: () => { boars.length = 0; } }; // (they come back over a minute)
    run(30, noBoars); // made (#211), into the store
    document.querySelector(`[data-item="gear:${id}"] .row-give`).click(); // handed out (#248)
    run(30, noBoars); // then put on at the town hall
    const who = Object.keys(all).find(k => settlers.includes(all[k]) && hasGear(all[k], id)) || null;
    return { who, wornAtOnce, worn: !!who, maxHp: who ? all[who].maxHp : null,
      paid: { iron: before.iron - stock.iron, leather: before.leather - stock.leather }, stored: window.game.armory[`gear:${id}`] || 0 };
  }

  // A swordsman in armour: disarming the weapon keeps the armour; Take off armour hands it back
  function armorOff({ seed = 'armor-off-test' }) {
    start(seed);
    const s = makeSettler(1, townHall.x + 120, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    putOnGear(s, 'armor');
    stock.iron = 0;
    selectedSettler = s;
    disarmSettler('weapon');
    run(10);
    const afterDisarm = { armor: s.armor, maxHp: s.maxHp };
    orderGearOff('armor');
    run(10);
    return { afterDisarm, armor: s.armor, maxHp: s.maxHp, ironBack: stock.iron };
  }

  // A raider with a sword falls (its sword dropping whole): a worker picks the pile up, the sword goes into
  // the armory, and making a sword then takes it from there instead of the stock (#210)
  function lootToArmory({ seed = 'loot-armory' } = {}) {
    start(seed);
    clearResources();
    const loot = GAME_CONFIG.loot, chance = loot.itemChance;
    loot.itemChance = 1;
    const en = createConfiguredEnemy({ x: townHall.x + 120, y: townHall.y + 40 }, 'raider');
    enemies = [en];
    en.hp = 0;
    removeDeadEnemies();
    loot.itemChance = chance;
    const dropped = window.game.loot.length === 1 && window.game.loot[0].items.includes('weapons:sword');
    settlers = [makeSettler(1, townHall.x + 60, townHall.y + 40)];
    // picked up, it's carried to the storage first, not in the armory at once (#261)
    let carried = null;
    run(15, { each: () => {
      settlers[0].hunger = 999;
      const c = settlers[0].carrying;
      if (carried === null && window.game.loot.length === 0) carried = !!c && (c.items || [c]).some(i => i.type === 'armory:weapons:sword') && !window.game.armory['weapons:sword'];
    } });
    const stored = window.game.armory['weapons:sword'] || 0;
    const wood = stock.wood = 0, stone = stock.stone = 0;
    craftWeapon('sword');
    return { dropped, picked: window.game.loot.length === 0, carried, stored, usedArmory: (window.game.armory['weapons:sword'] || 0) === stored - 1 && stock.wood === wood && stock.stone === stone,
      going: settlers[0].targetEquipment && settlers[0].targetEquipment.weapon };
  }

  // Making things (#211, #248): no workshop, no axe; with one, an axe ordered is paid for, made there by a
  // worker (it fetches the materials, works a few seconds) and goes into the store, handed out from there;
  // an iron sword can't be ordered without a smithy, and with one it's made there
  function crafting({ seed = 'crafting' } = {}) {
    start(seed);
    clearResources();
    const w = makeSettler(1, townHall.x + 60, townHall.y + 60);
    settlers = [w];
    Object.assign(stock, { wood: 50, stone: 50, iron: 20 });
    window.game.armory = {};
    const noWorkshop = makeToStore('tools', 'axe') === false && window.game.craftOrders.length === 0 && stock.wood === 50;
    window.sim.helpers.placeWorkshop();
    makeToStore('tools', 'axe');
    const ordered = window.game.craftOrders.length === 1 && stock.wood === 45 && stock.stone === 45;
    let crafting = false;
    run(15, { each: () => { w.hunger = 999; if (w.activity === 'craftItem') crafting = true; } });
    const stored = window.game.armory['tools:axe'] === 1 && w.tool === 'none';
    giveStored('tools', 'axe');
    run(8, { each: () => { w.hunger = 999; } });
    const axe = w.tool === 'axe' && stored && noWorkshop;
    const noSmithy = craftWeapon('iron_sword') === false && window.game.craftOrders.length === 0 && stock.iron === 20;
    const g = getGridPos(townHall.x, townHall.y);
    const smithy = placeBuilding('smithy', (g.gx + 6) * TILE_SIZE + 15, g.gy * TILE_SIZE + 15);
    invalidateAllPaths();
    const w2 = makeSettler(2, townHall.x - 60, townHall.y + 60);
    settlers.push(w2);
    craftWeapon('iron_sword');
    let atSmithy = false;
    run(25, { each: () => { settlers.forEach(s => { s.hunger = 999; }); const o = window.game.craftOrders[0]; if (o && o.stage === 'work' && o.crafter && Math.hypot(o.crafter.x - smithy.x, o.crafter.y - smithy.y) < 50) atSmithy = true; } });
    giveStored('weapons', 'iron_sword');
    run(10, { each: () => { settlers.forEach(s => { s.hunger = 999; }); } });
    const sword = settlers.some(s => s.weapon === 'iron_sword');
    return { ordered, crafting, axe, noSmithy, atSmithy, sword };
  }

  // How long the making takes (#232, #248): an axe at a workshop half its time (2 s), an iron sword at the
  // smithy all of it (6 s); while working it's drawn making it, with the materials in its hands before
  function craftTimes({ seed = 'craft-times' } = {}) {
    start(seed);
    clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    placeBuilding('smithy', (g.gx + 6) * TILE_SIZE + 15, g.gy * TILE_SIZE + 15);
    window.sim.helpers.placeWorkshop();
    invalidateAllPaths();
    const w = makeSettler(1, townHall.x + 60, townHall.y + 60);
    settlers = [w];
    Object.assign(stock, { wood: 50, stone: 50, iron: 20 });
    window.game.armory = {};
    const timeIt = order => {
      order();
      let work = 0, inHands = false, drawnMaking = false;
      run(20, { each: () => { w.hunger = 999; const o = window.game.craftOrders[0];
        if (o && o.stage === 'work') { work += 1 / 60; if (isCrafting(w)) drawnMaking = true; }
        if (o && o.stage === 'carry' && isCarryingInHands(w)) inHands = true; } });
      return { seconds: Math.round(work * 2) / 2, inHands, drawnMaking };
    };
    const axe = timeIt(() => assignTool('axe'));
    w.tool = 'none'; w.targetEquipment = null;
    const sword = timeIt(() => craftWeapon('iron_sword'));
    return { axe, sword };
  }

  return { craftTimes, crafting, lootToArmory, orderGearFor, armorOff };
})());
