// spikes: the game's logic, run in Node (moved from tests/spikes.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('spikes hurt once per visit and break after 5 visits (#32)', async () => {
  const r = await sim.spikeVisits({});
  // [damage taken so far, uses left] after each move
  expect(r.log.slice(0, 4)).toEqual([[25, 4], [25, 4], [25, 4], [50, 3]]);
  expect(r.log.at(-1)).toEqual([125, 0]);
  expect(r.trapGone).toBe(true);
});

test('settlers walk around spikes (#32)', async () => {
  expect(await sim.settlerAvoidsSpikes({})).toEqual({ found: true, overSpikes: false });
});

test('with no safe way in, raiders cross the spikes instead of breaking walls (#32)', async () => {
  const r = await sim.spikeGap({});
  expect(r.spikeSteps).toBeGreaterThan(0);
  expect(r.wallsBroken).toBe(0);
});
