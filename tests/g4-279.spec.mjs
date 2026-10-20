import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's batch of fixes (#279), comment 1, part G4: the menu's fight
test('the menu\'s fight: the warehouse shows what it holds, the squad guards it, the zombies can break it and then the medic has no herbs (#279, c1.1, c1.20)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    showMenuScreen('home'); enterMenuWorld('fight');
    document.getElementById('menu-hide').click();
    const hp0 = townHall.hp;
    // a zombie far off: the squad doesn't go after it
    const far = createConfiguredEnemy({ x: townHall.x + 9 * TILE_SIZE, y: townHall.y }, 'undead_zombie'); far.speed = 0;
    enemies = [far]; menuWorld.fight.next = 999;
    let wentFar = 0;
    for (let f = 0; f < 60 * 8; f++) { update(1 / 60); render(); for (const s of settlers) if (s.role === 'soldier') wentFar = Math.max(wentFar, Math.hypot(s.x - townHall.x, s.y - townHall.y)); }
    // zombies at the warehouse with nobody to stop them: it's hurt
    const squad = settlers; settlers = [];
    enemies = [0, 1, 2].map(i => createConfiguredEnemy({ x: townHall.x + 20, y: townHall.y + 10 * i }, 'undead_zombie'));
    for (let f = 0; f < 60 * 2.5; f++) update(1 / 60); // (under 3 s: with no squad the scene starts over then)
    const hurt = townHall.hp < hp0;
    townHall.hp = 0; settlers = squad; enemies = [far];
    for (let f = 0; f < 30; f++) { update(1 / 60); render(); }
    return { hp0, wentFar: Math.round(wentFar), hurt, herbsWhenBroken: stock.herbs };
  });
  expect(r.hp0).toBe(300);
  expect(r.wentFar).toBeLessThan(4 * 30 + 40);
  expect(r.hurt).toBe(true);
  expect(r.herbsWhenBroken).toBe(0);
  expect(errors).toEqual([]);
});
