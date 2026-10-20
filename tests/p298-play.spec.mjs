import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's #298, part 2: saving, a night raid, armour in Battles

test('a game saves even with a loop through the fallen (it silently didn\'t); on a raid\'s way it saves, in the camp it says it can\'t (#298, 13)', async ({ page }) => {
  const errors = await openGame(page);
  await sim(page, 'campOpens', { soldiers: 2 });
  const r = await page.evaluate(() => {
    localStorage.clear();
    // a fallen settler and a fallen enemy remembering each other, one alive remembering the enemy
    const dead = window.sim.helpers.makeSettler(900, 0, 0, {}), foe = createConfiguredEnemy({ x: 0, y: 0 }, 'raider');
    dead.lastHitBy = foe; foe.attackTarget = dead; settlers[0].lastHitBy = foe;
    saveCurrentGame();
    const looped = !!loadSaves()[`world:${worldSeed.value}`];
    localStorage.clear();
    // on its way to the camp
    startRaid(settlers.filter(s => s.role === 'soldier'));
    for (let f = 0; f < 30; f++) update(1 / 60);
    setPaused(true); const shownMarching = !document.getElementById('save-game-button').hidden; setPaused(false);
    saveCurrentGame();
    const marching = !!loadSaves()[`world:${worldSeed.value}`];
    const raiderSaved = JSON.stringify(loadSaves()).includes('"raider":true');
    for (let f = 0; f < 3600 && !document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'); f++) update(1 / 60);
    enterCamp();
    localStorage.clear();
    saveCurrentGame();
    const inCamp = !!loadSaves()[`world:${worldSeed.value}`];
    const said = document.getElementById('save-game-button').textContent;
    return { looped, shownMarching, marching, raiderSaved, inCamp, said };
  });
  expect(r.looped).toBe(true);
  expect(r.shownMarching).toBe(true);
  expect(r.marching).toBe(true);
  expect(r.raiderSaved).toBe(false);
  expect(r.inCamp).toBe(false);
  expect(r.said).toContain('лагере');
  expect(errors).toEqual([]);
});

test('at night the asleep can be picked for a raid: they wake and go (#298, 12)', async ({ page }) => {
  const errors = await openGame(page);
  await sim(page, 'campOpens', { soldiers: 2 });
  const r = await page.evaluate(() => {
    const sleeper = settlers.find(s => s.role === 'soldier');
    sleeper.asleep = true;
    raidAction('open');
    const listed = !!document.querySelector(`#raid-picker .raid-unit[data-unit="${sleeper.id}"]`);
    document.querySelector('#raid-picker [data-raid="go"]').click();
    return { listed, going: raid.raiders.includes(sleeper), awake: !sleeper.asleep };
  });
  expect(r).toEqual({ listed: true, going: true, awake: true });
  expect(errors).toEqual([]);
});

test('Battles: the armour button goes off, leather, iron; the units placed wear that kind (#298, 8)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await page.click('[data-battle-category="own"]');
  const b = page.locator('[data-battle-gear="armor"]');
  await b.click();
  await expect(b).toContainText('Кожаная');
  const r = await page.evaluate(() => {
    const at = gx => ({ x: gx * TILE_SIZE + 15, y: 8 * TILE_SIZE + 15 });
    battle.preset = 'sword'; battleTap(at(8).x, at(8).y);
    battle.category = 'enemy'; battle.preset = 'raider'; battleTap(at(30).x, at(30).y);
    return { mine: settlers[0].armor, theirs: enemies[0].armor };
  });
  await b.click();
  await expect(b).toContainText('Железная');
  await b.click();
  await expect(b).not.toHaveClass(/\bon\b/);
  expect(r).toEqual({ mine: 'leather', theirs: 'leather' });
  expect(errors).toEqual([]);
});
