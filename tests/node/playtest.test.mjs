// The playtest's mechanics (2026-10-09), run in Node: cooking, healing under attack, campfires, storages,
// spikes, facing. See tests/node/game.mjs for how the game runs without a browser.
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('with no food left, workers holding tools cook the raw food too (playtest: food 0, raw meat piling up)', () => {
  const r = sim.cookingWithTools({});
  expect(r.cooked).toBe(true);
  expect(r.food).toBeGreaterThan(0);
  expect(r.rawMeat).toBeLessThan(20);
  expect(r.tools).toEqual(['hoe', 'pickaxe', 'none']); // they keep their tools
});

test('...and do so in a wave too, when the food has run out', () => {
  const r = sim.cookingWithTools({ seed: 'cook-tools-wave', wave: true });
  expect(r.food).toBeGreaterThan(0);
});

test('...and keep cooking past a few meals, up to enough to hire with (playtest: food stuck at 3, 90 raw)', () => {
  const r = sim.cookingWithTools({ seed: 'cook-tools-hire', food: 12 });
  expect(r.cooked).toBe(true);
  expect(r.food).toBeGreaterThan(15);
});

test('with food to spare, workers holding tools stay at their own work', () => {
  const r = sim.cookingWithTools({ seed: 'cook-tools-fed', food: 100, seconds: 20 });
  expect(r.cooked).toBe(false);
});

test('a badly hurt settler healing at a tent turns on an enemy hitting it there, not stand and die (playtest)', () => {
  const r = sim.healUnderAttack({});
  expect(r.mostly).not.toBe('healAtTent');
  expect(r.enemyHurt).toBe(true);
});

test('a campfire in front of the base: nobody ends up standing inside it (playtest: settlers stuck in the fire)', () => {
  const r = sim.campfireInFront({});
  expect(r.longestInsideSeconds).toBeLessThan(2);
  expect(r.food).toBeGreaterThan(0); // and the cooking still gets done
});

test('a settler caught inside an obstacle walks out of it to where it is going', () => {
  const r = sim.walksOutOfObstacle({});
  expect(r.reached).toBe(true);
});

test('a settler carrying a load to a storage keeps to the one it chose, not turn between the hall and a warehouse (playtest jitter)', () => {
  const r = sim.deliveryJitter({});
  expect(r.stuck).toBe(0);
});

test('spikes against the hall: settlers carrying wood home do not step on them (playtest: settlers killed by their own spikes)', () => {
  const r = sim.ownSpikesAtHall({});
  expect(r.wood).toBeGreaterThan(0); // they did carry wood home
  expect(r.hurt).toBe(0);
});

test('a walking settler turns its weapon the way it walks, not keep it where it last struck (playtest: a weapon stuck in one pose)', () => {
  const r = sim.facingWhileWalking({});
  expect(r.pointsEastShare).toBeGreaterThan(0.8);
});
