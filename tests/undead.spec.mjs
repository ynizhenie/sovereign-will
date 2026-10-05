import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('the undead: zombies only to hire, the staff, no farming or food, blight; graves add 1 and make bones and rot (#164)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'undeadColony');
  expect(r.startUnits).toEqual(['zombie', 'zombie']);
  expect(r.hire).toEqual(['btn-hire-zombie', 'btn-hire-big_zombie', 'btn-upgrade']);
  expect(r.tools).toContain('btn-necro_staff');
  expect(r.tools).not.toContain('btn-hoe');
  expect(r.tools).not.toContain('btn-medbag');
  expect(r.gear).not.toContain('btn-wateringCan');
  expect(r.build).not.toContain('btn-campfire');
  expect(r).toMatchObject({ farmingTab: false, blightTab: true, foodTile: false, food: 0, foodAfter: 0 });
  expect(r.maxPop).toBe(await page.evaluate(() => GAME_CONFIG.start.population) + 1);
  expect(r.bonesMade).toBe(3.5); // graveyard 0.25 + grave 0.1 a second, 10 s
  expect(r.rotMade).toBe(1);     // grave 0.1 a second
  expect(r).toMatchObject({ fromMeat: 3, fromBerries: 2 });
});

test('a zombie given a bow becomes a skeleton, and a zombie again without it (#164)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'bowMakesSkeleton')).toEqual({ withBow: { type: 'skeleton', weapon: 'bow' }, without: { type: 'zombie', weapon: 'fist' } });
});

test('a necromancer (the staff) raises 5 corpses as temporary zombies, recharges at a grave; they crumble into rot (#164)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'necromancerRaises')).toEqual({
    afterFirstRound: 5, recharged: true, raised: 7, corpsesLeft: 0, bigZombies: 1, popTaken: 0,
    crumbled: true, rotFromThem: 7, corpsesFromThem: 0
  });
});

test('a necromancer heals the wounded undead around it (#164)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'necromancerHeals')).toEqual({ healed: true });
});

test('blight: round the graveyard and graves, marked ground blighted by a necromancer; enemies slowed, corpses rise (#164)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'undeadBlight')).toEqual({
    hall: true, grave: true, away: false, goneWithGrave: true, marked: true, blighted: true, slowed: true, rose: true
  });
});

test('undead enemies: waves of theirs; their necromancer raises temporary zombies too (#175)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'undeadEnemies');
  expect(r.kinds.every(k => k.startsWith('undead_'))).toBe(true);
  expect(r).toMatchObject({ zombies: 1, corpses: 0, temporary: true });
});
