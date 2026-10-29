import { sim } from './game.mjs';

sim.start('repro-hire');
for (const list of [trees, cacti, boulders, grassList, berryBushes, sticks, pebbles, ironOres, coalOres, boars,
  naturalRocks, waterTiles, farmPlots, desertTiles, beachTiles]) list.length = 0;
invalidateAllPaths();
settlers.length = 0;
stock.food = 1000;
stock.wood = 1000;
stock.stone = 1000;
spawnSettler('big');
const w = settlers[0];
w.backpack = true;
const g = getGridPos(townHall.x, townHall.y);
for (let i = 0; i < 12; i++) {
  sticks.push({ x: (g.gx + 2 + (i % 4)) * TILE_SIZE + 15, y: (g.gy + 2 + Math.floor(i / 4)) * TILE_SIZE + 15, hp: 1, maxHp: 1, priority: 0 });
}
invalidateAllPaths();
let maxLoads = 0, maxAmount = 0;
let lastType = null;
for (let f = 0; f < 60 * 40; f++) {
  waveTimer = 999;
  update(1 / 60);
  if (w.carrying) {
    maxLoads = Math.max(maxLoads, w.carrying.loads || 0);
    maxAmount = Math.max(maxAmount, w.carrying.amount || 0);
    lastType = w.carrying.type;
  }
}
console.log({ type: w.type, carryCapacity: getCarryCapacity(w), maxLoads, maxAmount, lastType, activity: w.activity, stockWood: stock.wood });
