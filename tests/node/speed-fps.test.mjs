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

test('a frame-rate cap gives that many frames on any screen: 60 on 75, 90, 144 and 165 Hz too (#197)', async () => {
  const r = (() => {
    const drawnPerSecond = (hz, cap) => {
      loop.frameRate = cap; loop.lastDrawn = 0;
      let drawn = 0;
      for (let i = 1; i <= hz * 10; i++) if (frameDue(1000 + i * 1000 / hz + ((i * 7919) % 13 - 6) / 8)) drawn++;
      return Math.round(drawn / 10);
    };
    const out = Object.fromEntries([[60, 60], [75, 60], [90, 60], [144, 60], [165, 60], [144, 30], [60, 30]].map(([hz, cap]) => [`${hz}/${cap}`, drawnPerSecond(hz, cap)]));
    loop.frameRate = 'display';
    out.display = [1, 2, 3].every(i => frameDue(i));
    return out;
  })();
  expect(r).toEqual({ '60/60': 60, '75/60': 60, '90/60': 60, '144/60': 60, '165/60': 60, '144/30': 30, '60/30': 30, display: true });
});
