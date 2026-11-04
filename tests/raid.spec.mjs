import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

test('enemy camp is excluded from the colony and its guard maintains the fire', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'campInfrastructure', {});
  expect(r).toMatchObject({
    campExists: true,
    campBuildingsRed: true,
    onlyCampfire: true,
    noCampTents: true,
    oneKeeper: true,
    legacyCampCleaned: true,
    fireMaintained: true,
    keeperStaysByFire: true,
    zoneExcluded: true,
    storageExcluded: true,
    soldierPatrolRadiusStable: true,
    playerFuelUnchanged: true,
  });
  expect(errors).toEqual([]);
});

test('passive enemy camp guards do not keep settlers in wave behavior', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'campActivity', {});
  expect(r.guards).toBeGreaterThan(0);
  expect(r).toMatchObject({
    passiveWave: false,
    passiveTentAssault: false,
    raidWave: true,
    waveDetected: true
  });
  expect(errors).toEqual([]);
});

test('raiders enter the camp without changing or replacing the main world', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'intoCamp', {});
  expect(r.sent).toBe(true);
  expect(r.arrived).toBe(true);
  expect(r).toMatchObject({
    phase: 'fight',
    raidActive: true,
    sameWorld: true,
    timerHeld: true,
    opened: { guardsPassive: true, duplicateStayedSingle: true }
  });
  expect(r.party).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('defeating the camp garrison clears the camp and ends the raid successfully', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'raidOutcome', { win: true });
  expect(r.result).toMatchObject({ campExists: false });
  expect(r).toMatchObject({ ended: true, campDestroyed: true });
  expect(errors).toEqual([]);
});
