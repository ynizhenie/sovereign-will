// soldiers: the game's logic, run in Node (moved from tests/soldiers.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('with fewer soldiers than two squads, each stands at a post of its own (#155)', async () => {
  expect(await sim.soldiersSingles()).toEqual({ posts: 4, slots: [0, 0, 0, 0] });
});

test('an enemy close to the base is gone for, however far from the posts (#155)', async () => {
  expect(await sim.soldiersNearBase()).toEqual({ farFromPosts: true, engaged: true });
});

test('archers climb a tower ahead of a wave with their own arrows, and stay up when enemies reach the hall (#155)', async () => {
  expect(await sim.soldiersTower()).toEqual({ up: true, stillUp: true, shotAt: true });
});

test('an enemy the player points at draws three soldiers, not all of them (#155)', async () => {
  expect(await sim.soldiersMarked()).toEqual({ goingForIt: 3 });
});

test('enemies break the wall in front of them rather than walk round to a far door, and walk over spikes (#155)', async () => {
  expect(await sim.soldiersWayIn({ ring: 'walls' })).toMatchObject({ throughWall: true, viaDoor: false });
  expect(await sim.soldiersWayIn({ ring: 'spikes' })).toMatchObject({ overSpikes: true });
});
