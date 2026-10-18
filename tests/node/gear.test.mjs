// gear: the game's logic, run in Node (moved from tests/gear.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('disarming the weapon keeps armour; Take off armour hands it back at the town hall (#94)', async () => {
  expect(await sim.armorOff({})).toEqual({
    afterDisarm: { armor: 'iron', maxHp: 150 }, armor: null, maxHp: 100, ironBack: 8
  });
});

test('a fallen enemy drops loot; a worker picks it up, the sword goes into the armory and a sword is made from it (#210)', async () => {
  expect(await sim.lootToArmory()).toEqual({ dropped: true, picked: true, stored: 1, usedArmory: true, going: 'sword' });
});

test('things are made: an axe at a workshop (none without one) by a worker, into the store, then handed out; iron only with a smithy, and made there (#211, #248)', async () => {
  expect(await sim.crafting()).toEqual({ ordered: true, crafting: true, axe: true, noSmithy: true, atSmithy: true, sword: true });
});

test('things without iron are made quicker at a workshop (2 s for an axe) than iron ones at the smithy (6 s); the materials are carried in hands (#232)', async () => {
  expect(await sim.craftTimes()).toEqual({ axe: { seconds: 2, inHands: true, drawnMaking: true }, sword: { seconds: 6, inHands: true, drawnMaking: true } });
});
