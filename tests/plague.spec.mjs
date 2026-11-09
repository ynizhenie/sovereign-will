import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The Plague (#402), as #404 asked for it
async function startPlague(page) {
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-plague');
  await page.click('#plague-play');
  await page.waitForFunction(() => gameStarted && !loading && plagueMode, null, { timeout: 60000 });
  await page.evaluate(() => { isPaused = true; });
}

test('Plague bands come in on standable ground away from the hero, armed as Endless\'s waves, no crossbowmen (#404, 2, 3, 8)', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const r = await page.evaluate(() => {
    const hero = settlers.find(s => s.plagueHero);
    const seen = [];
    for (let i = 0; i < 40; i++) {
      enemies.length = 0;
      plague.groupTimer = 0; plague.bandCount = [1, 1];
      tickPlague(1 / 60);
      seen.push(enemies.map(en => ({ x: en.x, y: en.y, key: en.enemyKey, weapon: getEnemyDef(en).weapon })));
    }
    const all = seen.flat();
    const standable = en => { const g = getGridPos(en.x, en.y); return !isTileBlockedForEnemyStrict(g.gx, g.gy); };
    return {
      bands: seen.filter(band => band.length).length,
      sizes: [Math.min(...seen.map(b => b.length)), Math.max(...seen.map(b => b.length))],
      standable: all.every(standable),
      far: all.every(en => Math.hypot(en.x - hero.x, en.y - hero.y) >= 10 * TILE_SIZE),
      crossbows: all.filter(en => en.weapon === 'crossbow').length,
      humans: all.every(en => enemyFactionOf(en.key).id === 'humans')
    };
  });
  expect(r.bands).toBeGreaterThan(30);
  expect(r.sizes[0]).toBeGreaterThanOrEqual(3);
  expect(r.sizes[1]).toBeLessThanOrEqual(5); // (level 1: 3 to 5)
  expect(r).toMatchObject({ standable: true, far: true, crossbows: 0, humans: true });
  expect(errors).toEqual([]);
});

test('Plague: the twelve upgrades, one speed card for the hero and the squad, stats from base to now; the hero stands still (#404, 4, 5)', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const r = await page.evaluate(() => {
    const hero = settlers.find(s => s.plagueHero);
    const zombie = createSettler('zombie', 990, hero.x + 40, hero.y, { plagueUnit: true, masterId: hero.id });
    zombie.speed = GAME_CONFIG.settlerTypes.zombie.speed;
    settlers.push(zombie);
    plague.offer = ['speed', 'energy_capacity', 'squad_size'];
    applyPlagueCardOffer();
    const cards = [...document.querySelectorAll('#plague-card-offer .plague-upgrade-card')];
    const rows = cards.map(card => Math.round(card.getBoundingClientRect().top));
    cards[0].click();
    document.getElementById('plague-upgrades-toggle').click();
    const stats = [...document.querySelectorAll('#plague-character-stats .plague-character-stat b')].map(b => b.textContent);
    const cardsListed = document.querySelectorAll('#plague-upgrades-list .plague-upgrade-entry').length;
    document.getElementById('plague-upgrades-close').click();
    return {
      oneRow: new Set(rows).size === 1, speedFactor: plague.speedFactor, squadSpeed: +(zombie.speed / GAME_CONFIG.settlerTypes.zombie.speed).toFixed(2),
      allArrows: stats.length > 10 && stats.every(text => text.includes('→')),
      level: document.getElementById('plague-level').textContent, cardsListed,
      standing: (() => { isPaused = false; update(1 / 60); isPaused = true; return { swaying: !!hero.swaying, idle: !!hero.isIdle }; })()
    };
  });
  expect(r).toMatchObject({ oneRow: true, speedFactor: 1.1, squadSpeed: 1.1, allArrows: true, cardsListed: 12 });
  expect(r.standing).toEqual({ swaying: false, idle: false }); // (no sway, no "zZ" over it)
  expect(r.level).toContain('2');
  expect(errors).toEqual([]);
});

