import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

test('enemy camps have a central outpost, faction homes, and a fire keeper that refuels only when low', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'campInfrastructure', {});
  expect(r).toMatchObject({
    campExists: true,
    campBuildingsRed: true,
    campInfrastructurePresent: true,
    noCampWarehouse: true,
    campHomeType: 'tent',
    oneKeeper: true,
    legacyCampCleaned: true,
    outpostAtCenter: true,
    fireBesideOutpost: true,
    infiniteOutpostFuel: true,
    keeperWaitsUntilLow: true,
    fireMaintained: true,
    keeperStaysByFire: true,
    keeperAtPost: true,
    keeperNotCarryingFuel: true,
    zoneExcluded: true,
    storageExcluded: true,
    soldierPatrolRadiusStable: true,
    playerFuelUnchanged: true,
    initialGuardCount: 6,
    initialRosterIsTwoLevelsAhead: true,
    advancedPresetsAvailable: true,
  });
  expect(r.initialGuardTypeCount).toBeGreaterThan(1);
  expect(r.campHomes).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('enemy outposts have distinct human, undead, and demon artwork', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'campOutpostVisuals', {});
  expect(r.distinct).toBe(true);
  expect(new Set(r.signatures).size).toBe(3);
  expect(errors).toEqual([]);
});

test('enemy camps stay under fog until a scout approaches or a raid attacks', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'campFogVisibility', {});
  expect(r).toEqual({
    hiddenWithoutScout: true,
    revealedByNearbyScout: true,
    revealedByRaid: true,
    visibleWhenFogDisabled: true
  });
  expect(errors).toEqual([]);
});

test('enemy camp buildings do not reveal the surrounding map through fog', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'enemyCampStructuresDontRevealFog', {});
  expect(r).toEqual({ enemyCampTileUnexplored: true, edgeTileUnexplored: true });
  expect(errors).toEqual([]);
});

test('boars are removed from the camp and cannot respawn inside it', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'campBoars', {});
  expect(r).toEqual({ existingBoarRemoved: true, noBoarRespawnedInside: true });
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
    waitingOutside: true,
    guardsPassiveWhileWaiting: true,
    raidActive: true,
    noAutoButton: true,
    sameWorld: true,
    timerHeld: true,
    opened: { guardsPassive: true, duplicateStayedSingle: true }
  });
  expect(r.party).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('raiders can retreat from the perimeter without entering the camp', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'retreatFromStaging', {});
  expect(r).toMatchObject({ sent: true, arrived: true, outside: true, retreated: true, home: true, raidActive: false, returned: true });
  expect(errors).toEqual([]);
});

test('defeating the camp garrison clears the camp and ends the raid successfully', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'raidOutcome', { win: true });
  expect(r.result).toMatchObject({ campExists: false });
  expect(r).toMatchObject({ ended: true, campDestroyed: true });
  expect(errors).toEqual([]);
});

test('pets join a selected raid, and carried resources are returned before marching', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'raidPetAndCargo', {});
  expect(r).toEqual({
    sent: true, waitedToUnload: true, delivered: true, cargoReturned: true, petJoined: true, petMoved: true
  });
  expect(errors).toEqual([]);
});

test('a staging shelter is built by a non-pet, and its cost is paid only when the attack begins', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'stagingShelterPayment', {})).toEqual({
    sent: true, petDidNotBuild: true, builtBeforeAttack: true, costUnchangedBeforeAttack: true,
    costPaidOnAttack: true, attackStarted: true, shelterRemoved: true
  });
  expect(errors).toEqual([]);
});

test('raids can skip camp construction and supplies, and a scouting settler cannot be selected', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'raidWithoutCampAndScoutSelection', {})).toEqual({
    sent: true, noSuppliesTaken: true, noShelter: true, attackReady: true,
    attackStarted: true, noCostPaid: true, scoutSent: true, scoutCannotBeSelected: true,
    demonSent: true, demonNoPortals: true
  });
  expect(errors).toEqual([]);
});

test('every enemy camp draws its own dashed territory', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'allCampTerritories', {})).toEqual({ campCount: 2, redZones: 2 });
  expect(errors).toEqual([]);
});

test('auto-raiders can damage enemy camp structures', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'raidAutoDemolition', {})).toEqual({ structureDamaged: true });
  expect(errors).toEqual([]);
});

test('demon raids place a chosen exit portal and return through the portal pair', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'demonRaidPortalPlacement', {})).toEqual({
    sent: true, homePortalCreated: true, staged: true, exitPortalPlaced: true, entered: true,
    returnedThroughPortal: true, portalsCleaned: true
  });
  expect(errors).toEqual([]);
});

test('undead enemy camps have no campfires or fire keepers', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'undeadCampNoFire', {})).toEqual({ noCampfire: true, noFireKeeper: true });
  expect(errors).toEqual([]);
});

test('a camp sends a guard to drive off a scout, while the base continues working', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'scoutThreatAndBaseWork', {})).toEqual({
    targetAssigned: true, scoutFled: true, baseContinues: true
  });
  expect(errors).toEqual([]);
});

test('town hall raid and scout actions open their respective pickers', async ({ page }) => {
  const errors = await openGame(page);
  await sim(page, 'campOpens', {});
  await page.evaluate(() => openHallCard());

  await page.getByText('Отправить в набег', { exact: true }).click();
  await expect(page.locator('#raid-picker')).toContainText('Кто пойдёт в набег?');
  await page.locator('#raid-picker [data-raid="cancel"]').click();

  await page.getByText('Отправить разведчика', { exact: true }).click();
  await expect(page.locator('#raid-picker')).toContainText('Кто пойдёт на разведку?');
  expect(errors).toEqual([]);
});
