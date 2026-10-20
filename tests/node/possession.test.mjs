// possession: the game's logic, run in Node (moved from tests/possession.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a possessed settler does nothing by itself: no work, no healing, no hitting back (#16)', async () => {
  expect(await sim.possessAiOff()).toEqual({ moved: false, gathered: false, hitBack: false });
});

test('tapping a tree sends a possessed woodcutter to chop it, tapping the hall hands the wood in (#16)', async () => {
  const r = await sim.possessChopAndDeliver();
  expect(r.ordered).toBe(true);
  expect(r.treeGone).toBe(true);
  expect(r.carried).toEqual({ type: 'wood', amount: 2 }); // (#298: a piece of the cut-up tree)
  expect(r.handedIn).toBe(2);
});

test('without the right tool a tapped resource is refused (#16)', async () => {
  const r = await sim.possessChopAndDeliver({ tool: 'pickaxe' });
  expect(r.ordered).toBe(false);
  expect(r.treeGone).toBe(false);
  expect(r.notes).toContain('[[no]] Нужен топор');
});

test('tapping an enemy sends the possessed soldier to fight it to the end (#16)', async () => {
  expect(await sim.possessAttack()).toEqual({ enemyDead: true, orderDone: true });
});

test('tapping a blueprint sends the possessed worker to build it (#16)', async () => {
  expect(await sim.possessBuild()).toEqual({ built: true, orderDone: true });
});
