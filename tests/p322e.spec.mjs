import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: a settler at its everyday work is offered the whole list of behaviours only every few ticks, in a calm colony

test('a settler strolling about takes up a more urgent thing within a few ticks (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = false;
    window.sim.helpers.clearResources();
    game.waveTimer = 99999;
    resetTileIndex();
    const s = window.sim.helpers.makeSettler(1, townHall.x + 5 * TILE_SIZE, townHall.y, {});
    settlers.length = 0; settlers.push(s);
    for (let i = 0; i < 30; i++) update(1 / 60);
    const settled = s.isIdle === true && typeof s.lastBehaviour === 'function';
    s.needsRelief = true;
    let calm = 0;
    while (s.activity !== 'relieve' && calm < 20) { update(1 / 60); calm++; }
    return { settled, calm };
  });
  expect(r.settled).toBe(true);
  expect(r.calm).toBeLessThanOrEqual(5);
  expect(errors).toEqual([]);
});
