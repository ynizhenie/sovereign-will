import { test, expect } from '@playwright/test';
import { openGame, iconText } from './helpers.mjs';

test('resources are grouped: a group tile shows its total and opens a row with each resource (#106)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => { Object.assign(stock, { rawMeat: 6, rawFish: 2, wheat: 4 }); updateUI(); });
  await expect(page.locator('#group-raw-txt')).toHaveText('12');
  await expect(page.locator('#group-raw-members')).toBeHidden();
  await page.click('#group-raw');
  await expect(page.locator('#group-raw-members')).toBeVisible();
  await expect.poll(() => iconText(page, '#group-raw-members div')).toEqual(['[[rawMeat]] Сырое мясо: 6', '[[rawFish]] Сырая рыба: 2', '[[wheat]] Зерно: 4', '[[worms]] Червяки: 0']);
  // another group closes the first; tapping it again closes it
  await page.click('#group-materials');
  await expect(page.locator('#group-raw-members')).toBeHidden();
  await expect(page.locator('#group-materials-members')).toBeVisible();
  await page.click('#group-materials');
  await expect(page.locator('#group-materials-members')).toBeHidden();
  // every resource has exactly one tile, grouped or not
  // (a faction's own resources only show for it: no bones for the humans, #43)
  const tiles = await page.evaluate(() => Object.values(GAME_CONFIG.resources).filter(r => !r.factions || r.factions.includes(sides.player.faction))
    .map(r => document.querySelectorAll(`#${resourceHudId(r.id)}`).length));
  expect(tiles.every(n => n === 1)).toBe(true);
  // the panel never gets wider than a phone
  await page.setViewportSize({ width: 360, height: 800 });
  await page.click('#group-plants');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});

test('farm zones are drawn only with the Farming tab open (#106)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const g = getGridPos(townHall.x, townHall.y);
    const z = window.sim.helpers.tileCenter(g.gx + 4, g.gy + 4);
    for (const list of [trees, grassList, sticks, pebbles, berryBushes, boulders]) { const i = list.findIndex(o => o.x === z.x && o.y === z.y); if (i !== -1) list.splice(i, 1); }
    farmZones = [{ x: z.x, y: z.y, crop: 'wheat' }];
    // count strokes of the zone frame colour while rendering
    const drawn = () => {
      let frames = 0;
      const original = ctx.strokeRect;
      ctx.strokeRect = function (...args) { if (String(ctx.strokeStyle).includes('241, 196, 15, 0.55')) frames++; return original.apply(this, args); };
      try { render(); } finally { ctx.strokeRect = original; }
      return frames;
    };
    const onBuild = drawn();
    switchTab(document.querySelector('.tab-btn[onclick*="tab-farming"]'), 'tab-farming');
    const onFarming = drawn();
    return { onBuild, onFarming };
  });
  expect(r).toEqual({ onBuild: 0, onFarming: 1 });
});
