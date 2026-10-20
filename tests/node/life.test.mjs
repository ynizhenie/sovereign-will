// #248 (part four): meals, paths, commanders: the game's logic, run in Node
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a hungry settler walks to the town hall and eats there; in a wave the meal waits (#248)', () => {
  expect(sim.eatAtStorage({})).toEqual({ ate: true, atHall: true, food: 9, stillWants: false });
  expect(sim.eatAtStorage({ wave: true })).toEqual({ ate: false, atHall: false, food: 10, stillWants: true });
});

test('ground walked over and over in the base wears into a path, never out of it; left be, it fades (#248)', () => {
  expect(sim.pathsWear({})).toEqual({ worn: true, outWorn: false, faded: true });
});

test('a foreman tells a worker what\'s needed most: short of stone, it swaps its axe for the stored pickaxe and goes for stone; the order shows (#248)', () => {
  expect(sim.foreman({})).toEqual({ focus: 'stone', tool: 'pickaxe', axeStored: 1, bubble: true });
});

test('a captain gives its soldiers enemies to go for in a wave, each its own, the nearest the town hall first (#248)', () => {
  expect(sim.captain({})).toEqual({ given: true, different: true, nearest: true });
});
