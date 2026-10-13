// speed-fps: the game's logic, run in Node (moved from tests/speed-fps.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('everyone moves at twice the base speed per step, the pace the game was tuned at (#123)', async () => {
  const r = await (() => {
    const { makeSettler, clearResources } = window.sim.helpers;
    window.sim.start('speed-test');
    clearResources();
    const s = makeSettler(1, townHall.x + 100, townHall.y + 100);
    const x0 = s.x, y0 = s.y;
    moveEntityTowards(s, s.x + 30, s.y, s.speed);
    return { scale: GAME_CONFIG.movementScale, stepped: Math.round(Math.hypot(s.x - x0, s.y - y0) * 100) / 100 };
  })();
  expect(r.scale).toBe(2);
  expect(r.stepped).toBeCloseTo(2, 1); // speed 1 x scale 2 per step
});
