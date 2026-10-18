// #232, the friend's third round: waves, who makes a thing, the wounded in a panic, marks, archers, repairs,
// demons and corpses, a soldier cooking, loot
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boarRespawnTimer = 999; pendingRespawns = []; };
  const asFaction = (player, seed) => { sides.player.faction = player; start(seed); clearResources(); invalidateAllPaths(); };
  const back = () => { sides.player.faction = 'humans'; };

  // The average wave size, waves 1-12, over a few seeds
  function waveSizes() {
    const sizes = [];
    for (let w = 1; w <= 12; w++) {
      let sum = 0;
      for (let k = 0; k < 12; k++) { start('r3-wave-' + k); waveNum = w; enemies = []; startNextWave(); sum += enemies.filter(e => e.fromWave).length; }
      sizes.push(sum / 12);
    }
    return sizes;
  }

  // An axe ordered with nobody picked: the one it goes to is the one who makes it
  function makerIsTaker({ seed = 'r3-maker' } = {}) {
    start(seed); clearResources();
    const near = makeSettler(1, townHall.x + 40, townHall.y + 40, { tool: 'pickaxe' });
    const taker = makeSettler(2, townHall.x - 60, townHall.y + 40);
    settlers = [near, taker];
    Object.assign(stock, { wood: 50, stone: 50 });
    armory = {};
    selectedSettler = null;
    assignTool('axe');
    const makers = new Set();
    run(15, { each: () => { quiet(); settlers.forEach(s => { if (s.activity === 'craftItem') makers.add(s.id); }); } });
    return { makers: [...makers], gotIt: taker.tool };
  }

  // A wounded settler in a panic, a tent: it runs to the tent and heals there, not to the town hall
  function panicToTent({ seed = 'r3-panic' } = {}) {
    start(seed); clearResources();
    const tent = placeBuilding('tent', nearHall(-5, 3).x, nearHall(-5, 3).y);
    invalidateAllPaths();
    const s = makeSettler(1, townHall.x + 120, townHall.y + 20, { hp: 30 });
    settlers = [s];
    let atTent = false;
    run(10, { each: () => { quiet(); s.panic = true; s.morale = 5; if (Math.hypot(s.x - tent.x, s.y - tent.y) < 40) atTent = true; } });
    return { atTent, healed: s.hp > 30 };
  }

  // Marked apples and only one with an axe: it picks them. Marked pebbles while the only free-handed worker
  // is busy making a thing: the one with a pickaxe takes them
  function marksToTools({ seed = 'r3-marks' } = {}) {
    start(seed); clearResources();
    const t = nearHall(4, 2);
    const tree = { x: t.x, y: t.y, hp: 3, maxHp: 3, apple: true, applesReady: true, priority: 1, markIntent: 'apples' };
    trees.push(tree);
    invalidateAllPaths();
    const axe = makeSettler(1, townHall.x + 40, townHall.y + 40, { tool: 'axe' });
    settlers = [axe];
    let picked = false;
    run(12, { each: () => { quiet(); if (axe.activity === 'pickApples') picked = true; } });
    // pebbles: the worker with free hands is on a building
    start(seed + '-b'); clearResources();
    const p = nearHall(-3, 3);
    pebbles.push({ x: p.x, y: p.y, hp: 1, maxHp: 1, priority: 1 });
    invalidateAllPaths();
    const builder = makeSettler(2, townHall.x + 40, townHall.y - 40), miner = makeSettler(3, townHall.x - 40, townHall.y + 40, { tool: 'pickaxe' });
    settlers = [builder, miner];
    // the free-handed one busy making a thing for itself (a long one)
    Object.assign(stock, { wood: 50, stone: 50 }); armory = {}; selectedSettler = null;
    GAME_CONFIG.crafting.seconds.weapons = 60;
    craftWeapon('club', false, builder);
    let minerOnIt = false;
    run(12, { each: () => { quiet(); if (miner.markTarget && pebbles.includes(miner.markTarget)) minerOnIt = true; } });
    GAME_CONFIG.crafting.seconds.weapons = 6;
    return { picked, minerOnIt };
  }

  // An archer with no arrows guards nobody
  function archerNoGuard({ seed = 'r3-guard' } = {}) {
    start(seed); clearResources();
    const far = nearHall(12, 0);
    trees.push({ x: far.x, y: far.y, hp: 1e6, maxHp: 1e6 });
    invalidateAllPaths();
    const w = makeSettler(1, far.x - 25, far.y, { tool: 'axe' });
    const a = makeSettler(2, townHall.x - 30, townHall.y + 40, { weapon: 'bow', role: 'archer', quiver: true, arrows: 0 });
    settlers = [w, a];
    stock.arrows = 0;
    let guarded = false;
    run(12, { each: () => { quiet(); stock.arrows = 0; if (a.activity === 'escortGatherers') guarded = true; } });
    return { guarded };
  }

  // A damaged wall walled in all round: nobody tries to repair it; a demon leaves a corpse it can't reach
  function unreachable({ seed = 'r3-reach' } = {}) {
    start(seed); clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const c = { gx: g.gx + 6, gy: g.gy };
    const inner = placeBuilding('wall_wood', c.gx * TILE_SIZE + 15, c.gy * TILE_SIZE + 15);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) placeBuilding('wall_wood', (c.gx + dx) * TILE_SIZE + 15, (c.gy + dy) * TILE_SIZE + 15);
    inner.hp = inner.maxHp / 2; inner.repairRequested = true;
    invalidateAllPaths();
    stock.wood = 100;
    const w = makeSettler(1, townHall.x - 40, townHall.y + 40);
    settlers = [w];
    let triedRepair = false;
    run(6, { each: () => { quiet(); if (w.activity === 'repairBuilding') triedRepair = true; } });
    back();
    asFaction('demons', seed + '-d');
    const d = Object.assign(createSettler('demon', 1, townHall.x - 40, townHall.y + 40), { hunger: 999 });
    d.hp = d.maxHp / 2;
    settlers = [d];
    const g2 = getGridPos(townHall.x, townHall.y);
    const wallAt = { x: (g2.gx + 6) * TILE_SIZE + 15, y: g2.gy * TILE_SIZE + 15 };
    placeBuilding('wall_wood', wallAt.x, wallAt.y);
    invalidateAllPaths();
    corpses = [{ ...wallAt, radius: 10, side: 'enemy', kind: 'raider', age: 0 }];
    let triedEat = false;
    run(4, { each: () => { d.hunger = 999; if (d.activity === 'eatCorpse') triedEat = true; } });
    back();
    return { triedRepair, triedEat };
  }

  // The only soldier, cooking: a boar the player marks, it goes to hunt it
  function soldierLeavesFire({ seed = 'r3-cook' } = {}) {
    start(seed); clearResources();
    placeBuilding('campfire', nearHall(3, 0).x, nearHall(3, 0).y);
    invalidateAllPaths();
    const sol = makeSettler(1, townHall.x + 50, townHall.y + 40, { weapon: 'spear', role: 'soldier' });
    settlers = [sol];
    Object.assign(stock, { rawMeat: 20, firewood: 10 });
    run(5, { each: quiet });
    const cookingBefore = sol.activity === 'cook';
    const at = nearHall(-8, 4);
    boars = [{ ...at, hp: 30, maxHp: 30, priority: 1, wanderTimer: 0, wanderInterval: 999, targetX: at.x, targetY: at.y }];
    let hunted = false;
    run(10, { each: () => { quiet(); if (sol.activity === 'harvest') hunted = true; } });
    return { cookingBefore, hunted };
  }

  // A fallen enemy with a sword drops the sword itself, never a bundle of its cost
  function lootItself({ seed = 'r3-loot' } = {}) {
    start(seed); clearResources();
    settlers = [];
    let swords = 0, bundles = 0;
    for (let i = 0; i < 40; i++) {
      const en = createConfiguredEnemy(nearHall(-6, i % 5), 'raider');
      loot = [];
      dropLoot(en);
      for (const pile of loot) { if ((pile.items || []).includes('weapons:sword')) swords++; if (Object.keys(pile.yield || {}).length) bundles++; }
    }
    return { swords: swords > 5, bundles };
  }

  return { r3WaveSizes: waveSizes, r3MakerIsTaker: makerIsTaker, r3PanicToTent: panicToTent, r3MarksToTools: marksToTools, r3ArcherNoGuard: archerNoGuard, r3Unreachable: unreachable, r3SoldierLeavesFire: soldierLeavesFire, r3LootItself: lootItself };
})());
