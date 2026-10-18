// #261, the friend's fixes to the fixes: a woodcutter flickering, what comes off a settler, things made by
// hand, soldiers and the enemy tents
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boarRespawnTimer = 999; pendingRespawns = []; };

  // A woodcutter with nothing else to do, a campfire, firewood under what's kept: it goes and chops, and its
  // activity doesn't flicker between that and idle on the way (it did each tick)
  function firewoodSteady({ seed = 'r4-firewood' } = {}) {
    start(seed); clearResources();
    placeBuilding('campfire', nearHall(4, 0).x, nearHall(4, 0).y);
    const w = makeSettler(1, townHall.x - 120, townHall.y + 90, { tool: 'axe' });
    settlers = [w];
    Object.assign(stock, { wood: 20, firewood: GAME_CONFIG.firewood.low + 1 });
    const before = stock.firewood;
    let flips = 0;
    const seen = [];
    run(20, { each: () => {
      quiet();
      seen.push(w.activity);
      const n = seen.length;
      if (n >= 3 && seen[n - 1] === seen[n - 3] && seen[n - 1] !== seen[n - 2]) flips++;
    } });
    return { flips, chopped: stock.firewood > before };
  }

  // A swordsman with an axe: taking the axe off gives back the axe's cost only (it gave the sword's too);
  // into the store, it's whole in the armory and nothing comes back to the stock (#248)
  function takeOff({ seed = 'r4-take-off', keep = false } = {}) {
    start(seed); clearResources();
    const s = makeSettler(1, townHall.x + 30, townHall.y, { weapon: 'sword', tool: 'axe', role: 'soldier' });
    settlers = [s];
    selectedSettler = s;
    armory = {};
    Object.assign(stock, { wood: 0, stone: 0 });
    disarmSettler('tool', keep);
    run(5, { each: quiet });
    return { weapon: s.weapon, tool: s.tool, back: { wood: stock.wood, stone: stock.stone }, stored: armory['tools:axe'] || 0 };
  }

  // Armour taken off into the store: whole in the armory, no iron back
  function armorToStore({ seed = 'r4-armor' } = {}) {
    start(seed); clearResources();
    const s = makeSettler(1, townHall.x + 30, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    putOnGear(s, 'armor');
    selectedSettler = s;
    armory = {};
    stock.iron = 0;
    orderGearOff('armor', true);
    run(5, { each: quiet });
    return { armor: s.armor || null, iron: stock.iron, stored: armory['gear:armor'] || 0 };
  }

  // A club is made by hand: no workshop, it's made at the town hall and into the store
  function byHand({ seed = 'r4-hand' } = {}) {
    start(seed); clearResources();
    const w = makeSettler(1, townHall.x + 60, townHall.y + 60);
    settlers = [w];
    Object.assign(stock, { wood: 20 });
    armory = {};
    const place = craftPlace('weapons', 'club');
    const ordered = makeToStore('weapons', 'club');
    let atHall = false;
    run(15, { each: () => { quiet(); if (w.activity === 'craftItem' && Math.hypot(w.x - townHall.x, w.y - townHall.y) < townHall.radius + 30) atHall = true; } });
    return { place, ordered, atHall, stored: armory['weapons:club'] || 0, axeNeedsWorkshop: makeToStore('tools', 'axe') };
  }

  // The last few enemies of a wave and an enemy tent: one of the enemies is at the base, or the player marked
  // one far off; a soldier fights that one, not off to the tent past it (#261)
  function tentsWait({ seed = 'r4-tents', marked = false } = {}) {
    start(seed); clearResources();
    const s = makeSettler(1, townHall.x + 40, townHall.y, { weapon: 'sword', role: 'soldier', hp: 1e4, maxHp: 1e4 });
    settlers = [s];
    const tentAt = nearHall(-14, 0);
    const tent = { x: tentAt.x, y: tentAt.y, hp: 80, maxHp: 80, summonTimer: 999, summonsLeft: 0 };
    enemyTents = [tent];
    const foe = createConfiguredEnemy(marked ? nearHall(12, 9) : nearHall(4, 3), 'raider');
    Object.assign(foe, { speed: 0, damage: 0, hp: 1e4, maxHp: 1e4, markedTarget: marked });
    enemies = [foe];
    run(8, { each: () => { quiet(); waveTimer = 50; } });
    return { atFoe: Math.hypot(s.x - foe.x, s.y - foe.y) < 50, tentWhole: tent.hp === tent.maxHp };
  }

  return { r4FirewoodSteady: firewoodSteady, r4TakeOff: takeOff, r4ArmorToStore: armorToStore, r4ByHand: byHand, r4TentsWait: tentsWait };
})());
