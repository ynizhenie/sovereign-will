import { test, expect } from './helpers.mjs';
import { openGame, iconText } from './helpers.mjs';

test('the stock drops down at one level: a line a group, its name and each resource in it in sight, no rows to open (#106, #248)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => { Object.assign(stock, { rawMeat: 6, rawFish: 2, wheat: 4 }); updateUI(); });
  await page.click('#resource-strip'); // all of the stock, dropped down from the strip
  const raw = page.locator('#resources-hud .res-line', { has: page.locator('#resource-rawMeat-txt') });
  await expect(raw).toBeVisible();
  await expect(raw.locator('.res-line-name')).toHaveText('Сырая еда');
  // (#279) each with its name; none of a thing (the worms): hidden
  await expect.poll(() => page.$$eval('#resources-hud .res-line:has(#resource-rawMeat-txt) .res-chip:not([hidden])', cs => cs.map(c => `${c.querySelector('b').textContent} ${c.querySelector('.res-name').textContent}`)))
    .toEqual(['6 Сырое мясо', '2 Сырая рыба', '4 Зерно']);
  await expect(page.locator('#resources-hud .res-chip:has(#resource-worms-txt)')).toBeHidden();
  // every resource has exactly one place, grouped or not (a faction's own only for it: no bones for the humans, #43)
  const places = await page.evaluate(() => Object.values(GAME_CONFIG.resources).filter(r => !r.factions || r.factions.includes(sides.player.faction))
    .map(r => document.querySelectorAll(`#${resourceHudId(r.id)}`).length));
  expect(places.every(n => n === 1)).toBe(true);
  // the panel never gets wider than a phone
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});

test('the population icon follows the faction and role counters are hidden', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  for (const [faction, icon] of [['humans', 'worker'], ['demons', 'imp'], ['undead', 'zombie']]) {
    const result = await page.evaluate(faction => {
      setSideFaction('player', faction);
      updateUI();
      return {
        icons: [
          document.querySelector('#population-icon i')?.className,
          document.querySelector('#strip-pop-icon i')?.className
        ],
        hasWorkers: !!document.getElementById('workers-cnt'),
        hasWarriors: !!document.getElementById('warriors-cnt')
      };
    }, faction);
    expect(result.icons).toHaveLength(2);
    result.icons.forEach(iconClass => expect(iconClass).toContain(`ic-${icon}`));
    expect(result.hasWorkers).toBe(false);
    expect(result.hasWarriors).toBe(false);
  }
});

test('farm zones and the base night-work boundary are drawn with the Zones tab open (#106)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const g = getGridPos(townHall.x, townHall.y);
    const z = window.sim.helpers.tileCenter(g.gx + 4, g.gy + 4);
    for (const list of [trees, grassList, sticks, pebbles, berryBushes, boulders]) { const i = list.findIndex(o => o.x === z.x && o.y === z.y); if (i !== -1) list.splice(i, 1); }
    farmZones = [{ x: z.x, y: z.y, crop: 'wheat' }, { x: z.x + TILE_SIZE, y: z.y, crop: 'rice' }];
    // count strokes of the zone frame colour while rendering
    const zoneFrames = color => {
      let frames = 0;
      const original = ctx.strokeRect;
      ctx.strokeRect = function (...args) { if (String(ctx.strokeStyle).includes(color)) frames++; return original.apply(this, args); };
      try { render(); } finally { ctx.strokeRect = original; }
      return frames;
    };
    const baseBoundary = () => {
      let strokes = 0;
      const original = ctx.stroke;
      ctx.stroke = function (...args) {
        if (String(ctx.strokeStyle).includes('255, 255, 255, 0.8')) strokes++;
        return original.apply(this, args);
      };
      try { render(); } finally { ctx.stroke = original; }
      return strokes;
    };
    const onBuild = { wheat: zoneFrames('241, 196, 15, 0.55'), rice: zoneFrames('255, 255, 255, 0.55'), base: baseBoundary() };
    switchTab(document.querySelector('.tab-btn[data-arg="tab-farming"]'), 'tab-farming');
    const onFarming = { wheat: zoneFrames('241, 196, 15, 0.55'), rice: zoneFrames('255, 255, 255, 0.55'), base: baseBoundary() };
    return { onBuild, onFarming };
  });
  expect(r).toEqual({
    onBuild: { wheat: 0, rice: 0, base: 0 },
    onFarming: { wheat: 1, rice: 1, base: 1 }
  });
});
