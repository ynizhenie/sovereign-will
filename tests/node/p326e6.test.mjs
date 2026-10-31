// (#326) firewood for every faction, a quick club, a wave's tents at the border of the player's land
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('firewood is every faction\'s: the undead order it in Craft (1 wood into 2) and their torch posts burn it; a club is quick to make (#326)', async () => {
  expect(await sim.firewoodForAll()).toEqual({
    forUndead: true, recipeListed: true, made: { firewood: 2, wood: 4 }, darkWithout: true, litWith: true, club: { seconds: 2.5, quickerThanOthers: true }
  });
});

test('a wave\'s tents are put up outside the player\'s land, one to three tiles from it (#326)', async () => {
  const tents = await sim.wavesTentsAtTheBorder();
  expect(tents).toMatchObject({ sites: true, allOutside: true });
  expect(tents.gaps.length).toBeGreaterThan(0);
  for (const gap of tents.gaps) {
    expect(gap).toBeGreaterThanOrEqual(1);
    expect(gap).toBeLessThanOrEqual(3);
  }
});
