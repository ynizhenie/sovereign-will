import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

// Battle mode from the main menu, with taps placed straight in world coordinates
async function openBattle(page) {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await expect(page.locator('#battle-panel')).toBeVisible();
}

test('battle mode: an empty field split in two, placing and removing units (#38)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    const left = at(10, 10), right = at(30, 10);
    battle.preset = 'sword'; battleTap(left.x, left.y);
    battle.preset = 'brute'; battleTap(right.x, right.y);
    const placed = { settlers: settlers.length, enemies: enemies.length, green: settlers[0] && settlers[0].weapon, red: enemies[0] && enemies[0].type };
    battleTap(left.x, left.y); // again: taken away
    return {
      field: { trees: trees.length, water: waterTiles.length, rock: naturalRocks.length, boars: boars.length },
      placed, afterRemove: settlers.length
    };
  });
  expect(r.field).toEqual({ trees: 0, water: 0, rock: 0, boars: 0 });
  expect(r.placed).toEqual({ settlers: 1, enemies: 1, green: 'sword', red: 'big' });
  expect(r.afterRemove).toBe(0);
});

test('the panel has categories: your units, enemies, buildings; armour and shield only for yours (#142)', async ({ page }) => {
  await openBattle(page);
  const count = () => page.locator('#battle-presets button').count();
  expect(await count()).toBe(9);
  await expect(page.locator('[data-battle-gear="armor"]')).toBeVisible();
  await page.click('[data-battle-category="enemy"]');
  expect(await count()).toBe(4);
  await expect(page.locator('[data-battle-gear="armor"]')).toBeHidden();
  await page.click('[data-battle-category="buildings"]');
  expect(await count()).toBe(6); // walls, door, spikes, tower, and the humans' tent
});

test('every category has faction sub-tabs: each faction its own units and buildings (#166)', async ({ page }) => {
  await openBattle(page);
  const shown = async () => page.$$eval('#battle-presets button', bs => bs.map(b => b.dataset.preset));
  const r = {};
  for (const faction of ['humans', 'undead', 'demons']) {
    await page.click(`[data-battle-faction="${faction}"]`);
    r[faction] = {};
    for (const category of ['own', 'enemy', 'buildings']) {
      await page.click(`[data-battle-category="${category}"]`);
      r[faction][category] = await shown();
    }
  }
  expect(await page.locator('[data-battle-category="own"]').innerText()).toBe('Игрок');
  expect(r.undead.own).toEqual(['zombie', 'zombie_club', 'zombie_sword', 'skeleton', 'necromancer', 'big_zombie']);
  expect(r.undead.enemy).toEqual(['undead_zombie', 'undead_big_zombie', 'undead_skeleton', 'undead_necromancer']);
  expect(r.undead.buildings).toContain('grave');
  expect(r.demons.own).toEqual(['imp', 'imp_sword', 'imp_spear', 'fire_imp', 'demon', 'demon_spear']);
  expect(r.demons.enemy).toEqual(['demon_imp', 'demon_brute', 'demon_fire_imp']);
  expect(r.demons.buildings).toEqual(expect.arrayContaining(['sacrifice_circle', 'portal']));
  expect(r.humans.buildings).not.toContain('grave');
});

test('a fight can be cancelled back to the line-up; a unit can be possessed in it; arrows never run out (#166)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'bow'; battleTap(at(12, 12).x, at(12, 12).y);
    battle.preset = 'raider'; battleTap(at(25, 12).x, at(25, 12).y);
    switchPossession();
    const possessedInSetup = !!getPossessed();
    startBattleFight();
    enemies[0].hp = enemies[0].maxHp = 1e5; // a long fight (the line-up's own raider comes back on cancel)
    switchPossession();
    const possessedInFight = !!getPossessed();
    const archer = settlers[0];
    const arrows0 = archer.arrows;
    settlers.forEach(s => { s.isPossessed = false; });
    for (let f = 0; f < 240; f++) update(1 / 60);
    const shot = projectiles.length > 0 || enemies[0].hp < enemies[0].maxHp;
    const arrowsKept = archer.arrows === arrows0;
    cancelBattleFight();
    return { possessedInSetup, possessedInFight, shot, arrowsKept, phase: battle.phase,
      backInPlace: settlers.length === 1 && settlers[0].x === at(12, 12).x && enemies[0].hp === enemies[0].maxHp && enemies[0].maxHp < 1e5 };
  });
  expect(r).toEqual({ possessedInSetup: false, possessedInFight: true, shot: true, arrowsKept: true, phase: 'setup', backInPlace: true });
});

