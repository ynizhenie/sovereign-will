import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's batch of fixes (#279), comment 1, part G2: the enemy camp and scouts (see tests/scenarios/g2279.js)
test('the camp stays as it is: what the scout saw is what\'s attacked, whatever the army has become since (#279, c1.14)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'campFixed', {});
  expect(r).toEqual({ scouted: true, same: true });
  expect(errors).toEqual([]);
});

test('a retreat leaves the camp at once: the party walks home, all of it (#279, c1.15)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'retreatWalks', {});
  expect(r.out).toBe(true);
  expect(r.home).toBe(r.entry);
  expect(errors).toEqual([]);
});

test('the scout is picked, one only, and isn\'t seen the moment it gets there (#279, c1.13)', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'scoutPicked', {})).toEqual({ firstOn: 1, oneOn: 1, chosen: true, unseen: true });
  expect(errors).toEqual([]);
});

test('in the camp an enemy tapped again has the order taken off (#279, c1.6)', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'orderOff', {})).toEqual({ on: true, off: true });
  expect(errors).toEqual([]);
});

test('a shelter pitched in the camp heals, and archers fill their quivers there from the arrows taken (#279, c1.7)', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'campShelter', {})).toEqual({ offered: '12', took: 12, left: 18, site: true, built: true, mended: true, quiver: true, kept: true });
  expect(errors).toEqual([]);
});
