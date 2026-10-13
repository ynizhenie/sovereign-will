// gear: the game's logic, run in Node (moved from tests/gear.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('disarming the weapon keeps armour; Take off armour hands it back at the town hall (#94)', async () => {
  expect(await sim.armorOff({})).toEqual({
    afterDisarm: { armor: 'iron', maxHp: 150 }, armor: null, maxHp: 100, ironBack: 8
  });
});
