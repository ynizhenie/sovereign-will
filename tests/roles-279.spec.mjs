import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's batch of fixes (#279), part D: roles, the captain arming, possession
test('a worker with a weapon is a soldier, a foreman takes none, each named by what it holds (#279, 12)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'roles', {});
  expect(r).toMatchObject({ workerRole: 'soldier', foremanWeapon: 'fist', foremanRole: 'worker', clubStored: 1, given: false });
  expect(r.titles).toEqual({ axe: 'лесоруб', hoe: 'фермер', rod: 'рыбак', medbag: 'лекарь', bow: 'лучник', none: 'разнорабочий' });
});

test('a captain lends the unarmed weapons from the store before a wave and has them back after (#279, 13)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'captainLends', {});
  expect(r.armed).toEqual(['club', 'spear']);
  expect(r.after).toEqual(['fist', 'fist']);
  expect(r.back).toEqual({ 'weapons:spear': 1, 'weapons:club': 1 });
});

test('by hand: heal the one tapped, carry a corpse out, a pack in, cook at a fire (#279, 47)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'byHand', {});
  expect(r).toEqual({ healed: true, corpse: { carried: true, moved: true }, packIn: true, cookOrder: 'job', cooked: true });
});
