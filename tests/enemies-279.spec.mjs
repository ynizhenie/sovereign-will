import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's batch of fixes (#279), part B: the raid, the cards, the enemies
test('a wave gathers where it came in before it attacks, and a big one has a commander giving orders (#279, 44, 45)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveMusters', {});
  expect(r.size).toBeGreaterThanOrEqual(6);
  expect(r.early).toBeLessThan(5 * 30); // (gathering by the edge, a tile and a half past the red band)
  expect(r.later).toBeGreaterThan(150); // (then off)
  expect(r.captain).toBe(true);
  expect(r.ordered).toBeGreaterThan(0);
});

test('scouts between waves walk the red band, aren\'t enemies; pointed at, one is hunted and runs off (#279, 23)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'scoutsBetweenWaves', {});
  expect(r).toEqual({ count: 1, inBand: true, notEnemy: true, hunted: true, stays: true, goneOff: true });
});

test('the physical camp stays on the main map as the party arrives (#279, 34, 37)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campLayouts', {});
  expect(['square', 'round', 'scattered', 'fort']).toContain(r.layout);
  expect(r).toMatchObject({ same: true, arrived: true, onMainMap: true, sameCamp: true });
  expect(r.walls).toBeGreaterThan(0);
});

test('the camp stays on dry ground and outside the initial territory on a larger map', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campSitePlacement', {});
  expect(r.placed).toBe(true);
  expect(r.waterInArea).toBe(0);
  expect(r.separationTiles).toBeGreaterThanOrEqual(8);
});

test('a prepared wave stages at the map edge when the default territory fills the map', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveStagesAtCamp', {});
  expect(r.count).toBeGreaterThan(0);
  expect(r.prepared).toBe(true);
  expect(r.edge).toBeGreaterThanOrEqual(44);
  expect(r.edge).toBeLessThanOrEqual(46);
  expect(r.fartherFromHall).toBe(true);
  expect(r.inTerritory).toBe(true); // no outside tile exists on this map size
});

test('sending a raid pauses the prepared wave march and its timer', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'waveMarchPausesDuringRaid', {})).toEqual({ prepared: true, paused: true, timerHeld: true, returned: true });
});

test('camp defenders ignore settlers who stay at home', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campDefendersIgnoreColony', {});
  expect(r).toMatchObject({ guarded: true, unchanged: true });
  expect(r.humanoids).toBeGreaterThan(0);
});

test('camp defenders attack settlers who approach the camp even before a raid starts', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'campDefendersAttackIntruders', {})).toEqual({
    defenderFound: true, attacked: true, leftPost: true
  });
});

test('the outpost and town hall block movement while remaining accessible to attacks and storage', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'campOutpostAndTownHallAccess', {})).toEqual({
    found: true, hallBlocked: true, outpostBlocked: true, hallEdgeClear: true, outpostEdgeClear: true,
    hallApproachClear: true, outpostAttackable: true
  });
});

test('offscreen enemy camps simulate resources without moving their residents', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'offscreenCampUsesNumbersOnly', {})).toEqual({
    found: true, offscreen: true, stayed: true, numbersSimulated: true
  });
});

test('camp residents cook, eat, talk and do not damage their own walls', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'campLifeAndOwnBuildings', {})).toEqual({
    campFound: true, cooked: true, ate: true, talked: true, lit: true, meatHeldWhileCooking: true,
    rawMeatInfinite: true, firewoodInfinite: true, noSupplyDrops: true, wallSafe: true
  });
});

test('camp residents can reach their fires and wild boars do not spawn within the camp walls', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campCookingAndWildlife', {});
  expect(r, JSON.stringify(r)).toMatchObject({
    campFound: true, accessibleFires: true, cooked: true, interiorSpawnBlocked: true, boarsOutside: true
  });
});

test('camp tents summon reinforcements only during a raid', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campTentSummonsOnlyDuringRaid', {});
  expect(r).toMatchObject({ campFound: true, outside: 0, markedDefenders: true });
  expect(r.inside).toBeGreaterThan(0);
});

