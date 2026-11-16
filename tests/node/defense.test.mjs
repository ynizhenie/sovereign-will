// defense: the game's logic, run in Node (moved from tests/defense.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('workers keep working during 30-second wave preparation and defense deploys at 15 seconds', async () => {
  expect(await sim.preWaveWorkTiming({})).toEqual({
    workersStillWorking: true, waveInactive: true, alertAtFifteen: true, deploySeconds: 15
  });
});

test('ahead of a wave soldiers form squads at posts: the door first, all within the base (#14)', async () => {
  expect(await sim.deployment({})).toEqual({ squads: 3, firstPostByDoor: true, postsWithinBase: true, allAtPosts: true });
});

test('a distant building does not make soldiers attack enemies still preparing for a wave', async () => {
  expect(await sim.holdsPostDuringPreparation({})).toEqual({
    enemyUntouched: true,
    holdingPost: true
  });
});

test('a distant building does not make enemies outside the directional base count as threats', async () => {
  expect(await sim.holdsPostAgainstEnemyOutsideDirectionalBase({})).toEqual({
    withinOldCircularRadius: true,
    outsideDirectionalBase: true,
    enemyUntouched: true,
    holdingPost: true
  });
});

test('workers defend the town hall from a wave enemy that gets close during the march', async () => {
  expect(await sim.workersDefendTownHallFromWave({})).toEqual({ enemyHurt: true });
});

test('workers stay sheltered while a wave enemy remains inside the base', async () => {
  expect(await sim.workersStayShelteredFromWaveThreat({})).toEqual({
    staysByHall: true,
    wasHit: true,
    enemyUntouched: true
  });
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
