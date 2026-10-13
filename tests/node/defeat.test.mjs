// defeat: the game's logic, run in Node (moved from tests/defeat.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('after a defeat the game stops: no more waves counted on the defeat screen (#169)', async () => {
  const r = await (() => {
    window.sim.start('defeat-stop');
    settlers.forEach(s => { s.hp = 0; });
    stepGame(1 / 60); // the last settler dies
    const waves = waveNum;
    waveTimer = 0.01;
    for (let f = 0; f < 600; f++) stepGame(1 / 60); // as the game loop runs it
    return { over: isDefeated(), wavesBefore: waves, wavesAfter: waveNum };
  })();
  expect(r.over).toBe(true);
  expect(r.wavesAfter).toBe(r.wavesBefore);
});
