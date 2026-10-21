import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #306, part C (7): women and men, five looks each
test('settlers and enemies are women 40% of the time, with five looks each, some commoner; a corpse keeps its look; an old one gets one (#306, 7)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const looks = Array.from({ length: 4000 }, () => newLook());
    const female = looks.filter(l => l.female).length / looks.length;
    const styles = g => [0, 1, 2, 3, 4].map(i => looks.filter(l => l.female === g && l.style === i).length);
    stock.food = 999;
    spawnSettler('normal');
    const hired = settlers[settlers.length - 1];
    const enemy = createConfiguredEnemy({ x: townHall.x + 100, y: townHall.y }, 'raider');
    addCorpse(hired, 'settler', 'normal');
    const corpseLook = corpses[corpses.length - 1].look === hired.look;
    const old = window.sim.helpers.makeSettler(99, townHall.x + 50, townHall.y + 50, {}); delete old.look; settlers.push(old);
    for (let f = 0; f < 3; f++) render();
    return { female, men: styles(false), women: styles(true), hired: !!hired.look, enemy: !!enemy.look, corpseLook, oldGot: !!old.look };
  });
  expect(r.female).toBeGreaterThan(0.36);
  expect(r.female).toBeLessThan(0.44);
  for (const counts of [r.men, r.women]) {
    expect(counts.every(n => n > 0)).toBe(true);
    expect(Math.max(...counts)).toBeGreaterThan(Math.min(...counts) * 1.4); // (some commoner than others)
  }
  expect(r).toMatchObject({ hired: true, enemy: true, corpseLook: true, oldGot: true });
  expect(errors).toEqual([]);
});
