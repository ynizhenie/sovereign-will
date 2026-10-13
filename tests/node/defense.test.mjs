// defense: the game's logic, run in Node (moved from tests/defense.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('ahead of a wave soldiers form squads at posts: the door first, all within the base (#14)', async () => {
  expect(await sim.deployment({})).toEqual({ squads: 3, firstPostByDoor: true, postsWithinBase: true, allAtPosts: true });
});

test('a squad holds its post until an enemy comes within 6 tiles, then fights (#14)', async () => {
  expect(await sim.holdAndEngage({})).toEqual({ held: true, engaged: true });
});

test('ahead of a wave archers climb towers that have arrows (#14)', async () => {
  expect(await sim.archersManTowers({})).toEqual({ manned: true });
});

test('during a wave workers keep working, within the base (#14)', async () => {
  expect(await sim.workersStayClose({})).toEqual({ nearChopped: true, farStanding: true, withinBase: true });
});

test('a squad leaves its post for an enemy that got to a building, however far from the post (#131)', async () => {
  expect(await sim.baseBreach({})).toEqual({ farFromPost: true, wallStands: true, engaged: true });
});

test('ahead of a wave workers out far come back into the base and stay there (#131)', async () => {
  expect(await sim.workersComeBack({})).toEqual({ allInside: true, leftBase: false, applesLeft: true });
});
