import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), 28: a boar pen, and a soldier with a lasso

async function setUp(page) {
  const errors = await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => {
    window.sim.helpers.clearResources(); resetTileIndex();
    dayTime = GAME_CONFIG.daytime.morning + 20;
    const g = getGridPos(townHall.x, townHall.y), at = (dx, dy) => ({ x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 });
    window.at = at;
    window.pen = window.sim.helpers.placeBuilding('pen', at(-4, 0).x, at(-4, 0).y) || buildings.find(b => b.type === 'pen');
    window.newBoar = (p, extra = {}) => { const b = { x: p.x, y: p.y, hp: 30, maxHp: 30, priority: 0, wanderTimer: 0, wanderInterval: 99, targetX: p.x, targetY: p.y, ...extra }; boars.push(b); return b; };
    window.quiet = () => { waveTimer = 999; boarRespawnTimer = 999; for (const s of settlers) s.hunger = 999; };
  });
  return errors;
}

test('a soldier with a lasso drives a boar into the grass, catches it hiding there and leads it into the pen; with two in it, no more are caught (#326, 27.10, 28)', async ({ page }) => {
  const errors = await setUp(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    // grass about, a boar out there
    for (const [dx, dy] of [[5, 3], [6, 3], [5, 4], [7, 2], [4, 5]]) addMapResource('grass', at(dx, dy).x, at(dx, dy).y);
    resetTileIndex();
    const boar = newBoar(at(5, 1));
    const s = makeSettler(1, at(0, 2).x, at(0, 2).y, { weapon: 'sword', role: 'soldier' });
    putOnGear(s, 'lasso');
    settlers = [s];
    let hid = false, led = false, acts = new Set();
    for (let f = 0; f < 60 * 60 && boar.pen !== pen; f++) { quiet(); update(1 / 60); if (boar.hidden) hid = true; if (boar.ledBy === s) led = true; acts.add(s.activity); }
    const inPen = boar.pen === pen;
    // a second one in, then the pen's full for catching
    newBoar(at(-4, 0), { pen });
    const third = newBoar(at(5, 1));
    for (let f = 0; f < 60 * 10; f++) { quiet(); update(1 / 60); }
    return { hid, led, inPen, acts: ['catchBoar', 'leadBoar'].every(a => acts.has(a)), thirdFree: !third.pen && !third.ledBy, count: pennedIn(pen).length };
  });
  expect(r).toEqual({ hid: true, led: true, inPen: true, acts: true, thirdFree: true, count: 2 });
  expect(errors).toEqual([]);
});

test('two grown, fed, have a piglet that grows up; hungry, none; three grown: a soldier kills one there and butchers it (#326, 27.10, 28)', async ({ page }) => {
  const errors = await setUp(page);
  const r = await page.evaluate(() => {
    const c = GAME_CONFIG.buildings.pen.pen;
    settlers = [];
    const a = newBoar(at(-4, 0), { pen }), b = newBoar(at(-4, 0), { pen });
    // hungry: nobody born
    pen.fedFor = 0;
    for (let f = 0; f < 60 * (c.breedSeconds + 5); f++) { quiet(); update(1 / 60); }
    const hungryBorn = pennedIn(pen).length;
    // fed: one born, then grown
    pen.fedFor = 1e6;
    for (let f = 0; f < 60 * (c.breedSeconds + 5); f++) { quiet(); update(1 / 60); }
    const piglet = pennedIn(pen).find(o => o !== a && o !== b);
    const born = !!piglet && piglet.young > 0;
    for (let f = 0; f < 60 * (c.growSeconds + 5); f++) { quiet(); update(1 / 60); }
    const grownUp = !!piglet && !(piglet.young > 0);
    // three grown: one marked for the pot; a soldier kills it in the pen and butchers it
    const culled = pennedIn(pen).filter(o => o.cull).length;
    const { makeSettler } = window.sim.helpers;
    settlers = [makeSettler(1, at(-1, 2).x, at(-1, 2).y, { weapon: 'spear', role: 'soldier' })];
    stock.rawMeat = 0;
    for (let f = 0; f < 60 * 60 && pennedIn(pen).length > 2; f++) { quiet(); update(1 / 60); }
    for (let f = 0; f < 60 * 30 && !(stock.rawMeat > 0 || (settlers[0].carrying && settlers[0].carrying.type === 'rawMeat')); f++) { quiet(); update(1 / 60); }
    return { hungryBorn, born, grownUp, culled, left: pennedIn(pen).length, meat: stock.rawMeat > 0 || !!(settlers[0].carrying && settlers[0].carrying.type === 'rawMeat') };
  });
  expect(r).toEqual({ hungryBorn: 2, born: true, grownUp: true, culled: 1, left: 2, meat: true });
  expect(errors).toEqual([]);
});

test('a hungry pen is fed by a soldier; with no soldier by a worker with free hands, not one with a tool (#326, 27.10, 28)', async ({ page }) => {
  const errors = await setUp(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    newBoar(at(-4, 0), { pen });
    stock.berries = 10;
    const feedWith = list => {
      settlers = list; pen.fedFor = 0;
      let by = null;
      for (let f = 0; f < 60 * 40 && !by; f++) { quiet(); update(1 / 60); if (pen.fedFor > 0) by = settlers.find(o => o.activity === 'feedPen') || settlers.find(o => o.lastBehaviour && o.lastBehaviour.name === 'feedPen') || 'someone'; }
      return pen.fedFor > 0;
    };
    const soldier = makeSettler(1, at(0, 2).x, at(0, 2).y, { weapon: 'sword', role: 'soldier' });
    const bySoldier = feedWith([soldier]);
    const hands = makeSettler(2, at(1, 2).x, at(1, 2).y), tooled = makeSettler(3, at(-1, 2).x, at(-1, 2).y, { tool: 'axe' });
    settlers = [hands, tooled]; pen.fedFor = 0;
    let feeder = null;
    for (let f = 0; f < 60 * 40 && !(pen.fedFor > 0); f++) { quiet(); update(1 / 60); for (const o of settlers) if (o.feedingPen) feeder = feeder || o; }
    return { bySoldier, fed: pen.fedFor > 0, feeder: feeder && feeder.id };
  });
  expect(r).toEqual({ bySoldier: true, fed: true, feeder: 2 });
  expect(errors).toEqual([]);
});
