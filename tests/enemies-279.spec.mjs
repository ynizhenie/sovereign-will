import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's batch of fixes (#279), part B: the raid, the cards, the enemies
test('a wave gathers where it came in before it attacks, and a big one has a commander giving orders (#279, 44, 45)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveMusters', {});
  expect(r.size).toBeGreaterThanOrEqual(6);
  expect(r.early).toBeGreaterThan(30); // staging at the outer edge of the enemy camp
  expect(r.later).toBeGreaterThan(150); // (then off)
  expect(r.captain).toBe(true);
  expect(r.ordered).toBeGreaterThan(0);
});

test('scouts between waves walk the red band, aren\'t enemies; pointed at, one is hunted and runs off (#279, 23)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'scoutsBetweenWaves', {});
  expect(r).toEqual({ count: 1, inBand: true, notEnemy: true, hunted: true, stays: true, goneOff: true });
});

test('one persistent enemy camp stays on the main map (#255)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campLayouts', {});
  expect(r).toMatchObject({ same: true, campExists: true, sameWorld: true, outpost: 1, campfires: 1 });
  expect(['square', 'broken', 'open', 'stone']).toContain(r.layout);
  expect(r.structureType).toBe('tent');
  expect(r.structureCount).toBeGreaterThanOrEqual(2);
  expect(r.homes).toHaveLength(r.structureCount);
  expect(r.homes.every(type => type === 'tent')).toBe(true);
  expect(r.guards).toBeGreaterThan(0);
});

test('preparation does not start the tent assault or enemy attacks; both begin with the wave', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'wavePreparationTiming', {});
  expect(r).toEqual({
    prepTentAssault: false,
    tentHeldFire: true,
    tentFiredAfterStart: true,
    enemyHeldFire: true,
    enemyAttackedAfterStart: true,
    tentAssaultAfterStart: true
  });
  expect(errors).toEqual([]);
});

test('wave enemies path around player territory while moving to their preparation positions', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'wavePreparationPathAvoidsPlayerTerritory', {})).toEqual({
    enteredPlayerZone: false, movedTowardTarget: true, stayedOutDuringPreparation: true
  });
  expect(errors).toEqual([]);
});

test('wave builders start their tent or grave near the rally when the wave begins', async ({ page }) => {
  const errors = await openGame(page);
  const results = await sim(page, 'waveBuilderStartsNearRally', {});
  expect(results).toHaveLength(4);
  for (const result of results) {
    expect(result.siteNearRally).toBe(true);
    expect(result.beganBuilding, JSON.stringify(result)).toBe(true);
    expect(result.siteRemainsOutsidePlayerZone).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('wave enemies spawn at their camp and stage outside both territories', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveMustersOutsideCamp', {});
  expect(r.count).toBeGreaterThan(0);
  expect(r.spawnAtCamp).toBe(true);
  expect(r.stagingOutsideCamp).toBe(true);
  expect(r.stagingOutsidePlayerBase).toBe(true);
  expect(r.preparationKeepsEnemiesOut).toBe(true);
});

test('wave enemies stage outside the player boundary on the camp-facing side before attacking', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'waveStagesAtPlayerBoundary', {});
  expect(r).toEqual({
    spawnedAtCamp: true,
    preparationStage: 'march',
    stagingAtBoundary: true,
    stagingOnCampSide: true,
    previousWaveUnaffected: true,
    buildersNearStaging: true,
    allHaveSafeRoutes: true,
    allTargetsOutsidePlayerZone: true,
    enteredPlayerZone: false
  });
  expect(errors).toEqual([]);
});

test('waves still spawn and stage when the interval is 30 seconds or less', async ({ page }) => {
  const errors = await openGame(page);
  const results = await sim(page, 'shortWaveIntervals', {});
  expect(results).toHaveLength(2);
  for (const result of results) {
    expect(result.spawnedBeforeStart).toBeGreaterThan(0);
    expect(result.waveStarted).toBe(true);
    expect(result.waveEnemiesRemain).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('wave builders construct and activate faction-specific spawners when the wave starts', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'waveStructuresSpawnUnits', {})).toEqual([
    { faction: 'humans', spawner: 'tent', expectedSpawner: 'tent', spawnedUnit: true },
    { faction: 'undead', spawner: 'grave', expectedSpawner: 'grave', spawnedUnit: true }
  ]);
  expect(errors).toEqual([]);
});

test('waves arrive by raft when no enemy camp exists', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'wavesArriveByRaftWithoutCamp', {});
  expect(r).toEqual({ noImmediateEnemies: true, raftUnits: 3, allWaveEnemies: true });
});

test('raft waves sail from beyond the map, land, leave, and stage outside the base on the arrival side', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'raftWavePreparation', {});
  expect(r).toMatchObject({
    raftsStartedOutside: true,
    raftsDeparting: true,
    raftsGone: true,
    preparationStage: 'march',
    stagedAtBoundary: true,
    stagedOnArrivalSide: true,
    safeLandingSlots: true,
    landedOnSafeTiles: true,
    movedTowardMuster: true,
    enteredPlayerZone: false
  });
  expect(r.landed).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a demon wave crosses from its camp portal to a persistent, hostile portal at the colony edge', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'demonCampWavePortals', {});
  expect(r).toEqual({
    preparedAtCamp: true, stayedAtCamp: true, exitAtColonyEdge: true,
    sourceRemoved: true, exitRemains: true, exitSpawnsUnits: true, soldierCanDamageExit: true,
    emerged: true, prepCleared: true
  });
  expect(errors).toEqual([]);
});

test('demons without an enemy camp do not prepare a portal wave before it starts', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'demonWaveWithoutCamp', {});
  expect(r).toEqual({
    noCampPreparation: true,
    waveStartsNormally: true,
    enemiesSpawnAfterStart: true,
    portalOpenedAfterStart: true
  });
  expect(errors).toEqual([]);
});

test('a wave tent blueprint appears only once its builder starts construction', async ({ page }) => {
  const errors = await openGame(page);
  expect(await sim(page, 'tentBlueprintAppearsOnArrival', {})).toEqual({
    hiddenUntilArrival: true, shownWhenBuilding: true, startedProgress: true
  });
  expect(errors).toEqual([]);
});

test('wave tent builders choose sites within three tiles of the player territory', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'waveTentSitesNearPlayerTerritory', {});
  expect(r.builders).toBeGreaterThan(0);
  expect(r).toMatchObject({
    allNearPlayerTerritory: true,
    allOutsidePlayerTerritory: true,
    allOutsideCamp: true
  });
  expect(errors).toEqual([]);
});

test('enemy camp guards use faction camp chatter instead of civilian idle chatter', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'enemyCampVoicePhrases', {});
  expect(r.camp.length).toBeGreaterThan(0);
  expect(r.camp).not.toContain('Работа есть?');
  expect(r.camp).not.toEqual(r.idle);
});

test('a scout sent from the town hall returns safely; the camp stays (#255)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'scoutTheCamp', {});
  expect(r).toMatchObject({
    sent: true, looked: true, outsideDuringLook: true, guardsPassiveBeforeThreat: true, guardChased: true, timerAdvanced: true,
    campStays: true, phase: null, raidActive: false
  });
  expect(errors).toEqual([]);
});

test('the town hall offers a raid and a scout for the persistent camp (#255)', async ({ page }) => {
  await openGame(page);
  await sim(page, 'campOpens', {});
  await page.evaluate(() => openHallCard());
  await expect(page.locator('#card-actions')).toContainText('Отправить в набег');
  await expect(page.locator('#card-actions')).toContainText('Отправить разведчика');
});
