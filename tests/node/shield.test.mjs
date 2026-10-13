// shield: the game's logic, run in Node (moved from tests/shield.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a shield cuts the damage a melee soldier takes, on top of armour (#27)', async () => {
  const taken = await (() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('shield-test');
    const hit = extra => { const s = makeSettler(1, 0, 0, { weapon: 'sword', role: 'soldier', ...extra }); damageSettler(s, 40); return 100 - s.hp; };
    return {
      plain: hit({}), shield: hit({ shield: true }), armor: hit({ armor: 'iron' }), both: hit({ armor: 'iron', shield: true }),
      archer: hit({ weapon: 'bow', role: 'archer', shield: true }), worker: hit({ weapon: 'fist', role: 'worker', shield: true })
    };
  })();
  expect(taken.plain).toBe(40);
  expect(taken.shield).toBe(30); // 25% off
  expect(taken.armor).toBeCloseTo(26); // armour alone: 35% off
  expect(taken.both).toBeCloseTo(19.5);
  expect(taken.archer).toBe(40); // no use with a bow
  expect(taken.worker).toBe(40);
});
