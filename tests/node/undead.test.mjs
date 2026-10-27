// undead: the game's logic, run in Node (moved from tests/undead.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a zombie given a bow stays a zombie, an archer (#164, #249: no skeletons)', async () => {
  expect(await sim.bowMakesSkeleton()).toEqual({ withBow: { type: 'zombie', weapon: 'bow' }, without: { type: 'zombie', weapon: 'fist' } });
});

test('a necromancer (the staff) holds three raised corpses at most, recharges at a grave, raises three more when those crumble; they take no room, crumble into a little rot and bones on the ground (#164, #253, #326)', async () => {
  expect(await sim.necromancerRaises()).toEqual({
    afterFirstRound: 3, recharged: true, held: 3, corpsesKept: 4, ownedBy: true, raised: 3, corpsesLeft: 0, bigZombies: 0, popTaken: 0,
    crumbled: true, leftOnGround: { piles: 3, rot: 3, bones: 3 }, corpsesFromThem: 0
  });
});

test('a necromancer\'s zombies: armed with what lay by the corpse, kept by it, sent at an enemy, three at most (#326)', async () => {
  expect(await sim.necromancerControl()).toEqual({
    armed: ['iron_sword', 'iron', 'soldier', true], lootLeft: ['weapons:sword'], keepsBy: true, sent: true, held: 3, corpseKept: 1
  });
});

test('souls: a soul lantern takes one for each zombie raised and lets them out by a grave, none stored; a ghost costs a soul, needs a grave, takes no room, is limited, never panics (#326)', async () => {
  expect(await sim.soulsAndGhosts()).toEqual({
    noGrave: 0, noSoul: 0, hired: { ghosts: 1, souls: 9, popTaken: 0 }, limited: 4, moreWithAGrave: 5, noPanic: true,
    inLantern: [2, 0], farFromGrave: { stock: 0, kept: 2 }, byTheGrave: { stock: 2, kept: 0 }, notStored: true
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

test('the undead spend rot: a tile of blight, hiring a zombie; what\'s missing shows in whole pieces (#204)', async () => {
  expect(await sim.undeadRotSpent()).toEqual({
    waitedWithout: true, blighted: true, rotLeft: 4,
    hire: { bones: 8, rot: 3 },
    missing: '5[[bones]], 3[[rot]]'
  });
});

test('a necromancer raises a corpse from a few tiles off, without walking up to it (#203)', async () => {
  expect(await sim.undeadRaiseFromAfar()).toEqual({ raised: true, stayed: true, thread: true });
});