test('your units only on the green side, enemies only on the red; armour, shield and buildings (#142)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    window.showNotification = () => {};
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'raider_archer'; battleTap(at(8, 8).x, at(8, 8).y);  // an enemy on the green side: refused
    battle.preset = 'big_spear'; battleTap(at(30, 8).x, at(30, 8).y);    // a giant on the red side: refused
    const refused = settlers.length + enemies.length === 0;
    battle.armor = true; battle.shield = true;
    battle.preset = 'sword'; battleTap(at(8, 8).x, at(8, 8).y);
    battle.preset = 'bow'; battleTap(at(8, 10).x, at(8, 10).y);           // an archer gets no shield
    battle.preset = 'raider'; battleTap(at(30, 8).x, at(30, 8).y);
    battle.category = 'buildings'; battle.building = 'wall_stone';
    battleTap(at(12, 8).x, at(12, 8).y); battleTap(at(26, 8).x, at(26, 8).y);
    const sword = settlers.find(s => s.weapon === 'sword'), bow = settlers.find(s => s.weapon === 'bow');
    const out = {
      refused,
      sword: { armor: sword.armor, shield: !!sword.shield, hp: sword.maxHp }, bowShield: !!bow.shield,
      raider: { weapon: enemies[0].weapon, hp: enemies[0].maxHp },
      walls: buildings.filter(b => b.type === 'wall_stone').length
    };
    clearBattleSide('green');
    out.afterClearGreen = { settlers: settlers.length, enemies: enemies.length, walls: buildings.length };
    return out;
  });
  expect(r).toEqual({
    refused: true,
    sword: { armor: 'iron', shield: true, hp: 150 }, bowShield: false,
    raider: { weapon: 'sword', hp: 70 },
    walls: 2,
    afterClearGreen: { settlers: 0, enemies: 1, walls: 1 }
  });
});

test('Fight runs until one side is left, shows the winner, then brings the line-up back (#38)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    // three iron swords against one savage: green should win
    battle.preset = 'iron_sword';
    for (const gy of [9, 11, 13]) battleTap(at(17, gy).x, at(17, gy).y);
    battle.preset = 'raider_club'; battleTap(at(22, 11).x, at(22, 11).y);
    const before = { x: settlers[0].x, y: settlers[0].y };
    update(1 / 60); // placing: nobody moves yet
    const stillDuringSetup = settlers[0].x === before.x && settlers[0].y === before.y;
    startBattleFight();
    let seconds = 0;
    while (battle.phase === 'fight' && seconds < 60) { update(1 / 60); seconds += 1 / 60; }
    const winner = battle.winner, phase = battle.phase;
    for (let f = 0; f < 60 * (BATTLE_RESULT_SECONDS + 0.5); f++) update(1 / 60);
    return { stillDuringSetup, winner, phase, back: battle.phase, lineup: { settlers: settlers.length, enemies: enemies.length } };
  });
  expect(r.stillDuringSetup).toBe(true);
  expect(r).toMatchObject({ winner: 'green', phase: 'result', back: 'setup', lineup: { settlers: 3, enemies: 1 } });
});

test('the pause menu leaves battle mode and the Endless map size comes back (#38, #145)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { mapSettings = { cols: 60, rows: 60 }; showMenuScreen('home'); });
  await page.click('#mode-battles');
  await page.click('#btn-pause-toggle'); // the Menu is the pause button at the top now (#145)
  await page.click('#exit-to-menu-button');
  const r = await page.evaluate(() => ({ mode: gameMode, map: mapSettings, menu: getComputedStyle(document.getElementById('main-menu')).display !== 'none' }));
  expect(r).toEqual({ mode: 'endless', map: { cols: 60, rows: 60 }, menu: true });
  await expect(page.locator('#bottom-panel')).toBeAttached();
});

test('in a battle the unarmed fight instead of running off to shelter (#38)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'fist'; battleTap(at(18, 10).x, at(18, 10).y);
    battle.preset = 'sword'; battleTap(at(18, 12).x, at(18, 12).y);
    battle.preset = 'raider_club'; battleTap(at(22, 11).x, at(22, 11).y);
    const fist = settlers.find(s => s.weapon === 'fist');
    startBattleFight();
    for (let f = 0; f < 120; f++) update(1 / 60);
    return { insideField: fist.x > 60 && fist.y > 60, nearFight: Math.hypot(fist.x - at(22, 11).x, fist.y - at(22, 11).y) < 150 };
  });
  expect(r).toEqual({ insideField: true, nearFight: true });
});

test('after a battle, Endless starts with a normal town hall (#135)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    startBattleMode();
    leaveBattleMode();
    showMenuScreen('endless');
    document.getElementById('play-button').click();
    return { hp: townHall.hp, maxHp: townHall.maxHp, inWorld: townHall.x > 0 && townHall.x < WORLD_WIDTH };
  });
  expect(r).toEqual({ hp: 100, maxHp: 100, inWorld: true });
});
