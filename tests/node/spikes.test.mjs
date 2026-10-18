// spikes: the game's logic, run in Node (moved from tests/spikes.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('spikes: a full blow and a use worn per step onto them, a little all the while one stands on them; worn out they stay, harmless, to be repaired (#32, #232, #248)', async () => {
  const r = await sim.spikeVisits({});
  // [damage taken so far, uses left] after each move
  const [first, stood, away, second] = r.log;
  expect(first[1]).toBe(4);
  expect(stood[1]).toBe(4); // standing wears nothing
  expect(stood[0]).toBeGreaterThan(first[0]); // but it hurts
  expect(away[0]).toBe(stood[0]);
  expect(second[1]).toBe(3);
  expect(second[0] - away[0]).toBeGreaterThanOrEqual(25);
  expect(r.log.at(-1)[1]).toBe(0);
  expect(r.usedUp).toEqual({ stays: true, usesLeft: 0, hp: 0 });
  expect(r.harmless).toBe(true);
  expect(r.repaired).toBe(true);
});

test('settlers walk around spikes (#32)', async () => {
  expect(await sim.settlerAvoidsSpikes({})).toEqual({ found: true, overSpikes: false });
});

test('with no safe way in, raiders cross the spikes instead of breaking walls (#32)', async () => {
  const r = await sim.spikeGap({});
  expect(r.spikeSteps).toBeGreaterThan(0);
  expect(r.wallsBroken).toBe(0);
});
