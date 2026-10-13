// followups: the game's logic, run in Node (moved from tests/followups.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('blight: as far on every side of the graveyard; a tap again unmarks; no mark on blighted ground; taking it away fades (#186)', async () => {
  const r = await sim.blightZonesFollowup({});
  expect(r).toEqual({
    reach: { left: true, right: true, up: true, down: true },
    refused: true, marked: true, unmarked: true, stillAfter1s: true, goneLater: true
  });
});
