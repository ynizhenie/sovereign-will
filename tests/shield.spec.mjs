import { test, expect } from './helpers.mjs';
import { openGame, iconText } from './helpers.mjs';

test('the shield button equips a melee soldier; taking its weapon off keeps the shield, taking the shield off gives it back (#27, #232)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    settlers = [
      makeSettler(1, townHall.x - 40, townHall.y, { weapon: 'bow', role: 'archer', quiver: true }),
      makeSettler(2, townHall.x + 40, townHall.y, { weapon: 'sword', role: 'soldier' })
    ];
    stock.wood = 10; stock.iron = 5;
    window.sim.helpers.placeBuilding('smithy', townHall.x + 90, townHall.y + 15 - (townHall.y % 30) + 60);
    selectedSettler = null;
    document.getElementById('btn-shield').click();
    window.sim.run(30); // made at the smithy (iron, #211), into the store
    document.querySelector('[data-item="gear:shield"] .row-give').click(); // handed out (#248)
    window.sim.run(20); // it walks to the town hall for it
    const out = { archer: !!settlers[0].shield, soldier: !!settlers[1].shield, wood: stock.wood, iron: stock.iron };
    selectedSettler = settlers[1];
    disarmSettler('weapon');
    window.sim.run(15); // back to the town hall from wherever the making took it (#211)
    const afterDisarm = { weapon: settlers[1].weapon, shield: !!settlers[1].shield };
    orderGearOff('shield');
    window.sim.run(15);
    return { ...out, afterDisarm, shieldOff: !settlers[1].shield, ironBack: stock.iron };
  });
  expect(r).toMatchObject({ archer: false, soldier: true, wood: 4, iron: 3, afterDisarm: { weapon: 'fist', shield: true }, shieldOff: true, ironBack: 5 });
  await expect.poll(() => iconText(page, '[data-item="gear:shield"] .craft-tile')).toEqual(['[[shield]] Щит 6[[wood]] 2[[iron]]']);
});
