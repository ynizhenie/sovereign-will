// apples: the game's logic, run in Node (moved from tests/apples.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('ripe apples are picked by a worker with no tool; the woodcutter leaves the apple tree (#34)', async () => {
  expect(await sim.appleOrchard({ mark: 'none' }))
    .toEqual({ appleTreeStands: true, plainTreeStands: false, picked: true, foodUp: true });
});

test('an apple tree marked with no apples on it is felled; marked with apples, they get picked (#34)', async () => {
  const bare = await sim.appleOrchard({ mark: 'bare', ripe: false });
  expect(bare.appleTreeStands).toBe(false);
  const ripe = await sim.appleOrchard({ mark: 'ripe' });
  expect(ripe).toMatchObject({ appleTreeStands: true, picked: true });
});

test('apple saplings are carried in the same load as picked apples', async () => {
  const r = await sim.appleSaplingCargo({});
  expect(r.carried).toBeGreaterThan(160);
  expect(r.carried).toBeLessThan(240);
  expect(r.inStock).toBe(0);
});

test('generated maps have a few apple trees, the same ones for the same seed (#34)', async () => {
  const seeds = ['maze-283', 'maze-137', 'shot', 'apples-a', 'apples-b'];
  const first = await sim.appleShare({ seeds });
  const again = await sim.appleShare({ seeds });
  expect(again.map(m => m.keys)).toEqual(first.map(m => m.keys));
  const apple = first.reduce((n, m) => n + m.apple, 0), grown = first.reduce((n, m) => n + m.grown, 0);
  expect(apple).toBeGreaterThan(0);
  expect(apple / grown).toBeGreaterThan(0.04);
  expect(apple / grown).toBeLessThan(0.2);
});
