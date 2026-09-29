// Browser-side helpers for the regression tests. Injected into the game page by tests/game.spec.mjs;
// they drive the real game code (update(), resetGame(), ...) tick by tick without rendering.
// Every scenario uses a fixed seed, so results are repeatable.
window.sim = (() => {
  const TICK = 1 / 60;
  const NEIGHBOURS_8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  function start(seed) {
    document.getElementById('seed-input').value = seed;
    applySeedFromUI();
    resetGame();
    gameStarted = true;
    isPaused = false;
    document.getElementById('main-menu').style.display = 'none';
  }

  // Advance the game; the wave timer is held so no wave starts unless a scenario starts one itself.
  function run(seconds, { holdWaves = true, each } = {}) {
    for (let f = 0; f < seconds * 60; f++) {
      if (holdWaves) waveTimer = 999;
      update(TICK);
      if (each) each(f);
    }
  }

  function tileCenter(gx, gy) {
    return { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 };
  }

  function makeSettler(id, x, y, extra = {}) {
    return {
      id, x, y, hp: 100, maxHp: 100, isPossessed: false, speed: 1.0, radius: 11, visualRadius: 11,
      weapon: 'fist', tool: 'none', role: 'worker', type: 'normal', carrying: null, targetEquipment: null,
      attackCooldown: 0, path: [], pathTarget: null, patrolTemplate: null, deadProcessed: false, ...extra
    };
  }

  function placeBuilding(type, x, y) {
    const b = createBuildingBlueprint(type, x, y);
    delete b.progress;
    delete b.maxProgress;
    buildings.push(b);
    return b;
  }

  // Tiles reachable from the town hall (4-way) for a blocking predicate, with BFS distance
  function reachableFromHall(isBlocked) {
    const s = getGridPos(townHall.x, townHall.y);
    const seen = new Map([[`${s.gx},${s.gy}`, 0]]);
    const queue = [s];
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      const d = seen.get(`${c.gx},${c.gy}`);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const gx = c.gx + dx, gy = c.gy + dy, k = `${gx},${gy}`;
        if (seen.has(k) || gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) continue;
        const p = tileCenter(gx, gy);
        const inHall = Math.hypot(p.x - townHall.x, p.y - townHall.y) < townHall.radius + 15;
        if (!inHall && isBlocked(gx, gy)) continue;
        seen.set(k, d + 1);
        queue.push({ gx, gy });
      }
    }
    return [...seen].map(([k, d]) => { const [gx, gy] = k.split(',').map(Number); return { gx, gy, d }; });
  }

  // Everything that describes the generated map, for determinism checks
  function mapSignature() {
    const pick = list => list.map(o => `${o.x},${o.y}`).join(';');
    return [naturalRocks, waterTiles, trees, cacti, boulders, ironOres, coalOres, berryBushes, grassList, sticks, pebbles]
      .map(pick).join('|');
  }

  function resourceCounts() {
    return {
      trees: trees.length, boulders: boulders.length, ironOres: ironOres.length, coalOres: coalOres.length,
      naturalRocks: naturalRocks.length, water: waterTiles.length
    };
  }

  // How many reachable tiles A* finds a path to the town hall from
  function pathCoverage(seed, isEnemy) {
    start(seed);
    const tiles = reachableFromHall(isEnemy ? isTileBlockedForEnemyPermissive : isTileBlockedForSettler);
    let found = 0;
    for (const t of tiles) {
      const p = tileCenter(t.gx, t.gy);
      if (findPathAStar(p.x, p.y, townHall.x, townHall.y, isEnemy).path.length > 0) found++;
    }
    return { tiles: tiles.length, found };
  }

  // Ring of wooden walls around the town hall (ring 3 = 7x7 square), skipping occupied tiles
  function wallRing(ring) {
    const cx = Math.floor(townHall.x / TILE_SIZE), cy = Math.floor(townHall.y / TILE_SIZE);
    for (let gx = cx - ring; gx <= cx + ring; gx++) {
      for (let gy = cy - ring; gy <= cy + ring; gy++) {
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== ring) continue;
        const p = tileCenter(gx, gy);
        if (isTileOccupied(p.x, p.y) && !grassList.concat(sticks, pebbles).some(o => o.x === p.x && o.y === p.y)) continue;
        placeBuilding('wall_wood', p.x, p.y);
      }
    }
  }

  // Mixed raiders/brutes from the map border against the town hall
  function assault({ seed, seconds = 60, count = 12, ring = 0 }) {
    start(seed);
    settlers = [];
    if (ring) wallRing(ring);
    enemies = [];
    for (let i = 0; i < count; i++) {
      const pos = getRandomBorderPos();
      enemies.push(i % 3 === 0 ? createConfiguredEnemy(pos, 'brute', 'big', 18) : createNormalEnemy(pos, 'raider'));
    }
    const history = new Map(enemies.map(e => [e, []]));
    run(seconds, { each: f => { if (f % 60 === 0) for (const e of enemies) history.get(e)?.push([e.x, e.y]); } });
    const out = { reached: 0, atWall: 0, stuck: 0, total: enemies.length };
    for (const e of enemies) {
      const near = Math.hypot(e.x - townHall.x, e.y - townHall.y) < townHall.radius + e.radius + 40;
      const attacking = buildings.some(b => collidesWithBoxList(e.x, e.y, Math.min(e.radius, 13) + 3, [b], 15));
      const last = history.get(e).slice(-15);
      const moved = last.length > 1 ? Math.hypot(last[0][0] - last.at(-1)[0], last[0][1] - last.at(-1)[1]) : 0;
      if (near) out.reached++;
      else if (attacking) out.atWall++;
      else if (moved < 30) out.stuck++;
    }
    return out;
  }

  // Town hall ringed by trees instead of walls; enemies must chop through
  function treeSiege({ seed = 'siege-test', seconds = 30, count = 4 } = {}) {
    start(seed);
    settlers = [];
    wallRing(3);
    const ringTiles = buildings.map(b => ({ x: b.x, y: b.y }));
    buildings = [];
    for (const t of ringTiles) trees.push({ x: t.x, y: t.y, hp: 3, priority: 0, isGrowing: false, growProgress: 0 });
    invalidateAllPaths();
    enemies = [];
    for (let i = 0; i < count; i++) enemies.push(createNormalEnemy(getRandomBorderPos(), 'raider'));
    const hall0 = townHall.hp;
    run(seconds);
    const left = trees.filter(t => ringTiles.some(r => r.x === t.x && r.y === t.y)).length;
    return { ringTrees: ringTiles.length, left, hallDamage: hall0 - townHall.hp };
  }

  // Time enemies spend pressed against a wall that isn't losing hp
  function wallContact({ seed = 'siege-test', seconds = 40, count = 16 } = {}) {
    start(seed);
    settlers = [];
    wallRing(3);
    enemies = [];
    for (let i = 0; i < count; i++) enemies.push(createNormalEnemy(getRandomBorderPos(), 'raider'));
    let stuckFrames = 0;
    const walls0 = buildings.length;
    for (let f = 0; f < seconds * 60; f++) {
      waveTimer = 999;
      const before = new Map(buildings.map(b => [b, b.hp]));
      update(TICK);
      for (const e of enemies) {
        const pressed = buildings.filter(b => b.type !== 'door' && collidesWithBoxList(e.x, e.y, e.radius + 1, [b], 14));
        if (pressed.length && !isBuildingSingle(pressed[0]) && pressed.every(b => b.hp === before.get(b))) stuckFrames++;
      }
    }
    return { wallsBroken: walls0 - buildings.length, secondsStuckAtWall: stuckFrames / 60 };
  }

  // Settlers carrying wood, placed at the farthest reachable tiles, must bring it home unaided
  function homecoming({ seed, seconds = 60, count = 4 }) {
    start(seed);
    const tiles = reachableFromHall(isTileBlockedForSettler).sort((a, b) => b.d - a.d);
    const picks = [];
    for (const t of tiles) {
      if (picks.every(p => Math.abs(p.gx - t.gx) + Math.abs(p.gy - t.gy) > 8)) picks.push(t);
      if (picks.length === count) break;
    }
    settlers = picks.map((t, i) => {
      const p = tileCenter(t.gx, t.gy);
      return makeSettler(900 + i, p.x, p.y, { carrying: { type: 'wood', amount: 5 } });
    });
    // record the first delivery: afterwards a settler may well pick up new work and carry again
    const deliveredAt = new Map();
    run(seconds, { each: f => { for (const s of settlers) if (!s.carrying && !deliveredAt.has(s)) deliveredAt.set(s, f / 60); } });
    return { placed: picks.length, delivered: deliveredAt.size, slowestSeconds: Math.max(...deliveredAt.values()), farthestSteps: picks[0].d };
  }

  // Working settlers; a settler is stuck if it wants to move, gets no closer to its target for 3s,
  // and then also doesn't move over the next 5s (so detours along rock walls don't count)
  function crowd({ seed, seconds = 30, count = 12, spread = false }) {
    start(seed);
    wood = stone = food = 500; iron = 100;
    const tools = ['axe', 'pickaxe', 'none', 'axe', 'pickaxe'];
    const spots = reachableFromHall(isTileBlockedForSettler).filter(t => t.d >= 3 && t.d <= (spread ? 40 : 6));
    settlers = [];
    for (let i = 0; i < count; i++) {
      const t = spots[(i * 7) % spots.length], p = tileCenter(t.gx, t.gy);
      settlers.push(makeSettler(500 + i, p.x, p.y, { tool: tools[i % tools.length] }));
    }
    const original = moveEntityTowards;
    let frame = 0;
    window.moveEntityTowards = function (ent, tx, ty, speed, isEnemy) {
      if (!isEnemy) {
        const d = Math.hypot(ent.x - tx, ent.y - ty);
        if (d > 20) ent.__want = { frame, tx, ty, d };
      }
      return original.apply(this, arguments);
    };
    const track = new Map();
    const suspects = new Set();
    try {
      for (frame = 0; frame < seconds * 60; frame++) {
        waveTimer = 999;
        update(TICK);
        for (const s of settlers) {
          const w = s.__want;
          if (!w || w.frame !== frame) { track.delete(s); continue; }
          const tr = track.get(s);
          if (!tr || Math.hypot(tr.tx - w.tx, tr.ty - w.ty) > 20) { track.set(s, { since: frame, best: w.d, tx: w.tx, ty: w.ty }); continue; }
          if (w.d < tr.best - 5) { tr.best = w.d; tr.since = frame; continue; }
          if (frame - tr.since >= 180) suspects.add(s);
        }
      }
      const pos = new Map([...suspects].map(s => [s, [s.x, s.y]]));
      run(5);
      const stuck = [...suspects].filter(s => settlers.includes(s) && Math.hypot(s.x - pos.get(s)[0], s.y - pos.get(s)[1]) < 30);
      let overlapping = 0;
      for (let i = 0; i < settlers.length; i++) {
        for (let j = i + 1; j < settlers.length; j++) {
          if (Math.hypot(settlers[i].x - settlers[j].x, settlers[i].y - settlers[j].y) < 14) overlapping++;
        }
      }
      return { stuck: stuck.map(s => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y) })), overlapping };
    } finally {
      window.moveEntityTowards = original;
    }
  }

  // The possessed settler walls itself in away from the hall; enemies that target it must break in
  function bunker({ seed, seconds = 60, count = 6 }) {
    start(seed);
    const tiles = reachableFromHall(isTileBlockedForSettler).filter(t => t.d > 8 && t.d < 14);
    const spot = tiles.find(t => NEIGHBOURS_8.every(([dx, dy]) => {
      const p = tileCenter(t.gx + dx, t.gy + dy);
      return !isTileOccupied(p.x, p.y);
    }));
    const c = tileCenter(spot.gx, spot.gy);
    settlers = [makeSettler(1, c.x, c.y, { hp: 100000, maxHp: 100000, isPossessed: true })];
    for (const [dx, dy] of NEIGHBOURS_8) placeBuilding('wall_stone', c.x + dx * TILE_SIZE, c.y + dy * TILE_SIZE);
    enemies = [];
    for (let i = 0; i < count; i++) {
      const pos = getRandomBorderPos();
      enemies.push(i % 3 === 0 ? createConfiguredEnemy(pos, 'brute', 'big', 18) : createNormalEnemy(pos, 'raider'));
    }
    const walls0 = buildings.length;
    run(seconds, { each: () => { keys.w = keys.a = keys.s = keys.d = false; } });
    return { wallsBroken: walls0 - buildings.length, playerDamage: 100000 - settlers[0].hp };
  }

  // Real waves from GAME_CONFIG from a given wave number on, until at least minEnemies are on the map
  // (so it doesn't depend on wave balance); returns update cost per game second
  function waveCost({ seed = 'wave-test', wave = 16, minEnemies = 45, seconds = 30 }) {
    start(seed);
    for (let w = wave; enemies.length < minEnemies && w < wave + 30; w++) { waveNum = w; startNextWave(); }
    const spawned = enemies.length;
    const t0 = performance.now();
    run(seconds);
    return { spawned, msPerGameSecond: (performance.now() - t0) / seconds };
  }

  // Per seed: spawners and ores of each kind, and whether a settler from the hall can reach an ore of each kind
  function oreReport(seeds) {
    const problems = [];
    for (const seed of seeds) {
      start(seed);
      const reach = getSettlerReach({ x: townHall.x, y: townHall.y });
      const reachable = list => list.some(o => getReachDistanceToResource(reach, o) < Infinity);
      const row = {
        seed,
        ironSpawners: getOreSpawners('iron').length, coalSpawners: getOreSpawners('coal').length,
        iron: ironOres.length, coal: coalOres.length,
        ironReachable: reachable(ironOres), coalReachable: reachable(coalOres)
      };
      if (!row.ironSpawners || !row.coalSpawners || !row.ironReachable || !row.coalReachable) problems.push(row);
    }
    return problems;
  }

  // Mine every ore once (directly, like a possessed settler) and check where they come back.
  // Ore grows back after oreRespawnDelay, so this waits it out (nobody else here can mine).
  function oreRespawn(seed) {
    start(seed);
    settlers = [];
    const radius = getOreSpawnerRadius();
    const result = {};
    const miner = makeSettler(1, 0, 0, { tool: 'pickaxe' });
    const before = { iron: ironOres.length, coal: coalOres.length };
    for (const list of [ironOres, coalOres]) {
      for (const ore of [...list]) { while (list.includes(ore)) { miner.carrying = null; harvestResourceDirect(ore, miner); } }
    }
    const rightAfter = { iron: ironOres.length, coal: coalOres.length };
    run(GAME_CONFIG.map.oreRespawnDelay.max + 1);
    for (const kind of ['iron', 'coal']) {
      const list = kind === 'iron' ? ironOres : coalOres;
      const spawners = getOreSpawners(kind);
      const nearSpawner = o => spawners.some(sp => Math.max(Math.abs(sp.x - o.x), Math.abs(sp.y - o.y)) <= radius * TILE_SIZE);
      result[kind] = { before: before[kind], rightAfter: rightAfter[kind], after: list.length, allNearSpawner: list.every(nearSpawner) };
    }
    // spawners themselves can't be mined or marked
    const spawner = getOreSpawners('iron')[0];
    const spawnerMiner = makeSettler(2, 0, 0, { tool: 'iron_pickaxe' });
    for (let i = 0; i < 20; i++) { spawnerMiner.carrying = null; harvestResourceDirect(spawner, spawnerMiner); }
    result.spawnerSurvivesMining = naturalRocks.includes(spawner);
    result.spawnerHarvestable = getHarvestableResources().includes(spawner);
    return result;
  }

  // A wounded swordsman next to a healing tent is shot at by an enemy archer from range.
  // Returns where he goes: 'tent' (retreated to heal) or 'archer' (went for the attacker).
  function woundedUnderFire({ seed = 'wounded-test', hpShare, seconds = 6 }) {
    start(seed);
    const hx = townHall.x + 120, hy = townHall.y;
    const tent = placeBuilding('tent', hx + 30 * 3, hy);
    settlers = [makeSettler(1, hx, hy, { weapon: 'sword', role: 'soldier', hp: 100 * hpShare })];
    const archer = createConfiguredEnemy({ x: hx, y: hy + 160 }, 'raider_archer', 'archer', 10);
    archer.speed = 0; // stays put and keeps shooting
    archer.damage = 3; // this is about the decision, not balance: survive long enough to act
    enemies = [archer];
    const s = settlers[0];
    // where he heads first: whichever of the two he gets close to first
    let went = null;
    run(seconds, { each: () => {
      if (went) return;
      if (Math.hypot(s.x - archer.x, s.y - archer.y) < 40) went = 'archer';
      else if (Math.hypot(s.x - tent.x, s.y - tent.y) < 40) went = 'tent';
    } });
    return { went, archerHurt: archer.hp < archer.maxHp || !enemies.includes(archer) };
  }

  // A fisher with a rod and a marked fishing spot; counts catches against the seeds in stock
  function fishing({ seed = 'fishing-test', seeds, seconds = 90 }) {
    start(seed);
    // nearest reachable water to the town hall
    const spot = waterTiles.filter(w => isWaterReachable(w))
      .sort((a, b) => Math.hypot(a.x - townHall.x, a.y - townHall.y) - Math.hypot(b.x - townHall.x, b.y - townHall.y))[0];
    spot.isFishing = true;
    settlers = [makeSettler(1, townHall.x + 40, townHall.y, { tool: 'rod' })];
    wheatSeeds = seeds;
    let catches = 0;
    const original = giveResourceToSettler;
    window.giveResourceToSettler = function (s, type, amount) {
      if (type === 'food' && s === settlers[0]) catches++;
      return original.apply(this, arguments);
    };
    try { run(seconds); } finally { window.giveResourceToSettler = original; }
    return { catches, seedsLeft: wheatSeeds };
  }

  // Chop a tree directly and watch the tree count: no instant regrowth, back after respawnDelay
  function treeRegrowth({ seed = 'regrowth-test' } = {}) {
    start(seed);
    settlers = [];
    const count0 = trees.length;
    const tree = trees.find(t => !t.isGrowing);
    const lumberjack = makeSettler(1, tree.x, tree.y, { tool: 'axe' });
    while (trees.includes(tree)) { lumberjack.carrying = null; harvestResourceDirect(tree, lumberjack); }
    const rightAfter = trees.length;
    run(GAME_CONFIG.map.respawnDelay.min - 1);
    const beforeMinDelay = trees.length;
    run(GAME_CONFIG.map.respawnDelay.max - GAME_CONFIG.map.respawnDelay.min + 2);
    return { count0, rightAfter, beforeMinDelay, afterMaxDelay: trees.length };
  }

  // The ground uses more than one shade of grass, not one flat repeating fill (#61)
  function grassTileVariety() {
    start('grass-variety-test');
    const shades = new Set();
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) shades.add(GRASS_SHADES[tileVariantHash(gx, gy) % GRASS_SHADES.length]);
    }
    return { shadeCount: shades.size, totalShades: GRASS_SHADES.length };
  }

  // Clicking a boar directly deals the wielded weapon's hunt damage, not a fixed amount (#62)
  function boarHuntDamage({ seed = 'boar-damage-test', weapon = 'fist', tool = 'none' } = {}) {
    start(seed);
    const hx = townHall.x, hy = townHall.y;
    boars = [{ x: hx + 40, y: hy, hp: 999, maxHp: 999, priority: 0 }];
    const hunter = makeSettler(1, hx, hy, { weapon, tool });
    settlers = [hunter];
    const before = boars[0].hp;
    harvestResourceDirect(boars[0], hunter);
    return before - boars[0].hp;
  }

  // A boar flees the moment a settler gets close, even without being attacked first (#62)
  function boarFlee({ seed = 'boar-flee-test', seconds = 1 } = {}) {
    start(seed);
    // clear obstacles so the flee movement itself is never the thing under test here
    for (const list of [trees, cacti, boulders, naturalRocks, ironOres, coalOres, waterTiles]) list.length = 0;
    const hx = townHall.x, hy = townHall.y;
    boars = [{ x: hx + 200, y: hy, hp: 40, maxHp: 40, priority: 0, wanderTimer: 0, wanderInterval: 999, targetX: hx + 200, targetY: hy }];
    settlers = [makeSettler(1, hx + 220, hy)];
    invalidateAllPaths();
    const b = boars[0], s = settlers[0];
    const startDist = Math.hypot(b.x - s.x, b.y - s.y);
    let sawFlee = false;
    run(seconds, { each: () => { if (b.fleeTimer > 0) sawFlee = true; } });
    return { sawFlee, hid: !!b.hidden, movedAway: Math.hypot(b.x - s.x, b.y - s.y) > startDist };
  }

  // Largest group of boulders on 4-connected tiles, per seed
  function largestBoulderPiles(seeds) {
    return seeds.map(seed => {
      start(seed);
      const key = b => `${b.x},${b.y}`;
      const all = new Set(boulders.map(key));
      const seen = new Set();
      let largest = 0;
      for (const b of boulders) {
        if (seen.has(key(b))) continue;
        let size = 0;
        const queue = [b];
        seen.add(key(b));
        while (queue.length) {
          const c = queue.pop(); size++;
          for (const [dx, dy] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) {
            const k = `${c.x + dx},${c.y + dy}`;
            if (all.has(k) && !seen.has(k)) { seen.add(k); queue.push({ x: c.x + dx, y: c.y + dy }); }
          }
        }
        largest = Math.max(largest, size);
      }
      return largest;
    });
  }

  // Share of trees and of undergrowth (grass, berry bushes, sticks) inside a forest, over many seeds
  function forestShares(seeds) {
    let trees0 = 0, treesIn = 0, under0 = 0, underIn = 0;
    for (const seed of seeds) {
      start(seed);
      const half = getForestSpread() / 2 + TILE_SIZE;
      const inForest = o => forests.some(f => Math.abs(f.x - o.x) <= half && Math.abs(f.y - o.y) <= half);
      trees0 += trees.length; treesIn += trees.filter(inForest).length;
      const under = [...grassList, ...berryBushes, ...sticks];
      under0 += under.length; underIn += under.filter(inForest).length;
    }
    return { trees: treesIn / trees0, undergrowth: underIn / under0 };
  }

  // A swordsman between two enemies: an unmarked one right by the town hall and one the player marked
  // farther out. Returns which one he goes for.
  function markedTarget({ seed = 'marked-test', mark = true, seconds = 3 }) {
    start(seed);
    const hx = townHall.x, hy = townHall.y;
    settlers = [makeSettler(1, hx + 60, hy, { weapon: 'sword', role: 'soldier', hp: 1000, maxHp: 1000 })];
    const near = createNormalEnemy({ x: hx - 60, y: hy }, 'raider');
    const far = createNormalEnemy({ x: hx + 60, y: hy + 150 }, 'raider');
    for (const e of [near, far]) { e.speed = 0; e.damage = 0; }
    far.markedTarget = mark;
    enemies = [near, far];
    const s = settlers[0];
    let went = null;
    run(seconds, { each: () => {
      if (went) return;
      if (Math.hypot(s.x - far.x, s.y - far.y) < 40) went = 'marked';
      else if (Math.hypot(s.x - near.x, s.y - near.y) < 40) went = 'nearHall';
    } });
    return went;
  }

  // Two settlers: one with nothing to do on an empty map, one with a tree to chop
  function idleFlags({ seed = 'idle-test' }) {
    start(seed);
    for (const list of [trees, cacti, boulders, grassList, berryBushes, sticks, pebbles, ironOres, coalOres, boars]) list.length = 0;
    const hx = townHall.x, hy = townHall.y;
    trees.push({ x: hx + 5 * TILE_SIZE, y: hy, hp: 1000, priority: 0, isGrowing: false, growProgress: 0 });
    settlers = [makeSettler(1, hx - 60, hy), makeSettler(2, hx + 60, hy, { tool: 'axe' })];
    invalidateAllPaths();
    run(2);
    return { idleWorker: settlers[0].isIdle, busyWorker: settlers[1].isIdle };
  }

  // An enemy archer shooting at the town hall until its quiver runs dry, with or without an enemy tent
  // nearby to refill from. Counts its shots and tent visits, and whether it ends up clubbing the hall.
  function archerQuiver({ seed = 'quiver-test', withTent, seconds = 90 }) {
    start(seed);
    townHall.hp = townHall.maxHp = 1e6; // this is about arrows, not about the hall falling
    const far = { x: townHall.x - 400, y: townHall.y };
    settlers = [makeSettler(1, far.x, far.y, { isPossessed: true })]; // someone to keep the game going
    enemies = []; projectiles = []; enemyTents = []; enemyArrowStock = 0;
    const archer = createConfiguredEnemy({ x: townHall.x + 200, y: townHall.y }, 'raider_archer');
    enemies = [archer];
    if (withTent) enemyTents.push({ x: townHall.x + 290, y: townHall.y, hp: 1e6, maxHp: 1e6, summonTimer: 0, summonsLeft: 0 });
    const seen = new WeakSet();
    let shots = 0, tentVisits = 0, wasAtTent = false, hallHpBeforeMelee = null;
    run(seconds, { each: () => {
      for (const p of projectiles) if (p.fromEnemy && !seen.has(p)) { seen.add(p); shots++; }
      const atTent = enemyTents.some(t => Math.hypot(t.x - archer.x, t.y - archer.y) <= GAME_CONFIG.enemyTents.buildDistance);
      if (atTent && !wasAtTent) tentVisits++;
      wasAtTent = atTent;
      if (archer.weapon !== 'bow' && hallHpBeforeMelee === null) hallHpBeforeMelee = townHall.hp;
    } });
    return {
      shots, tentVisits, weapon: archer.weapon, stockLeft: enemyArrowStock,
      meleeDamage: hallHpBeforeMelee === null ? 0 : hallHpBeforeMelee - townHall.hp
    };
  }

  // Items whose disarm refund differs from their GAME_CONFIG cost
  function refundMismatches() {
    start('refund-test');
    const bad = [];
    for (const [kind, field] of [['weapons', 'weapon'], ['tools', 'tool']]) {
      for (const [id, item] of Object.entries(GAME_CONFIG[kind])) {
        const s = { weapon: 'fist', tool: 'none', [field]: id };
        const before = getWallet();
        refundEquipment(s);
        const after = getWallet();
        const got = {};
        for (const k in after) if (after[k] !== before[k]) got[getWalletKey(k)] = after[k] - before[k];
        const want = Object.fromEntries(Object.entries(item.cost || {}).map(([k, v]) => [getWalletKey(k), v]));
        if (JSON.stringify(got) !== JSON.stringify(want)) bad.push({ id, got, want });
      }
    }
    return bad;
  }

  return {
    start, run, mapSignature, resourceCounts, pathCoverage, assault, treeSiege, wallContact,
    homecoming, crowd, bunker, waveCost, refundMismatches, oreReport, oreRespawn, woundedUnderFire, fishing,
    markedTarget, idleFlags, treeRegrowth, largestBoulderPiles, forestShares, grassTileVariety,
    boarHuntDamage, boarFlee, archerQuiver
  };
})();
