// terrain: the game's logic, run in Node (moved from tests/terrain.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('lakes get a stretch of beach touching the water, never on rock or water (#79)', async () => {
  const r = await (() => ['maze-283', 'maze-137', 'shot', 'beach-a', 'beach-b'].map(seed => {
    window.sim.start(seed);
    const key = t => `${t.x},${t.y}`;
    const water = new Set(waterTiles.map(key)), rock = new Set(naturalRocks.map(key));
    const touchesWater = b => [-1, 0, 1].some(dx => [-1, 0, 1].some(dy => water.has(`${b.x + dx * TILE_SIZE},${b.y + dy * TILE_SIZE}`)));
    return {
      lakes: waterTiles.length > 0, beaches: beachTiles.length,
      allTouchWater: beachTiles.every(touchesWater),
      noneOnRockOrWater: beachTiles.every(b => !water.has(key(b)) && !rock.has(key(b)))
    };
  }))();
  for (const map of r) {
    if (map.lakes) expect(map.beaches).toBeGreaterThan(0);
    expect(map.allTouchWater).toBe(true);
    expect(map.noneOnRockOrWater).toBe(true);
  }
});
