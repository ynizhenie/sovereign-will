import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// A raid on an enemy camp (#255)
test('two waves beaten: a camp\'s zone opens for a while, a button to raid it (#255)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'campOpens', {});
  expect(r.camp.timeLeft).toBeGreaterThan(140);
  expect(['left', 'right', 'top', 'bottom']).toContain(r.camp.side);
  expect(r.bar).toContain('Вражеский лагерь');
  // gone when its time's up
  expect(await page.evaluate(() => { raidCamp.timeLeft = 0.01; update(1 / 60); return raidCamp; })).toBe(null);
  expect(errors).toEqual([]);
});

test('the party picked walks to the edge, the base waits; Attack! and only the camp is there (#255)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'intoCamp', {});
  expect(r.preselected).toBe(4); // (the armed)
  expect(r.party).toBe(4);
  expect(r.got).toBe(true);
  expect(r.timerHeld).toBe(true);
  expect(r.resting).toBe(true);
  expect(r).toMatchObject({ phase: 'fight', cols: 26, settlers: 4, hallAway: true, outpost: 1, guarded: true, saveHidden: true });
  expect(r.tents).toBeGreaterThanOrEqual(2);
  expect(r.defenders).toBeGreaterThanOrEqual(4);
  expect(r.walls).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('the defenders are like the player\'s army: in armour if it is (#255)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'intoCamp', { gear: { armor: 'iron' } });
  expect(r.armored).toBe(r.defenders);
});

test('won by the auto battle: spoils, the party walks home, the zone goes, the next wave waits twice as long (#255)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'raidOutcome', { win: true });
  expect(r.held).toBe(true);
  expect(r.back.phase).toBe('return');
  expect(r.back.hallHome).toBe(true);
  expect(r.back.wood).toBeGreaterThan(0);
  expect(r.back.homeSettlers).toBe(r.homeSettlers);
  expect(r.back.survivors).toBeGreaterThan(0);
  expect(r.end.phase).toBe(null);
  expect(r.homeIn).toBeLessThan(30); // (#279: home, not stuck on the way till the minute's up)
  expect(r.end.camp).toBe(null);
  expect(r.end.raiders).toBe(0);
  expect(r.end.waveTimer).toBeGreaterThan(r.waveBefore + 100);
  expect(errors).toEqual([]);
});

test('the party all down: the base is back at once, the camp gone, a wave in 15 s (#255)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'raidOutcome', { win: false });
  expect(r.back).toMatchObject({ phase: null, hallHome: true, survivors: 0 });
  expect(r.back.homeSettlers).toBe(r.homeSettlers);
  expect(r.back.cols).not.toBe(26);
  expect(r.end.camp).toBe(null);
  expect(r.end.waveTimer).toBeLessThanOrEqual(15);
  expect(errors).toEqual([]);
});

test('orders: an enemy tapped is everyone\'s target; a raider picked and a spot tapped, it goes there (#255)', async ({ page }) => {
  await openGame(page);
  await sim(page, 'intoCamp', {});
  const r = await page.evaluate(() => {
    const en = enemies[0];
    raidTap(en.x, en.y);
    const all = settlers.every(s => s.orderTarget === en) && en.markedTarget;
    const s = settlers[1];
    raidTap(s.x, s.y);
    // a spot of ground clear of everyone
    const spot = [[0, 90], [90, 0], [0, -90], [-90, 0]].map(([dx, dy]) => ({ x: s.x + dx, y: s.y + dy }))
      .find(p => [...settlers, ...enemies].every(o => Math.hypot(o.x - p.x, o.y - p.y) > 40));
    raidTap(spot.x, spot.y);
    return { all, picked: selectedSettler === s, spot: s.orderSpot.x === spot.x && s.orderSpot.y === spot.y, cleared: s.orderTarget === null };
  });
  expect(r).toEqual({ all: true, picked: true, spot: true, cleared: true });
});
