// Gathering for every faction (#163)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // A worker of each of the faction's kinds that can work (its start unit and its big one), with an axe
  // for a tree and a pickaxe for a boulder. Returns which got felled / broken.
  function factionGathers({ faction = 'humans', seed = 'gather-test' } = {}) {
    sides.player.faction = faction;
    sides.player.color = GAME_CONFIG.factions[faction].color;
    sides.enemy.color = GAME_CONFIG.factionColors.find(c => c !== sides.player.color);
    start(seed);
    window.showNotification = () => {};
    const out = {};
    const def = GAME_CONFIG.factions[faction];
    for (const type of [def.startUnits, ...Object.values(def.upgrades || {})]) {
      clearResources();
      const tree = { ...nearHall(4, 0), hp: 3, maxHp: 3, isGrowing: false, growProgress: 0, priority: 0 };
      const boulder = { ...nearHall(-4, 0), hp: 4, maxHp: 4, priority: 0 };
      trees.push(tree); boulders.push(boulder);
      invalidateAllPaths();
      settlers = [
        createSettler(type, 1, nearHall(2, 1).x, nearHall(2, 1).y, { tool: 'axe' }),
        createSettler(type, 2, nearHall(-2, 1).x, nearHall(-2, 1).y, { tool: 'pickaxe' })
      ];
      settlers.forEach(s => { s.tool = s.id === 1 ? 'axe' : 'pickaxe'; });
      run(15, { each: () => { pendingRespawns.length = 0; } });
      out[type] = { tree: !trees.includes(tree), boulder: !boulders.includes(boulder) };
    }
    return out;
  }

  // One of every gatherable thing, each with a worker of the faction's start kind holding what it needs
  function factionGathersAll({ faction = 'humans', seed = 'gather-all' } = {}) {
    sides.player.faction = faction;
    sides.player.color = GAME_CONFIG.factions[faction].color;
    sides.enemy.color = GAME_CONFIG.factionColors.find(c => c !== sides.player.color);
    const unit = GAME_CONFIG.factions[faction].startUnits;
    const cases = [
      ['iron_ore', 'pickaxe'], ['coal_ore', 'pickaxe'], ['cactus', 'axe'], ['grass', 'none'], ['berry_bush', 'none'],
      ['stick', 'none'], ['pebble', 'none'], ['farm', 'hoe'], ['boar', 'none', 'spear'], ['fish', 'rod']
    ];
    const out = {};
    for (const [kind, tool, weapon] of cases) {
      start(seed);
      window.showNotification = () => {};
      clearResources();
      const p = nearHall(4, 0);
      let thing = null;
      if (kind === 'farm') { thing = { ...p, growth: 100, priority: 0, harvestProgress: 0 }; farmPlots.push(thing); }
      else if (kind === 'boar') { thing = { ...p, hp: 40, maxHp: 40, priority: 0, wanderTimer: 99, wanderInterval: 99, targetX: p.x, targetY: p.y }; boars.push(thing); }
      else if (kind === 'fish') { thing = { ...p, isFishing: true, fishTimer: 0 }; waterTiles.push(thing); stock.worms = 3; }
      else thing = addMapResource(kind, p.x, p.y);
      invalidateAllPaths();
      const s = createSettler(unit, 1, nearHall(1, 1).x, nearHall(1, 1).y);
      s.tool = tool;
      if (weapon) s.weapon = weapon;
      settlers = [s];
      const before = { ...stock };
      let carried = false;
      run(25, { each: () => { pendingRespawns.length = 0; if (s.carrying) carried = true; } });
      const gotStock = Object.keys(stock).some(id => stock[id] > before[id]);
      out[kind] = carried || gotStock;
    }
    return out;
  }

  return { factionGathers, factionGathersAll };
})());
