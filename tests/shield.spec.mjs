import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('a shield cuts the damage a melee soldier takes, on top of armour (#27)', async ({ page }) => {
  await openGame(page);
  const taken = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('shield-test');
    const hit = extra => { const s = makeSettler(1, 0, 0, { weapon: 'sword', role: 'soldier', ...extra }); damageSettler(s, 40); return 100 - s.hp; };
    return {
      plain: hit({}), shield: hit({ shield: true }), armor: hit({ armor: 'iron' }), both: hit({ armor: 'iron', shield: true }),
      archer: hit({ weapon: 'bow', role: 'archer', shield: true }), worker: hit({ weapon: 'fist', role: 'worker', shield: true })
    };
  });
  expect(taken.plain).toBe(40);
  expect(taken.shield).toBe(30); // 25% off
  expect(taken.armor).toBeCloseTo(26); // armour alone: 35% off
  expect(taken.both).toBeCloseTo(19.5);
  expect(taken.archer).toBe(40); // no use with a bow
  expect(taken.worker).toBe(40);
});

test('the shield button equips a melee soldier; disarming gives the shield back (#27)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.showNotification = () => {};
    settlers = [
      makeSettler(1, townHall.x - 40, townHall.y, { weapon: 'bow', role: 'archer', quiver: true }),
      makeSettler(2, townHall.x + 40, townHall.y, { weapon: 'sword', role: 'soldier' })
    ];
    stock.wood = 10; stock.iron = 5;
    selectedSettler = null;
    document.getElementById('btn-shield').click();
    const out = { archer: !!settlers[0].shield, soldier: !!settlers[1].shield, wood: stock.wood, iron: stock.iron,
      label: document.getElementById('btn-shield').innerText };
    selectedSettler = settlers[1];
    disarmSettler('weapon');
    window.sim.run(5);
    return { ...out, afterDisarm: !!settlers[1].shield, ironBack: stock.iron };
  });
  expect(r).toMatchObject({ archer: false, soldier: true, wood: 4, iron: 3, label: '🛡️ Щит (6🪵 2🔩)', afterDisarm: false, ironBack: 5 });
});
