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

test('unarmed villagers defend against camp-linked wave enemies when there are no soldiers', async () => {
  expect(await sim.unarmedDefend({})).toEqual({ enemyHurt: true, workerMoved: true });
});

test('wave enemies linked to a camp do not trigger an automatic tent assault', () => {
  expect(sim.noTentAssaultDuringCampLinkedWave({})).toEqual({ tentAssault: false });
});

test('the pre-wave defense warning does not trigger an automatic tent assault', () => {
  expect(sim.noTentAssaultDuringPreWaveWarning({})).toEqual({ defenseAlert: true, tentAssault: false });
});

test('soldiers hold position while a wave enemy is regrouping outside the base', () => {
  expect(sim.waitsForRegroupedWave({})).toEqual({ insideBase: true, acted: false, moved: false });
});

test('soldiers ignore regrouping enemies from every faction, including assigned targets', () => {
  expect(sim.holdsDuringFactionWaveMuster()).toEqual([
    { faction: 'humans', regrouping: true, heldAtPost: true, acted: false, moved: false, assignedTargetsCleared: true },
    { faction: 'demons', regrouping: true, heldAtPost: true, acted: false, moved: false, assignedTargetsCleared: true },
    { faction: 'undead', regrouping: true, heldAtPost: true, acted: false, moved: false, assignedTargetsCleared: true }
  ]);
});

test('a soldier can get close enough to attack an enemy outpost', async () => {
  expect(await sim.assaultOutpost({})).toMatchObject({ damaged: true });
});

test('a soldier attacks an enemy outpost that blocks its route to an enemy', async () => {
  expect(await sim.attackOutpostInTheWay({})).toEqual({ damaged: true });
});

test('a soldier attacks a hostile battle wall that blocks its route to an enemy', async () => {
  expect(await sim.attackBattleBuildingInTheWay({})).toEqual({ damaged: true });
});

test('an archer shoots a hostile battle wall that blocks its route to an enemy', async () => {
  expect(await sim.attackBattleBuildingInTheWay({ weapon: 'bow' })).toEqual({ damaged: true });
});

test('an enemy breaks a wall directly in its route instead of walking around it', async () => {
  expect(await sim.enemyBreaksWallOnTheWay({})).toEqual({ damaged: true });
});

test('an enemy walks around a tree on its way to the town hall', async () => {
  expect(await sim.enemyRoutesAroundTree({})).toEqual({ damagedHall: true, treeUntouched: true });
});

test('an enemy can strike the town hall from a reachable diagonal approach', async () => {
  expect(await sim.enemyHitsHallCorner({})).toEqual({ damaged: true });
});

test('an enemy spawned inside a tree gets free and reaches the town hall', async () => {
  expect(await sim.enemyEscapesTree({})).toEqual({ leftTree: true, damagedHall: true });
});
