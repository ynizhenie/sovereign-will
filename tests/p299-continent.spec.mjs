import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #299, step 2: a big map is a continent

test('a big map is a continent in the sea: its land never at the map\'s edge, of all its biomes, a new shape each world; a smaller map as before (#299)', async ({ page }) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const one = (size, seed) => {
      mapSettings = { cols: size, rows: size }; window.sim.start(seed);
      const water = new Set(waterTiles.map(w => `${w.x},${w.y}`));
      const at = (gx, gy) => water.has(`${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`);
      let edgeLand = 0;
      for (let k = 0; k < size; k++) for (const [gx, gy] of [[k, 0], [k, size - 1], [0, k], [size - 1, k]]) if (!at(gx, gy)) edgeLand++;
      const land = size * size - waterTiles.length;
      // a shape: which of 16 squares of the map are mostly land
      const shape = [];
      for (let qy = 0; qy < 4; qy++) for (let qx = 0; qx < 4; qx++) {
        let l = 0;
        for (let gy = qy * size / 4; gy < (qy + 1) * size / 4; gy += 4) for (let gx = qx * size / 4; gx < (qx + 1) * size / 4; gx += 4) if (!at(gx, gy)) l++;
        shape.push(l > (size / 16) ** 2 / 2 ? 1 : 0);
      }
      return { edgeLand, landShare: land / (size * size), desert: desertTiles.length, rocks: naturalRocks.length, trees: trees.length, forests: forests.length, beach: beachTiles.length, boars: boars.length, shape: shape.join('') };
    };
    const a = one(256, 'continent-a'), b = one(256, 'continent-b'), big = one(512, 'continent-c');
    mapSettings = { cols: 60, rows: 60 }; window.sim.start('small-60');
    const small = { water: waterTiles.length, edgeWater: waterTiles.some(w => w.x < 60 || w.y < 60) };
    mapSettings = { cols: 40, rows: 40 };
    return { a, b, big, small };
  });
  for (const m of [r.a, r.b, r.big]) {
    expect(m.edgeLand).toBe(0);
    expect(m.landShare).toBeGreaterThan(0.25);
    expect(m.landShare).toBeLessThan(0.7);
    for (const k of ['desert', 'rocks', 'trees', 'forests', 'beach', 'boars']) expect(m[k]).toBeGreaterThan(0);
  }
  expect(r.a.shape).not.toBe(r.b.shape);
  // a smaller map: no sea round it, lakes only
  expect(r.small.edgeWater).toBe(false);
  expect(r.small.water).toBeLessThan(400);
  expect(errors).toEqual([]);
});

test('the start: on grassland far from the sea, room round the hall, rock, ore, trees and food near; settlers walk up to the hall; waves come on land joined to it (#299)', async ({ page }) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const out = [];
    for (const seed of ['start-a', 'start-b', 'start-c']) {
      mapSettings = { cols: 256, rows: 256 }; window.sim.start(seed);
      const near = (list, tiles) => list.filter(o => Math.hypot(o.x - townHall.x, o.y - townHall.y) < tiles * TILE_SIZE).length;
      // the sea: the water joined to the map's corner (a lake may be near; the sea farther)
      const water = new Set(waterTiles.map(w => `${w.x},${w.y}`)), sea = new Set(['15,15']), queue = [[15, 15]];
      for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) {
        const k = `${queue[i][0] + dx},${queue[i][1] + dy}`;
        if (water.has(k) && !sea.has(k)) { sea.add(k); queue.push([queue[i][0] + dx, queue[i][1] + dy]); }
      }
      const seaNear = waterTiles.filter(w => sea.has(`${w.x},${w.y}`) && Math.hypot(w.x - townHall.x, w.y - townHall.y) < 6 * TILE_SIZE).length;
      const blockedNear = [...trees, ...boulders, ...naturalRocks, ...waterTiles].some(o => Math.hypot(o.x - townHall.x, o.y - townHall.y) < 4.5 * TILE_SIZE);
      const spots = Array.from({ length: 20 }, () => getRandomBorderPos());
      const joined = getEnemyReach();
      const onLand = spots.every(p => joined[Math.floor(p.y / TILE_SIZE) * COLS + Math.floor(p.x / TILE_SIZE)] === 1);
      // they eat at the hall
      stock.food = 2; settlers.forEach(s => { s.hunger = 999; s.wantsMeal = true; });
      let ate = false;
      for (let f = 0; f < 900 && !ate; f++) { update(1 / 60); ate = settlers.every(s => s.eating || !s.wantsMeal); }
      out.push({ seed, hallOnCorner: townHall.x % TILE_SIZE === 0 && townHall.y % TILE_SIZE === 0, seaNear, blockedNear, rock: near(naturalRocks, 26), iron: near(getOreSpawners('iron'), 30), coal: near(getOreSpawners('coal'), 30), trees: near(trees, 20), food: near(berryBushes, 20) + near(boars, 25), onLand, ate });
    }
    mapSettings = { cols: 40, rows: 40 };
    return out;
  });
  for (const s of r) {
    expect(s).toMatchObject({ hallOnCorner: true, seaNear: 0, blockedNear: false, onLand: true, ate: true });
    expect(s.rock).toBeGreaterThan(3);
    expect(s.iron + s.coal).toBeGreaterThanOrEqual(1);
    expect(s.trees).toBeGreaterThan(10);
    expect(s.food).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('a continent starts with 3–5 boars in the player territory', async ({ page }) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  const counts = await page.evaluate(() => {
    const results = [];
    for (const seed of ['start-boars-a', 'start-boars-b', 'start-boars-c']) {
      mapSettings = { cols: 192, rows: 192 }; window.sim.start(seed);
      const half = GAME_CONFIG.territory.startTiles / 2;
      results.push(boars.filter(b => {
        const gx = Math.floor(b.x / TILE_SIZE), gy = Math.floor(b.y / TILE_SIZE);
        return gx >= Math.floor(townHall.x / TILE_SIZE) - half && gx < Math.floor(townHall.x / TILE_SIZE) + half &&
          gy >= Math.floor(townHall.y / TILE_SIZE) - half && gy < Math.floor(townHall.y / TILE_SIZE) + half;
      }).length);
    }
    mapSettings = { cols: 40, rows: 40 };
    return results;
  });
  expect(counts.every(n => n >= 3 && n <= 5)).toBe(true);
  expect(errors).toEqual([]);
});
