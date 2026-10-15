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

test('quotas: two axes wanted, three free workers: two get one by themselves (#210)', async () => {
  expect(await sim.quotaAxes()).toEqual({ withAxe: 2 });
});
