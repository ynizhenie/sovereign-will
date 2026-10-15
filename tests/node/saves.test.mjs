// saves: the game's logic, run in Node (moved from tests/saves.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a saved game loads back exactly, pointers between things included, and goes on the same way (#156)', async () => {
  expect(await sim.saveRoundTrip()).toEqual({ same: true, pointers: true, sameAfterwards: true });
});

test('the soldiers\' stance and the reserves are saved with the game (#212)', () => {
  const r = (() => {
    window.sim.start('save-stance');
    game.stance = 'attack'; game.reserves = { wood: 15 };
    const saved = JSON.parse(JSON.stringify(serializeGame()));
    game.stance = 'defend'; game.reserves = {};
    loadGame(saved);
    return { stance: game.stance, reserves: game.reserves };
  })();
  expect(r).toEqual({ stance: 'attack', reserves: { wood: 15 } });
});

test('the work priorities are saved with the game (#212)', () => {
  const r = (() => {
    window.sim.start('save-jobs');
    game.jobPriority = ['gather', 'build', 'supply', 'repair', 'cook'];
    const saved = JSON.parse(JSON.stringify(serializeGame()));
    game.jobPriority = null;
    loadGame(saved);
    return game.jobPriority;
  })();
  expect(r).toEqual(['gather', 'build', 'supply', 'repair', 'cook']);
});
