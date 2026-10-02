import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('the undead: zombies to start, their own units and graves, no food, bones made by themselves (#43)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'undeadColony');
  expect(r.startUnits).toEqual(['zombie', 'zombie']);
  expect(r.hire).toEqual(['btn-hire-zombie', 'btn-hire-big_zombie', 'btn-hire-skeleton', 'btn-hire-necromancer', 'btn-upgrade']);
  expect(r).toMatchObject({ tent: false, grave: true, ateMeals: false, skeleton: { weapon: 'bow', role: 'archer', arrows: true } });
  expect(r.bonesMade).toBe(15); // the graveyard: 0.25 a second
});

test('a necromancer raises 5 corpses, a big one into a big zombie, then gets its raises back at a grave (#43)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'necromancerRaises')).toEqual({ afterFirstRound: 5, recharged: true, raised: 7, corpsesLeft: 0, bigZombies: 1 });
});

test('a necromancer heals the wounded undead around it (#43)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'necromancerHeals')).toEqual({ healed: true });
});

test('undead enemies: waves of theirs, and their necromancer raises the dead (#43)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'undeadEnemies');
  expect(r.kinds.every(k => k.startsWith('undead_'))).toBe(true);
  expect(r).toMatchObject({ zombies: 1, corpses: 0 });
});