test('Plague keeps its own sides, midday and clear weather; Endless\'s come back after it (#404, 10, 11)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { sides.player.faction = 'demons'; sides.enemy.faction = 'undead'; });
  await startPlague(page);
  const during = await page.evaluate(() => {
    isPaused = false;
    dayTime = 0; weather = { kind: 'rain', level: 1, left: 99, wind: 0, windTo: 0 };
    for (let f = 0; f < 120; f++) update(1 / 60);
    isPaused = true;
    return { player: sides.player.faction, enemy: sides.enemy.faction, night: isNight(), weather: getWeather().kind, hallBlight: isBlighted(townHall.x, townHall.y) };
  });
  expect(during).toEqual({ player: 'undead', enemy: 'humans', night: false, weather: 'clear', hallBlight: false });
  const after = await page.evaluate(() => { exitToMainMenu(); return { player: sides.player.faction, enemy: sides.enemy.faction }; });
  expect(after).toEqual({ player: 'demons', enemy: 'undead' });
  expect(errors).toEqual([]);
});

test('Plague menu: the default ranges or the player\'s own, kept to switch back and forth (#404, 13)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-plague');
  const box = page.locator('[data-plague-range="interval"]');
  await expect(box.locator('.plague-range-fields')).toBeHidden();
  await box.locator('[data-plague-range-mode="custom"]').click();
  await expect(box.locator('.plague-range-fields')).toBeVisible();
  await box.locator('input').nth(0).fill('20');
  await box.locator('input').nth(1).fill('5'); // (the wrong way round: put right)
  await box.locator('input').nth(1).dispatchEvent('change');
  await box.locator('[data-plague-range-mode="default"]').click();
  await expect(box.locator('.plague-range-fields')).toBeHidden();
  const back = await page.evaluate(() => ({ ...plagueSettings.interval }));
  expect(back).toEqual({ custom: false, from: 5, to: 20 });
  await box.locator('[data-plague-range-mode="custom"]').click();
  expect(await box.locator('input').evaluateAll(inputs => inputs.map(i => i.value))).toEqual(['5', '20']);
  expect(errors).toEqual([]);
});

test('Plague: the dead keep their weapons, a corpse shows its, arrows never run out, its own music by level (#404, 6, 7, 9, 14)', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const r = await page.evaluate(() => {
    const hero = settlers.find(s => s.plagueHero);
    const archer = createSettler('zombie', 991, hero.x + 30, hero.y, { plagueUnit: true, masterId: hero.id, weapon: 'bow', role: 'archer', quiver: true, arrows: 12 });
    settlers.push(archer);
    const en = createConfiguredEnemy({ x: hero.x + 200, y: hero.y }, 'raider'); enemies.push(en);
    archer.attackCooldown = 0;
    performAttack(archer, en.x, en.y);
    const lootBefore = loot.length;
    const swordsman = createSettler('zombie', 992, hero.x - 30, hero.y, { plagueUnit: true, role: 'soldier' });
    swordsman.weapon = 'iron_sword';
    dropSettlerLoot(swordsman);
    addCorpse(swordsman, 'settler', 'zombie');
    const original = ctx.drawImage;
    let drew = 0;
    ctx.drawImage = function (...args) { drew++; return original.apply(this, args); };
    try { drawCorpses(); } finally { ctx.drawImage = original; }
    const tracks = [1, 2, 6].map(cards => { plague.upgrades = { squad_size: cards - 1 }; return Object.keys(musicMix())[0]; });
    return { arrows: archer.arrows, loot: loot.length - lootBefore, corpseWeapon: corpses[corpses.length - 1].weapon, drew: drew > 0, tracks };
  });
  expect(r).toMatchObject({ arrows: 12, loot: 0, corpseWeapon: 'iron_sword', drew: true });
  expect(r.tracks).toEqual(['plague_jig', 'plague_waltz', 'plague_jig']);
  expect(errors).toEqual([]);
});
