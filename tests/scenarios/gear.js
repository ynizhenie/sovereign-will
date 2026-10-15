// Gear picked up at and handed back to the town hall (#94)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

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
    stock.iron = 20; stock.leather = 20; stock.wood = 20;
    const before = { iron: stock.iron, leather: stock.leather };
    document.getElementById(`btn-${id}`).click();
    const who = Object.keys(all).find(k => all[k].targetEquipment && all[k].targetEquipment.gear === id) || null;
    const wornAtOnce = who ? hasGear(all[who], id) : false;
    run(10);
    return { who, wornAtOnce, worn: who ? hasGear(all[who], id) : false, maxHp: who ? all[who].maxHp : null,
      paid: { iron: before.iron - stock.iron, leather: before.leather - stock.leather } };
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
    run(15, { each: () => { settlers[0].hunger = 999; } });
    const stored = window.game.armory['weapons:sword'] || 0;
    const wood = stock.wood = 0, stone = stock.stone = 0;
    craftWeapon('sword');
    return { dropped, picked: window.game.loot.length === 0, stored, usedArmory: (window.game.armory['weapons:sword'] || 0) === stored - 1 && stock.wood === wood && stock.stone === stone,
      going: settlers[0].targetEquipment && settlers[0].targetEquipment.weapon };
  }

  // Quotas: two axes wanted, three free workers: two get one by themselves, the third doesn't (#210)
  function quotaAxes({ seed = 'quota-axes' } = {}) {
    start(seed);
    clearResources();
    settlers = [0, 1, 2].map(i => makeSettler(i + 1, townHall.x - 40 + i * 30, townHall.y + 50));
    Object.assign(stock, { wood: 100, stone: 100 });
    window.game.quotas = { 'tools:axe': 2 };
    run(8, { each: () => settlers.forEach(s => { s.hunger = 999; }) });
    const withAxe = settlers.filter(s => s.tool === 'axe' || (s.targetEquipment && s.targetEquipment.tool === 'axe')).length;
    window.game.quotas = {};
    return { withAxe };
  }

  return { lootToArmory, quotaAxes, orderGearFor, armorOff };
})());