test('camp pets appear when the player owns the corresponding pet', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campPetsFollowPlayerOwnership', {});
  expect(r.before).toBe(0);
  expect(r.after).toBeGreaterThan(0);
});

test('camp defenders unlock alongside the player roster', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campEnemyKindsFollowPlayerProgress', {});
  expect(r).toEqual({
    campFound: true,
    before: { brute: false, archer: false, medic: false },
    after: { brute: true, archer: true, medic: true }
  });
});

test('wave pets appear when the player owns the corresponding pet', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'wavePetsFollowPlayerOwnership', {});
  expect(r.withoutPet).toBe(0);
  expect(r.withPet).toBeGreaterThan(0);
});

test('wave archers appear only after the player has a bow', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveArchersFollowPlayerBow', {});
  expect(r.withoutBow).toBe(0);
  expect(r.withBowInArmory).toBeGreaterThan(0);
  expect(r.withBowEquipped).toBeGreaterThan(0);
});

test('each enemy faction starts with its basic roster and unlocks other kinds from player progress', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'enemyRostersFollowPlayerProgress', {});
  expect(r.base.humans).toEqual(['raider', 'raider_club']);
  expect(r.base.demons).toEqual(['demon_imp', 'demon_imp_sword']);
  expect(r.base.undead).toEqual(['undead_necromancer', 'undead_zombie', 'undead_zombie_sword']);
  expect(r.unlocked.humans).toEqual(['brute', 'raider', 'raider_archer', 'raider_club', 'raider_dog', 'raider_medic']);
  expect(r.unlocked.demons).toEqual(['demon_beast', 'demon_brute', 'demon_imp', 'demon_imp_archer', 'demon_imp_sword']);
  expect(r.unlocked.undead).toEqual(['undead_big_zombie', 'undead_ghost', 'undead_necromancer', 'undead_zombie', 'undead_zombie_archer', 'undead_zombie_sword']);
});

test('a human dog unlocks undead ghosts and demon beasts in waves and camps', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'playerPetUnlocksOtherFactions', {})).toEqual({
    undead: { wavePet: true, campPet: true },
    demons: { wavePet: true, campPet: true }
  });
});

test('wave enemies can wear leather armour from the first wave once the player owns it', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveGearFollowsPlayerOwnership', {});
  expect(r.withoutGear).toBe(0);
  expect(r.withGear).toBeGreaterThan(0);
});

test('wave shields, armour and commanders require the player to own the corresponding gear', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveShieldArmorAndBannerFollowPlayerGear', {});
  expect(r.without).toEqual({ armor: false, shield: false, banner: false });
  expect(r.withArmorAndShield).toEqual({ armor: true, shield: true, banner: false });
  expect(r.withBanner).toBe(true);
});

test('a camp ghost remains at its post and does not attack the colony outside a raid', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'campGhostDoesNotAttackColony', {})).toEqual({
    hpUnchanged: true, heldAtPost: true, raidInactive: true
  });
});

test('an inactive camp does not start battle music or accept attack orders', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'inactiveCampIsNotCombat', {})).toEqual({
    battleMusic: false, defenderMarked: false, outpostMarked: false
  });
});

test('a scout sent to the camp looks it over and comes home; the camp stays (#279, 33)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'scoutTheCamp', {});
  expect(r).toMatchObject({ sent: true, looked: true, cols: 40, campStays: true, phase: null });
  expect(errors).toEqual([]);
});

test('the camp\'s bar sits over the bottom panel (#279, 32)', async ({ page }) => {
  await openGame(page);
  await sim(page, 'campOpens', {});
  expect(await page.evaluate(() => document.getElementById('raid-bar').parentElement.id)).toBe('hud-bottom');
  await expect(page.locator('#raid-bar [data-raid-act="scout"]')).toBeVisible();
});
