import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, the 26.10 list: pets fed after a meal (30), half a night's sleep (26)

test('a dog is fed by the soldier it keeps by after that one\'s meal, not by an idle worker; with no soldier, by a worker after its meal (#326, 26.10, 30)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = false;
    window.sim.helpers.clearResources(); resetTileIndex();
    const { makeSettler } = window.sim.helpers;
    dayTime = GAME_CONFIG.daytime.morning + 20;
    stock.food = 50; stock.rawMeat = 20;
    const dog = makeSettler(9, townHall.x + 60, townHall.y + 60, { type: 'dog', role: 'pet' });
    const soldier = makeSettler(1, townHall.x + 80, townHall.y + 60, { weapon: 'sword', role: 'soldier' });
    const worker = makeSettler(2, townHall.x - 60, townHall.y + 40);
    settlers = [dog, soldier, worker];
    const run = (secs, until) => { for (let f = 0; f < secs * 60; f++) { waveTimer = 999; update(1 / 60); if (until && until()) return true; } return false; };
    const fedBy = () => settlers.find(o => o.feeding === dog);
    // hungry, nobody's eaten: not fed (the idle worker no longer does it)
    dog.petHunger = 1.1; soldier.hunger = 999; worker.hunger = 999;
    let feeder = null;
    run(8, () => { feeder = feeder || fedBy(); return false; });
    const idleFed = !!feeder || !(dog.petHunger >= 1);
    // the soldier eats: then it feeds the dog
    soldier.hunger = 0.01;
    feeder = null;
    const fed = run(40, () => { feeder = feeder || fedBy(); return !(dog.petHunger >= 1); });
    const bySoldier = feeder === soldier;
    // no soldier: the worker after its meal
    settlers = [dog, worker]; dog.petHunger = 1.1; worker.hunger = 0.01; feeder = null;
    const fed2 = run(40, () => { feeder = feeder || fedBy(); return !(dog.petHunger >= 1); });
    return { idleFed, fed, bySoldier, fed2, byWorker: feeder === worker };
  });
  expect(r).toEqual({ idleFed: false, fed: true, bySoldier: true, fed2: true, byWorker: true });
  expect(errors).toEqual([]);
});

test('short of half a night\'s sleep, a settler sleeps it off by day; ordered meanwhile, it works drowsy; soldiers on watch by halves sleep enough (#326, 26.10, 26)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = false;
    window.sim.helpers.clearResources(); resetTileIndex();
    const { makeSettler } = window.sim.helpers;
    const c = GAME_CONFIG.daytime;
    const run = secs => { for (let f = 0; f < secs * 60; f++) { waveTimer = 999; for (const o of settlers) o.hunger = 999; update(1 / 60); } };
    // two soldiers through a whole night: each on watch half of it, asleep the other
    const a = makeSettler(1, townHall.x + 60, townHall.y + 60, { weapon: 'sword', role: 'soldier' });
    const b = makeSettler(2, townHall.x - 60, townHall.y + 60, { weapon: 'sword', role: 'soldier' });
    settlers = [a, b];
    dayTime = c.morning + c.day + c.evening - 1;
    run(c.night + 4);
    const soldiersDebt = [a.sleepDebt || 0, b.sleepDebt || 0];
    // a worker up half the night (as if ordered): short of sleep in the morning
    const w = makeSettler(3, townHall.x + 90, townHall.y - 60);
    settlers = [w];
    dayTime = c.morning + c.day + c.evening + c.night - 0.5; game.wasNight = true; w.sleptTonight = 10;
    run(1);
    const debt = w.sleepDebt;
    run(8);
    const sleepsByDay = !!w.asleep && w.activity === 'sleepAtNight';
    // ordered (a tree marked): up and at it, drowsy
    const tree = addMapResource('tree', w.x + 60, w.y); tree.priority = 1; resetTileIndex();
    w.tool = 'axe';
    run(2);
    const drowsy = !w.asleep && !!w.drowsy;
    tree.priority = 0; w.tool = 'none';
    // slept off: awake again
    run(debt + 15);
    return { soldiersDebt: soldiersDebt.every(d => d < 3), debt: debt > 20, sleepsByDay, drowsy, sleptOff: !(w.sleepDebt > 0) && !w.asleep };
  });
  expect(r).toEqual({ soldiersDebt: true, debt: true, sleepsByDay: true, drowsy: true, sleptOff: true });
  expect(errors).toEqual([]);
});
