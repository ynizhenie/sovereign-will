// undead: the game's logic, run in Node (moved from tests/undead.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a zombie given a bow becomes a skeleton, and a zombie again without it (#164)', async () => {
  expect(await sim.bowMakesSkeleton()).toEqual({ withBow: { type: 'skeleton', weapon: 'bow' }, without: { type: 'zombie', weapon: 'fist' } });
});

test('a necromancer (the staff) raises 5 corpses as temporary zombies, recharges at a grave; they crumble into rot (#164)', async () => {
  expect(await sim.necromancerRaises()).toEqual({
    afterFirstRound: 5, recharged: true, raised: 7, corpsesLeft: 0, bigZombies: 1, popTaken: 0,
    crumbled: true, rotFromThem: 7, corpsesFromThem: 0
  });
});

test('a necromancer heals the wounded undead around it (#164)', async () => {
  expect(await sim.necromancerHeals()).toEqual({ healed: true });
});

test('blight: round the graveyard and graves, marked ground blighted by a necromancer; enemies slowed, corpses rise (#164)', async () => {
  expect(await sim.undeadBlight()).toEqual({
    hall: true, grave: true, away: false, goneWithGrave: true, marked: true, blighted: true, slowed: true, rose: true
  });
});

test('undead enemies: waves of theirs; their necromancer raises temporary zombies too (#175)', async () => {
  const r = await sim.undeadEnemies();
  expect(r.kinds.every(k => k.startsWith('undead_'))).toBe(true);
  expect(r).toMatchObject({ zombies: 1, corpses: 0, temporary: true });
});
