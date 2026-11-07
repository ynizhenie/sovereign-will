import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), a mine on an iron or coal source (26)

test('a mine goes only on a source, one each; a source can\'t be marked; built (by builders, on the rock), it\'s mined unmarked, never used up (#326, 27.10, 26)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    mapSettings = { cols: 40, rows: 40 };
    window.sim.start('mine-on-source');
    window.sim.helpers.clearResources();
    unlocked['buildings:mine'] = true;
    ironOres = []; coalOres = []; pendingRespawns = [];
    const hall = getGridPos(townHall.x, townHall.y);
    const source = { x: (hall.gx + 3) * TILE_SIZE + 15, y: hall.gy * TILE_SIZE + 15, hp: 100, maxHp: 100, oreSpawner: 'iron' };
    naturalRocks = [source];
    const worker = makeSettler(1, townHall.x, townHall.y, { tool: 'pickaxe' });
    settlers = [worker];
    resetTileIndex();
    const spot = getResourceApproachPoint(worker, source);
    if (!spot) throw new Error('No reachable approach to the test iron spawner');
    const quiet = () => { waveTimer = 999; ironOres = []; coalOres = []; pendingRespawns = []; };
    const run = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { quiet(); update(1 / 60); if (each) each(); } };
    // tapped with Point: not marked, a notice instead
    buildMode = 'interact';
    mouse.x = source.x; mouse.y = source.y; handleCanvasClick();
    const marked = (source.priority || 0) > 0;
    // a worker with a pickaxe by it, no mine: nothing
    worker.x = spot.x; worker.y = spot.y;
    stock.ironOre = 0;
    run(15);
    const carried = () => (worker.carrying && worker.carrying.type === 'ironOre' ? worker.carrying.amount : 0);
    const without = stock.ironOre + carried();
    // a mine: not on plain ground, on the source yes, not twice
    stock.wood = 200; stock.stone = 200;
    buildMode = 'mine';
    mouse.x = townHall.x + 4 * TILE_SIZE; mouse.y = townHall.y + 4 * TILE_SIZE; handleCanvasClick();
    const onGround = blueprints.some(b => b.type === 'mine');
    mouse.x = source.x; mouse.y = source.y; handleCanvasClick();
    mouse.x = source.x; mouse.y = source.y; handleCanvasClick();
    const placed = blueprints.filter(b => b.type === 'mine').length;
    buildMode = 'interact';
    // built by a builder standing by the rock
    settlers.push(makeSettler(2, spot.x, spot.y));
    let built = false;
    run(60, () => { if (buildings.some(b => b.type === 'mine')) built = true; });
    built = built || buildings.some(b => b.type === 'mine');
    // now mined, unmarked
    settlers = [makeSettler(3, spot.x, spot.y, { tool: 'pickaxe' })];
    stock.ironOre = 0;
    run(40);
    return { marked, without, onGround, placed, built, ore: stock.ironOre + carried(), priority: source.priority || 0, standing: naturalRocks.includes(source) };
  });
  expect(r.marked).toBe(false);
  expect(r.without).toBe(0);
  expect(r.onGround).toBe(false);
  expect(r.placed).toBe(1);
  expect(r.built).toBe(true);
  expect(r.ore).toBeGreaterThanOrEqual(1); // (one carried home from far off; then the nearest thing, as for any ore)
  expect(r.priority).toBe(0);
  expect(r.standing).toBe(true);
  expect(errors).toEqual([]);
});
