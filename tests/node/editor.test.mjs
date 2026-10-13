// editor: the game's logic, run in Node (moved from tests/editor.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a map made in the editor is saved and played in Endless as a custom map (#37)', async () => {
  expect(await sim.handMadeMap()).toEqual({
    empty: 0, saved: true, chosen: 'Пруд', size: [30, 30], hall: [540, 420],
    water: 8, pondHole: true, tree: true, apple: true, spawner: 'iron', coal: true,
    wall: 'wall_stone', boar: true, sand: true, cactus: true, border: true, settlers: 2
  });
});

test('a generated map saved from the editor loads back exactly (#37)', async () => {
  const r = await sim.generatedRoundTrip();
  expect(r.same).toBe(true);
  expect(r.things).toBeGreaterThan(100);
});

test('the same tool again clears the tile; another thing replaces it (#143)', async () => {
  expect(await sim.toggleClear()).toEqual({ treeCleared: true, replaced: true, sandCleared: true, pondCleared: true });
});

test('rows and columns can be added and taken away at any edge (#143)', async () => {
  const r = await sim.resize();
  expect(r.after).toEqual({ size: [31, 30], tree: [6, 4], hallMoved: [30, -30] });
  expect(r.treeGone).toBe(true);
  expect(r.minCols).toBe(20);
  expect(r.refused).toBe(true);
});
