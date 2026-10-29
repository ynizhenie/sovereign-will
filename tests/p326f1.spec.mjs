import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10): orders, letting go, a pet with no soldier, possession, one gatherer a thing, hit while breaking

const start = async page => {
  const errors = await openGame(page);
  await page.evaluate(() => { setSideFaction('player', 'humans'); mapSettings = { cols: 40, rows: 40 }; window.sim.start('f1'); stock.food = 200; isPaused = false; game.waveTimer = 99999; buildings.push({ type: 'tent', x: townHall.x - 135, y: townHall.y + 105, hp: 100, maxHp: 100 }); resetTileIndex(); });
  return errors;
};

test('sent somewhere it stands there while picked, then back to work; told to Hold it stays till Free (#326, 4-5)', async ({ page }) => {
  const errors = await start(page);
  const r = await page.evaluate(() => {
    const s = settlers[0];
    const spot = { x: townHall.x + 150, y: townHall.y + 120 };
    selectedSettler = s; selectedGroup = [];
    commandTap([s], spot.x, spot.y);
    for (let i = 0; i < 60 * 6; i++) update(1 / 60);
    const stood = Math.hypot(s.x - spot.x, s.y - spot.y) < 50 && !!s.orderSpot; // (as near as it gets: something may stand on the spot)
    selectedSettler = null;
    for (let i = 0; i < 10; i++) update(1 / 60);
    const backToWork = !s.orderSpot;
    selectedSettler = s;
    commandTap([s], spot.x, spot.y);
    holdPosition(s);
    selectedSettler = null;
    for (let i = 0; i < 60 * 3; i++) update(1 / 60);
    const held = !!s.orderSpot && s.holdOrder === true;
    clearOrders(s);
    for (let i = 0; i < 10; i++) update(1 / 60);
    return { stood, backToWork, held, freed: !s.orderSpot && !s.holdOrder };
  });
  expect(r).toEqual({ stood: true, backToWork: true, held: true, freed: true });
  expect(errors).toEqual([]);
});

test('one let go walks to the town hall and is gone there; a dog with no soldier is sent off and let go too (#326, 2)', async ({ page }) => {
  const errors = await start(page);
  const r = await page.evaluate(() => {
    const s = settlers[0];
    s.x = townHall.x + 260; s.y = townHall.y + 40;
    dismissSettler(s);
    let last = null;
    for (let i = 0; i < 60 * 30 && settlers.includes(s); i++) { last = { x: s.x, y: s.y }; update(1 / 60); }
    const settlerGone = !settlers.includes(s), atHall = !!last && Math.hypot(last.x - townHall.x, last.y - townHall.y) < townHall.radius + 40;
    // a dog, no soldiers about: sent somewhere, it goes
    for (const o of settlers) Object.assign(o, { role: 'worker', weapon: 'fist' });
    spawnSettler('dog');
    const dog = settlers.find(o => o.type === 'dog');
    const spot = { x: townHall.x - 200, y: townHall.y - 150 };
    for (let i = 0; i < 30; i++) update(1 / 60);
    selectedSettler = dog; selectedGroup = [];
    const before = Math.hypot(dog.x - spot.x, dog.y - spot.y);
    commandTap([dog], spot.x, spot.y);
    for (let i = 0; i < 60 * 3; i++) update(1 / 60);
    const dogWent = Math.hypot(dog.x - spot.x, dog.y - spot.y) < before - 40;
    selectedSettler = null;
    dismissSettler(dog);
    for (let i = 0; i < 60 * 30 && settlers.includes(dog); i++) update(1 / 60);
    return { settlerGone, atHall, dogWent, dogGone: !settlers.includes(dog) };
  });
  expect(r).toEqual({ settlerGone: true, atHall: true, dogWent: true, dogGone: true });
  expect(errors).toEqual([]);
});

test('possessed, a soldier gathers no grass, as it does by itself (#326, 8)', async ({ page }) => {
  const errors = await start(page);
  const r = await page.evaluate(() => {
    const p = settlers[0];
    Object.assign(p, { weapon: 'sword', role: 'soldier', isPossessed: true });
    const g = { x: p.x + 60, y: p.y, hp: 1, maxHp: 1, priority: 0 };
    grassList.push(g); resetTileIndex();
    const handled = orderPossessed(p, g.x, g.y); // (a tap on it: refused, with a note why)
    return { order: p.order ? p.order.kind : null, handled };
  });
  expect(r).toEqual({ order: null, handled: true });
  expect(errors).toEqual([]);
});

test('two free workers and one stick: only one goes for it (#326, 35)', async ({ page }) => {
  const errors = await start(page);
  const r = await page.evaluate(() => {
    window.sim.helpers.clearResources();
    const [a, b] = settlers;
    for (const s of [a, b]) Object.assign(s, { role: 'worker', tool: 'none', weapon: 'fist', x: townHall.x + 80, y: townHall.y + 80 });
    b.x += 30;
    const stick = { x: townHall.x + 200, y: townHall.y + 140, hp: 1, maxHp: 1, priority: 0 };
    sticks.push(stick); resetTileIndex();
    let both = 0, one = 0;
    for (let i = 0; i < 90 && sticks.includes(stick); i++) {
      update(1 / 60);
      const going = [a, b].filter(s => s.pickedRes === stick && s.activity === 'harvest').length;
      if (going > 1) both++; if (going === 1) one++;
    }
    return { both, one: one > 0 };
  });
  expect(r).toEqual({ both: 0, one: true });
  expect(errors).toEqual([]);
});

test('an enemy breaking a tent turns on the one that hits it (#326, 15)', async ({ page }) => {
  const errors = await start(page);
  const r = await page.evaluate(() => {
    const tent = buildings.find(b => b.type === 'tent');
    const s = settlers[0];
    Object.assign(s, { weapon: 'bow', role: 'archer', quiver: true, arrows: 99, x: tent.x + 200, y: tent.y });
    const en = createNormalEnemy({ x: tent.x - 24, y: tent.y }, 'raider');
    en.musterUntil = 0; // (not gathering for a wave)
    enemies.push(en); resetTileIndex();
    const hp0 = tent.hp, d0 = Math.hypot(en.x - s.x, en.y - s.y);
    for (let i = 0; i < 60; i++) { en.struckBy = s; en.struckTick = pathTick; tickEnemy(en, 1 / 60); game.pathTick++; }
    return { tentKept: tent.hp >= hp0, closer: Math.hypot(en.x - s.x, en.y - s.y) < d0, target: en.attackTarget === s };
  });
  expect(r).toEqual({ tentKept: true, closer: true, target: true });
  expect(errors).toEqual([]);
});
