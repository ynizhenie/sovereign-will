import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('one warning 15 s before a wave (#106)', async ({ page }) => {
  await openGame(page);
  const notes = await page.evaluate(() => {
    window.sim.start('warning-test');
    const seen = [];
    const original = showNotification;
    window.showNotification = msg => seen.push(msg);
    try {
      waveTimer = 20;
      for (let f = 0; f < 60 * 10; f++) update(1 / 60); // 20 s -> 10 s left
    } finally { window.showNotification = original; }
    return seen.filter(m => m.includes('Волна'));
  });
  expect(notes).toEqual(['[[warn]] Волна врагов через 15 секунд!']);
});

test('a medic fills its bag with herbs at the town hall and gives them back with the bag (#106)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler, clearResources } = window.sim.helpers;
    window.sim.start('medic-bag-test');
    clearResources();
    const soldier = makeSettler(1, townHall.x + 60, townHall.y, { weapon: 'sword', role: 'soldier', hp: 90, isPossessed: true });
    const medic = makeSettler(2, townHall.x, townHall.y + 60, { tool: 'medbag' });
    settlers = [soldier, medic];
    const en = createConfiguredEnemy({ x: 3 * TILE_SIZE + 15, y: 3 * TILE_SIZE + 15 }, 'raider'); en.speed = 0; en.damage = 0;
    enemies = [en];
    stock.herbs = 8;
    window.sim.run(3, { each: () => { keys.w = keys.a = keys.s = keys.d = false; } });
    const filled = { bag: medic.bagHerbs, stock: stock.herbs };
    refundEquipment(medic);
    return { filled, afterRefund: { bag: medic.bagHerbs, stock: stock.herbs } };
  });
  // 5 into the bag, one used on the soldier (90 -> 100)
  expect(r.filled).toEqual({ bag: 4, stock: 3 });
  expect(r.afterRefund).toEqual({ bag: 0, stock: 9 }); // 3 + the 4 in the bag + the bag's own 2 herbs
});

test('a watchtower is repaired only when ordered, priced like any building (#106)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler, placeBuilding } = window.sim.helpers;
    window.sim.start('tower-repair-test');
    window.showNotification = () => {};
    const tower = placeBuilding('watchtower', townHall.x + 90, townHall.y + 90);
    tower.hp = tower.maxHp / 2;
    settlers = [makeSettler(1, townHall.x - 40, townHall.y)];
    stock.wood = stock.stone = 100;
    window.sim.run(8);
    const unordered = tower.hp / tower.maxHp;
    toggleBuildingRepair(tower);
    window.sim.run(20);
    return { unordered, after: tower.hp / tower.maxHp, step: getRepairStep(tower).cost };
  });
  expect(r.unordered).toBe(0.5);
  expect(r.after).toBe(1);
  expect(r.step).toEqual({ wood: 5, stone: 4 }); // 20% of 25 wood, 20 stone
});

test('ore spawners grow ore on free ground only, never over natural rock (#106)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => ['maze-283', 'maze-137', 'ore-a'].map(seed => {
    window.sim.start(seed);
    const rocks = naturalRocks.length;
    const rockAt = new Set(naturalRocks.map(o => `${o.x},${o.y}`));
    for (let i = 0; i < 40; i++) { respawnOre('iron'); respawnOre('coal'); }
    return { rocksKept: naturalRocks.length === rocks, oreOnRock: [...ironOres, ...coalOres].some(o => rockAt.has(`${o.x},${o.y}`)) };
  }));
  for (const m of r) expect(m).toEqual({ rocksKept: true, oreOnRock: false });
});

test('forests are uneven blobs of lobes, their trees inside them (#106)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => ['forest-a', 'forest-b', 'maze-137'].map(seed => {
    window.sim.start(seed);
    const inForest = t => forests.some(f => f.lobes.some(l => Math.hypot(t.x - l.x, t.y - l.y) <= l.r + TILE_SIZE));
    const grown = trees.filter(t => !t.isGrowing);
    return { forests: forests.length, minLobes: Math.min(...forests.map(f => f.lobes.length)), shareInForests: grown.filter(inForest).length / grown.length };
  }));
  for (const m of r) {
    expect(m.forests).toBeGreaterThan(0);
    expect(m.minLobes).toBeGreaterThanOrEqual(3);
    expect(m.shareInForests).toBeGreaterThan(0.5);
  }
});
