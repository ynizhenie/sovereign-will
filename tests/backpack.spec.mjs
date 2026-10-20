import { test, expect } from './helpers.mjs';
import { openGame, sim, iconText } from './helpers.mjs';

test('the backpack button gives a worker a backpack for its leather cost (#26)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    stock.leather = 10; stock.herbs = 5; // (grass in it too, #279: no rope)
    window.sim.helpers.placeWorkshop();
    selectedSettler = settlers[0];
    document.getElementById('btn-backpack').click(); // made at the workshop, into the store (#248)
    window.sim.run(25);
    document.querySelector('[data-item="gear:backpack"] .row-give').click(); // handed out to it
    window.sim.run(20);
    return { hasBackpack: !!settlers[0].backpack, leather: stock.leather, herbs: stock.herbs };
  });
  expect(r.hasBackpack).toBe(true);
  expect(r.leather).toBe(6); // (the grass too, but they gather it meanwhile)
  await expect.poll(() => iconText(page, '#btn-backpack')).toEqual(['[[backpack]] Рюкзак 4[[leather]] 2[[herbs]]']);
});
