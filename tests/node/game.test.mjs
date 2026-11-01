// game: the game's logic, run in Node (moved from tests/game.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

const ROCK_SEEDS = ['maze-283', 'maze-137', 'maze-69'];

test('the same seed generates the same map', async () => {
  const [a, b, c] = await (() => {
    const sig = seed => { window.sim.start(seed); return window.sim.mapSignature(); };
    return [sig('determinism'), sig('determinism'), sig('something-else')];
  })();
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test('A* finds a way home from every reachable tile on a rock-heavy map', async () => {
  const settlers = await (() => window.sim.pathCoverage('maze-137', false))();
  const enemies = await (() => window.sim.pathCoverage('maze-137', true))();
  expect(settlers.found).toBe(settlers.tiles);
  expect(enemies.found).toBe(enemies.tiles);
});

test('enemies chop through a ring of trees', async () => {
  const r = await sim.treeSiege({});
  expect(r.left).toBeLessThan(r.ringTrees);
  expect(r.hallDamage).toBeGreaterThan(0);
});

test('enemies pressed against a wall damage it', async () => {
  const r = await sim.wallContact({});
  expect(r.wallsBroken).toBeGreaterThan(0);
  expect(r.secondsStuckAtWall).toBeLessThan(1);
});

test('enemies break into a walled-in player', async () => {
  // stone walls are 300 hp and the bunker can be far from the border, so give it two minutes
  const r = await sim.bunker({ seed: 'maze-283', seconds: 120 });
  expect(r.wallsBroken).toBeGreaterThan(0);
  expect(r.playerDamage).toBeGreaterThan(0);
});

test('settlers far out in a rock maze bring their load home', async () => {
  const r = await sim.homecoming({ seed: 'maze-137' });
  expect(r.farthestSteps).toBeGreaterThan(50);
  expect(r.delivered).toBe(r.placed);
});

test('working settlers near the town hall do not get stuck', async () => {
  const r = await sim.crowd({ seed: 'maze-137', count: 12 });
  expect(r.stuck).toEqual([]);
  expect(r.overlapping).toBeLessThanOrEqual(2);
});

test('settlers spread over a rock-heavy map do not get stuck', async () => {
  const r = await sim.crowd({ seed: 'maze-283', count: 20, spread: true, seconds: 25 });
  expect(r.stuck).toEqual([]);
  // a snapshot of momentary crowding (0-3 pairs over 20-30 s at the #123 pace), not settlers stuck together
  expect(r.overlapping).toBeLessThanOrEqual(3);
});

test('a large late-game wave stays cheap to simulate', async () => {
  const r = await sim.waveCost({ wave: 16, minEnemies: 45 });
  expect(r.spawned).toBeGreaterThanOrEqual(45);
  // measured ~20-40ms on a laptop; CI runners are slower, this only catches big regressions
  expect(r.msPerGameSecond).toBeLessThan(250);
});

test('every map has iron and coal spawners with an ore reachable from the town hall', async () => {
  // before spawners (#4) ~14% of maps had no iron and ~32% no coal
  const seeds = Array.from({ length: 150 }, (_, i) => `ore-${i}`).concat(ROCK_SEEDS);
  expect(await (seeds => window.sim.oreReport(seeds))(seeds)).toEqual([]);
});

test('mined ores grow back around their spawner; a spawner is never used up (#248: only worked when marked)', async () => {
  const r = await sim.oreRespawn('maze-137');
  for (const kind of ['iron', 'coal']) {
    expect(r[kind].rightAfter).toBe(0);
    expect(r[kind].after).toBe(r[kind].before);
    expect(r[kind].allNearSpawner).toBe(true);
  }
  expect(r.spawnerSurvivesMining).toBe(true);
  expect(r.spawnerHarvestable).toBe(true); // (marked only: natural rock is markOnly)
});

test('a wounded soldier under fire fights back instead of running to heal (#10)', async () => {
  const r = await sim.woundedUnderFire({ hpShare: 0.6 });
  expect(r.went).toBe('archer');
  expect(r.archerHurt).toBe(true);
});

test('a badly wounded soldier (< 25% hp) retreats to heal (#10)', async () => {
  const r = await sim.woundedUnderFire({ hpShare: 0.2 });
  expect(r.went).toBe('tent');
});

test('each catch uses one seed as bait, and fishing stops without seeds (#18)', async () => {
  const withSeeds = await sim.fishing({ seeds: 3 });
  expect(withSeeds.catches).toBe(3);
  expect(withSeeds.seedsLeft).toBe(0);
  const noSeeds = await sim.fishing({ seeds: 0 });
  expect(noSeeds.catches).toBe(0);
});

test('the ground uses more than one grass shade, not one flat repeating fill (#61)', async () => {
  const r = await sim.grassTileVariety();
  expect(r.shadeCount).toBe(r.totalShades);
});

test('a boar takes the wielded weapon\'s damage (#62; #298: not twice it); one blow of a sword or a spear doesn\'t kill it, an arrow or iron does', async () => {
  const fistDmg = await sim.boarHuntDamage({ weapon: 'fist' });
  const swordDmg = await sim.boarHuntDamage({ weapon: 'sword' });
  expect(fistDmg).toBe(6);
  expect(swordDmg).toBe(20);
  const hp = await (() => GAME_CONFIG.mapResources.boar.hp)();
  const dmg = id => GAME_CONFIG.weapons[id].combat.damage;
  for (const one of ['club', 'sword', 'spear']) expect(dmg(one) < hp).toBe(true);
  for (const kills of ['bow', 'iron_sword', 'iron_spear']) expect(dmg(kills) >= hp).toBe(true);
});

test('a boar flees a settler that gets close, even before being attacked (#62)', async () => {
  const r = await sim.boarFlee();
  expect(r.sawFlee).toBe(true);
  expect(r.hid).toBe(false);
  expect(r.movedAway).toBe(true);
});

test('harvested resources grow back after a delay, not at once (#11)', async () => {
  const r = await sim.treeRegrowth();
  expect(r.rightAfter).toBe(r.count0 - 1);
  expect(r.beforeMinDelay).toBe(r.count0 - 1);
  expect(r.afterMaxDelay).toBe(r.count0);
});

test('boulders also come in piles on touching tiles (#12)', async () => {
  const seeds = Array.from({ length: 30 }, (_, i) => `piles-${i}`);
  const largest = await (seeds => window.sim.largestBoulderPiles(seeds))(seeds);
  // a pile can occasionally come out small if its spot is crowded
  expect(largest.filter(n => n >= 3).length).toBeGreaterThanOrEqual(27);
});

test('trees, grass, berries and sticks grow mostly in forests (#13)', async () => {
  const seeds = Array.from({ length: 30 }, (_, i) => `forest-${i}`);
  const r = await (seeds => window.sim.forestShares(seeds))(seeds);
  expect(r.trees).toBeGreaterThan(0.7);
  expect(r.undergrowth).toBeGreaterThan(0.55);
});

test('armed settlers go for an enemy the player marked (#35)', async () => {
  expect(await sim.markedTarget({ mark: false })).toBe('nearHall');
  expect(await sim.markedTarget({ mark: true })).toBe('marked');
});

test('a settler with nothing to do is flagged idle, a working one is not (#33)', async () => {
  expect(await sim.idleFlags({})).toEqual({ idleWorker: true, busyWorker: false });
});

test('disarming refunds exactly what the item cost', async () => {
  expect(await (() => window.sim.refundMismatches())()).toEqual([]);
});

test('an enemy archer runs out of arrows and draws its dagger without a tent (#55, #326)', async () => {
  const r = await sim.archerQuiver({ withTent: false });
  expect(r.shots).toBe(12);
  expect(r.tentVisits).toBe(0);
  expect(r.weapon).toBe('dagger');
  expect(r.meleeDamage).toBeGreaterThan(0);
});

test('an enemy archer refills 6 arrows at a time from the tent stock, then draws its dagger (#55, #326)', async () => {
  const r = await sim.archerQuiver({ withTent: true, seconds: 120 });
  expect(r.shots).toBe(24); // 12 in the quiver + its 12 in the tents
  expect(r.tentVisits).toBe(2);
  expect(r.stockLeft).toBe(0);
  expect(r.weapon).toBe('dagger');
});

test('a resource added only in GAME_CONFIG is gathered, stocked and spent (#45)', async () => {
  const r = await sim.configOnlyResource({});
  expect(r.atStart).toBe(0);
  expect(r.delivered).toBe(2);
  expect(r.canPay).toBe(true);
  expect(r.afterTool).toBe(0);
});

test('a settler healing at a tent heals up fully while not attacked (#65)', async () => {
  const r = await sim.healUp({ hpShare: 0.2 });
  expect(r.reachedTent).toBe(true);
  expect(r.leftWith).toBe(1);
});

test('arrows stop at trees, rocks, bushes and buildings, and fly over grass, sticks, pebbles, water and crops (#23)', async () => {
  const r = await sim.arrowObstacles({});
  const blocks = ['tree', 'boulder', 'rock', 'bush', 'tent'];
  const passes = ['grass', 'stick', 'pebble', 'water', 'wheat', 'sapling'];
  const overFromTower = ['wall', 'door'];
  for (const kind of blocks) expect([kind, r[kind]]).toEqual([kind, { ground: { clear: false, hit: false }, tower: { clear: false, hit: false } }]);
  for (const kind of passes) expect([kind, r[kind]]).toEqual([kind, { ground: { clear: true, hit: true }, tower: { clear: true, hit: true } }]);
  for (const kind of overFromTower) expect([kind, r[kind]]).toEqual([kind, { ground: { clear: false, hit: false }, tower: { clear: true, hit: true } }]);
});

test('an archer steps aside for a clear shot instead of shooting into a rock (#23)', async () => {
  const r = await sim.archerAroundObstacle({});
  expect(r.hurt).toBe(true);
  expect(r.blockedShots).toBe(0);
});

test('soldiers and enemies fight without walking into each other (#15)', async () => {
  // (#326) on a few maps, not one: by a wall a push can't always be whole, so a body overlaps another by a few
  // pixels now and then (5 at worst on these before), never by more than a quarter of it
  for (const seed of ['overlap-test', 'b2', 'c3', 'd4']) {
    const r = await sim.meleeOverlap({ seed });
    expect(r.settlersHurt && r.enemiesHurt).toBe(true);
    expect(r.deepest).toBeLessThan(5.25);
  }
});
