import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's batch of fixes (#279), part A2: the night and the AI
test('a corpse by the tent is taken away before sleeping there; asleep, the hurt mend (#279, 8, 31)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'corpseBySleep', {})).toEqual({ carried: true, nearTent: 0, asleep: true, mended: true });
});

test('a torch post at night with the workers asleep: a soldier builds it (#279, 9)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'soldierTorch', {})).toEqual({ workerAsleep: true, soldierBuilt: true, torchUp: true });
});

test('ordered to build at night: up for it, drowsy, grumbling, then back to sleep (#279, 14)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'nightOrder', {})).toEqual({ sleptFirst: true, drowsy: true, said: true, built: true, backToSleep: true });
});

test('awake at night, hungry half as fast (#279, 16)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'nightHunger', {});
  expect(r.ratio).toBeCloseTo(0.5, 1);
});

test('an enemy tent left at night: the soldiers go and break it (#279, 17)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'nightTent', {});
  expect(r.tentsLeft).toBe(0);
});

test('settlers sleep at night when a permanent enemy camp exists', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'sleepWithCamp', {})).toEqual({ asleep: true });
});

test('enemy camp defenders rotate night watch and wake at dawn', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campGuardShifts', {});
  expect(r.guards).toBeGreaterThanOrEqual(2);
  expect(r.firstAwake.length).toBeGreaterThan(0);
  expect(r.secondAwake.length).toBeGreaterThan(0);
  expect(r.firstAwake.filter(id => r.secondAwake.includes(id))).toHaveLength(0);
  expect(r.awakeAtDawn).toBe(r.guards);
  expect(r.wokeForThreat).toBe(true);
});

test('a medic hurt with no one else to heal heals itself (#279, 21)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'medicSelf', {});
  expect(r.hp).toBeGreaterThan(40);
});

test('at night a soldier on watch cooks at the fire (#279, 15)', async ({ page }) => {
  await openGame(page);
  expect((await sim(page, 'nightCook', {})).food).toBeGreaterThan(0);
});
