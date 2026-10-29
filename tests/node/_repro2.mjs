import { sim } from './game.mjs';

const clear = () => {
  for (const list of [trees, cacti, boulders, grassList, berryBushes, sticks, pebbles, ironOres, coalOres, boars,
    naturalRocks, waterTiles, farmPlots, desertTiles, beachTiles]) list.length = 0;
  invalidateAllPaths();
};
const g = () => getGridPos(townHall.x, townHall.y);
const at = (dx, dy) => ({ x: (g().gx + dx) * TILE_SIZE + 15, y: (g().gy + dy) * TILE_SIZE + 15 });

// 1. apple outside the player's zone is left alone
sim.start('repro-apple-zone');
clear();
const far = makeAppleTree({ ...at(25, 0), hp: 3, isGrowing: false, growProgress: 0, priority: 0 });
far.applesReady = true;
trees.push(far);
const stick1 = { ...at(2, 0), hp: 1, maxHp: 1, priority: 0 };
sticks.push(stick1);
invalidateAllPaths();
settlers = [sim.helpers.makeSettler(1, townHall.x + 20, townHall.y)];
for (let f = 0; f < 60 * 10; f++) { waveTimer = 999; update(1 / 60); }
console.log('outside zone:', { appleLeft: far.applesReady, stickLeft: sticks.includes(stick1), inTerritory: inTerritory(settlers[0].x, settlers[0].y) });

// 2. a nearer stick is picked before a ripe apple: apples are not a priority
sim.start('repro-apple-nearest');
clear();
const apple = makeAppleTree({ ...at(8, 0), hp: 3, isGrowing: false, growProgress: 0, priority: 0 });
apple.applesReady = true;
trees.push(apple);
const stick2 = { ...at(2, 0), hp: 1, maxHp: 1, priority: 0 };
sticks.push(stick2);
invalidateAllPaths();
settlers = [sim.helpers.makeSettler(1, townHall.x + 20, townHall.y)];
waveTimer = 999;
update(1 / 60);
console.log('nearest first:', { pickedStick: settlers[0].pickedRes === stick2, pickedApple: settlers[0].pickedRes === apple, appleLeft: apple.applesReady });
