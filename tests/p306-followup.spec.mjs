import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('the raid bar and selected settler details fit a phone screen (#306 follow-up, 10-11)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openGame(page);
  await page.click('#play-button');
  const layout = await page.evaluate(() => {
    const bar = document.createElement('div');
    bar.id = 'raid-bar';
    bar.innerHTML = '<span>ВРАГОВ 28 · АВАНПОСТ 0% · СТРЕЛ 20</span>' +
      '<button class="btn">АВТОБОЙ</button><button class="btn">ПАЛАТКА 10 ДЕРЕВО</button><button class="btn">ОТСТУПЛЕНИЕ</button>';
    document.getElementById('hud-bottom').prepend(bar);
    selectedSettler = settlers[0];
    Object.assign(selectedSettler, {
      activity: 'patrol',
      carrying: { items: [{ type: 'wood', amount: 8 }, { type: 'stone', amount: 4 }] },
      morale: 0.8
    });
    updateUI();
    const box = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width, height: r.height };
    };
    return {
      viewport: document.documentElement.clientWidth,
      bar: box(bar),
      buttons: [...bar.querySelectorAll('button')].map(box),
      info: box(document.getElementById('selected-info')),
      infoText: document.getElementById('selected-info').textContent,
      infoStyle: getComputedStyle(document.getElementById('selected-info')).whiteSpace
    };
  });
  expect(layout.bar.left).toBeGreaterThanOrEqual(0);
  expect(layout.bar.right).toBeLessThanOrEqual(layout.viewport);
  expect(layout.buttons.every(button => button.left >= 0 && button.right <= layout.viewport)).toBe(true);
  expect(layout.info.width).toBeGreaterThan(0);
  expect(layout.info.height).toBeGreaterThan(15);
  expect(layout.infoStyle).toBe('normal');
  expect(layout.infoText).toContain('несёт');
  expect(errors).toEqual([]);
});

test('marked fishing spots show moving fish, deplete when caught, and replenish (#306 follow-up, 9)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    // (the water nearest the base: fish come back within its frontier, #299; a continent's first tile is out at sea)
    const near = w => Math.hypot(w.x - townHall.x, w.y - townHall.y);
    const spot = game.waterTiles.reduce((best, w) => (!best || near(w) < near(best) ? w : best), null) || { x: townHall.x + 60, y: townHall.y + 60 };
    if (!game.waterTiles.includes(spot)) game.waterTiles.push(spot);
    spot.isFishing = true;
    spot.fishCount = GAME_CONFIG.fishing.fishCapacity;
    const fisher = makeSettler(901, spot.x, spot.y, { tool: 'rod', bait: true });
    for (let i = 0; i < GAME_CONFIG.fishing.fishCapacity; i++) fishAt(fisher, spot, GAME_CONFIG.fishing.seconds);
    const afterCatch = spot.fishCount;
    fishAt(fisher, spot, GAME_CONFIG.fishing.seconds);
    const stillEmpty = spot.fishCount;
    tickFishPopulation(GAME_CONFIG.fishing.fishRegrowSeconds);
    return { afterCatch, stillEmpty, replenished: spot.fishCount, fishCapacity: GAME_CONFIG.fishing.fishCapacity };
  });
  expect(result.afterCatch).toBe(0);
  expect(result.stillEmpty).toBe(0);
  expect(result.replenished).toBe(1);
  expect(errors).toEqual([]);
});

test('cached character heads keep hair visible and centered (#306 follow-up)', async ({ page }) => {
  const errors = await openGame(page);
  const hair = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 200;
    const context = canvas.getContext('2d');
    const look = { female: true, style: 0, shade: 0 };
    drawHeadTexture(context, look, 'humans', '#f5cba7', 100, 100, 22, 0, false, 1);
    const color = GAME_CONFIG.looks.hair.humans[0].slice(1);
    const rgb = [0, 2, 4].map(i => parseInt(color.slice(i, i + 2), 16));
    const pixels = context.getImageData(0, 0, 200, 200).data;
    let count = 0, lowerHair = 0, minX = 200, maxX = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
      const i = (y * 200 + x) * 4;
      if (pixels[i] === rgb[0] && pixels[i + 1] === rgb[1] && pixels[i + 2] === rgb[2] && pixels[i + 3]) {
        count++;
        if (y > 100) lowerHair++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    return { count, lowerHair, minX, maxX };
  });
  expect(hair.count).toBeGreaterThan(100);
  expect(hair.lowerHair).toBeGreaterThan(100);
  expect(hair.minX).toBeGreaterThan(50);
  expect(hair.maxX).toBeLessThan(150);
  expect(errors).toEqual([]);
});
