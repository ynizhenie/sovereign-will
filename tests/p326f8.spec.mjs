import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), a mine on an iron or coal source (26)

test('a mine goes only on a source, one each; a source can\'t be marked; built (by builders, on the rock), it\'s mined unmarked, never used up (#326, 27.10, 26)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('maze-283'); // (its iron source has an open side)
    ironOres = []; coalOres = []; pendingRespawns = [];
    const source = getOreSpawners('iron')[0];
    const spot = getResourceApproachPoint({ x: source.x, y: source.y + 40, radius: 11 }, source) || { x: source.x, y: source.y + 30 };
    const quiet = () => { waveTimer = 999; ironOres = []; coalOres = []; pendingRespawns = []; };
    const run = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { quiet(); update(1 / 60); if (each) each(); } };
    // tapped with Point: not marked, a notice instead
    buildMode = 'interact';
    mouse.x = source.x; mouse.y = source.y; handleCanvasClick();
    const marked = (source.priority || 0) > 0;
    // a worker with a pickaxe by it, no mine: nothing
    settlers = [makeSettler(1, spot.x, spot.y, { tool: 'pickaxe' })];
    stock.ironOre = 0;
    run(15);
    const carried = () => (settlers[0].carrying && settlers[0].carrying.type === 'ironOre' ? settlers[0].carrying.amount : 0);
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
