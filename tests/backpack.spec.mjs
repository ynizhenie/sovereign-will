import { test, expect } from './helpers.mjs';
import { openGame, sim, iconText } from './helpers.mjs';

test('the backpack button gives a worker a backpack for its leather cost (#26)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    stock.leather = 10;
    selectedSettler = settlers[0];
    document.getElementById('btn-backpack').click();
    window.sim.run(25); // made at the town hall (#211), then it walks there for it
    return { hasBackpack: !!settlers[0].backpack, leather: stock.leather, };
  });
  expect(r.hasBackpack).toBe(true);
  expect(r.leather).toBe(5);
  await expect.poll(() => iconText(page, '#btn-backpack')).toEqual(['[[backpack]] Рюкзак (5[[leather]])']);
});
