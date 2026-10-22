import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// Battle mode from the main menu, with taps placed straight in world coordinates
async function openBattle(page) {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await expect(page.locator('[data-battle-category="own"]')).toBeVisible();
}

// A category's sheet, open (its dock button opens it, and closes it if it's the one open)
async function showCategory(page, category) {
  const button = page.locator(`[data-battle-category="${category}"]`);
  if (!(await button.evaluate(b => b.classList.contains('active')))) await button.click();
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

test('the panel has categories: your units, enemies, buildings; armour and shield for units, yours and the enemy\'s (#142, #279)', async ({ page }) => {
  await openBattle(page);
  const count = () => page.locator('#battle-presets button').count();
  await showCategory(page, 'own');
  expect(await count()).toBe(10); // (the dog too, #314)
  await expect(page.locator('[data-battle-gear="armor"]')).toBeVisible();
  await showCategory(page, 'enemy');
  expect(await count()).toBe(7); // with the healer (#203), the bare-handed savage and the war dog (#314)
  await expect(page.locator('[data-battle-gear="armor"]')).toBeVisible(); // (the enemy's too, #279)
  await showCategory(page, 'buildings');
  await expect(page.locator('[data-battle-gear="armor"]')).toBeHidden();
  expect(await count()).toBe(16); // (#279: all of them the humans have, but a fish trap and crops)
});

test('every category has faction sub-tabs: each faction its own units and buildings (#166)', async ({ page }) => {
  await openBattle(page);
  const shown = async () => page.$$eval('#battle-presets button', bs => bs.map(b => b.dataset.preset));
  const r = {};
  await showCategory(page, 'own');
  for (const faction of ['humans', 'undead', 'demons']) {
    await page.click(`[data-battle-faction="${faction}"]`);
    r[faction] = {};
    for (const category of ['own', 'enemy', 'buildings']) {
      await showCategory(page, category);
      r[faction][category] = await shown();
    }
  }
  expect(await page.locator('[data-battle-category="own"]').innerText()).toBe('Игрок');
  // (each faction's pet too, #314)
  expect(r.undead.own).toEqual(['zombie', 'zombie_club', 'zombie_sword', 'zombie_bow', 'necromancer', 'big_zombie', 'ghost']);
  expect(r.undead.enemy).toEqual(['undead_zombie', 'undead_zombie_sword', 'undead_big_zombie', 'undead_zombie_archer', 'undead_necromancer', 'undead_ghost']);
  expect(r.undead.buildings).toContain('grave');
  expect(r.demons.own).toEqual(['imp_fist', 'imp', 'imp_sword', 'imp_spear', 'imp_bow', 'demon', 'demon_spear', 'beast']);
  expect(r.demons.enemy).toEqual(['demon_imp', 'demon_imp_sword', 'demon_brute', 'demon_imp_archer', 'demon_beast']);
  expect(r.demons.buildings).toEqual(expect.arrayContaining(['sacrifice_circle', 'portal']));
  expect(r.humans.enemy).toEqual(['raider_fist', 'raider_club', 'raider', 'brute', 'raider_archer', 'raider_medic', 'raider_dog']);
  expect(r.humans.buildings).not.toContain('grave');
});

test('every enemy shows the very icons of the player\'s own unit of its kind (#255)', async ({ page }) => {
  await openBattle(page);
  const tiles = async (faction, category) => {
    await showCategory(page, category);
    await page.click(`[data-battle-faction="${faction}"]`);
    return page.$$eval('#battle-presets .tile', bs => bs.map(b => ({
      name: b.querySelector('.tile-name b').textContent,
      icons: [...b.querySelectorAll('.tile-name i.ic')].map(i => [...i.classList].find(c => c.startsWith('ic-')).slice(3))
    })));
  };
  for (const faction of ['humans', 'undead', 'demons']) {
    const own = new Map((await tiles(faction, 'own')).map(t => [t.name, t.icons]));
    const foes = await tiles(faction, 'enemy');
    const compared = foes.filter(f => own.has(f.name));
    expect(compared.length).toBeGreaterThan(0);
    expect(compared.map(f => [f.name, f.icons])).toEqual(compared.map(f => [f.name, own.get(f.name)]));
    if (faction === 'undead') expect(compared).toContainEqual({ name: 'Зомби, Посох некроманта', icons: ['zombie', 'staff'] });
  }
});

test('a big enough side in a battle has a commander with a banner, as a wave\'s (#279)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'sword';
    for (const gy of [8, 10, 12, 14, 16]) battleTap(at(10, gy).x, at(10, gy).y);
    battle.preset = 'raider';
    for (const gy of [8, 10, 12, 14, 16]) battleTap(at(30, gy).x, at(30, gy).y);
    const five = { green: settlers.filter(s => s.banner).length, red: enemies.filter(en => en.captain).length };
    battle.category = 'own'; battle.preset = 'sword'; battleTap(at(10, 18).x, at(10, 18).y);
    battle.category = 'enemy'; battle.preset = 'raider'; battleTap(at(30, 18).x, at(30, 18).y);
    const six = { green: settlers.filter(s => s.banner).length, red: enemies.filter(en => en.captain).length };
    const own = settlers.find(s => s.banner), foe = enemies.find(en => en.captain);
    return { five, six, ownRole: own && own.role, ownType: own && own.type, foeType: foe && foe.type, foeKey: foe && foe.enemyKey };
  });
  expect(r).toEqual({ five: { green: 0, red: 0 }, six: { green: 1, red: 1 }, ownRole: 'soldier', ownType: 'normal', foeType: 'normal', foeKey: 'raider' });
});

test('a pet keeps its id and a ghost hovers where it was placed in a battle, not in the empty town hall (#314)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'dog'; battleTap(at(10, 10).x, at(10, 10).y);
    const dog0 = settlers.find(s => s.type === 'dog').id;
    battle.preset = 'raider'; battleTap(at(34, 20).x, at(34, 20).y);
    const dog1 = settlers.find(s => s.type === 'dog').id;
    battle.category = 'own'; battle.preset = 'ghost'; battleTap(at(8, 8).x, at(8, 8).y);
    const ghost = settlers.find(s => s.type === 'ghost'), spot = at(8, 8);
    startBattleFight();
    for (let f = 0; f < 120; f++) update(1 / 60);
    return { sameId: dog0 === dog1, away: Math.hypot(ghost.x - spot.x, ghost.y - spot.y), phase: battle.phase };
  });
  expect(r.sameId).toBe(true);
  expect(r.phase).toBe('fight');
  expect(r.away).toBeLessThan(40); // (it hovers a little way off its spot)
});

test('an enemy pet is the player\'s own and leaves its own body in a battle too (#314)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    setBattleDifficulty('hard');
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'dog'; battleTap(at(12, 12).x, at(12, 12).y);
    battle.preset = 'raider_dog'; battleTap(at(30, 12).x, at(30, 12).y);
    const own = settlers.find(s => s.type === 'dog'), foe = enemies.find(e => e.enemyKey === 'raider_dog');
    const side = p => ({ hp: p.maxHp, speed: p.speed, radius: p.radius, visualRadius: p.visualRadius });
    addCorpse(own, 'settler', own.type);
    addCorpse(foe, 'enemy', foe.enemyKey);
    return { own: side(own), foe: side(foe), bodies: corpses.map(c => [c.side, c.pet, c.radius]) };
  });
  expect(r.foe).toEqual(r.own);
  expect(r.bodies).toEqual([['settler', 'dog', r.own.visualRadius], ['enemy', 'dog', r.own.visualRadius]]);
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
    archer.hp = archer.maxHp = 1e5; // (the raider reaches it in four seconds; it must live to cancel)
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
      raider: { weapon: enemies[0].weapon, hp: enemies[0].maxHp, armor: enemies[0].armor, shield: !!enemies[0].shield },
      walls: buildings.filter(b => b.type === 'wall_stone').length
    };
    clearBattleSide('green');
    out.afterClearGreen = { settlers: settlers.length, enemies: enemies.length, walls: buildings.length };
    return out;
  });
  expect(r).toEqual({
    refused: true,
    sword: { armor: 'iron', shield: true, hp: 150 }, bowShield: false,
    raider: { weapon: 'sword', hp: 125, armor: 'iron', shield: true }, // (armour and a shield for the enemy too, #279; 100 x 0.75 + 50)
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
  // out of the battle: Endless, or already the world behind the menu (#193)
  const r = await page.evaluate(() => ({ outOfBattle: ['endless', 'menu'].includes(gameMode), map: mapSettings, menu: getComputedStyle(document.getElementById('main-menu')).display !== 'none' }));
  expect(r).toEqual({ outOfBattle: true, map: { cols: 60, rows: 60 }, menu: true });
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

test('the line splitting the field shows while placing, not in the fight or the result', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    // the midline is the one dashed line the game draws
    let drawn = 0;
    const original = ctx.setLineDash;
    ctx.setLineDash = function (dash) { if (dash.length) drawn++; return original.call(this, dash); };
    const at = phase => { battle.phase = phase; drawn = 0; render(); return drawn; };
    let result;
    try { result = { setup: at('setup'), fight: at('fight'), result: at('result') }; } finally { ctx.setLineDash = original; }
    battle.phase = 'setup';
    return result;
  });
  expect(r).toEqual({ setup: 1, fight: 0, result: 0 });
});

test('every placed unit keeps its look, and a new one leaves the others theirs (#306)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    const look = u => `${u.look.female ? 'F' : 'M'}${u.look.style}/${u.look.shade}`;
    const faces = () => ({ green: settlers.map(look), red: enemies.map(look) });
    battle.preset = 'sword'; battleTap(at(10, 10).x, at(10, 10).y);
    battle.preset = 'bow'; battleTap(at(10, 12).x, at(10, 12).y);
    battle.preset = 'brute'; battleTap(at(30, 10).x, at(30, 10).y);
    const before = faces();
    battle.preset = 'spear'; battleTap(at(12, 10).x, at(12, 10).y); // the line-up made again: the three keep their looks
    const placed = faces();
    resetBattleUnits(); // as after a fight: made again
    const rebuilt = faces();
    return { before, placed, rebuilt, everyEntryHasOne: battle.lineup.every(e => e.look) };
  });
  expect(r.placed.green).toHaveLength(3);
  expect(r.placed.green.slice(0, 2)).toEqual(r.before.green);
  expect(r.placed.red).toEqual(r.before.red);
  expect(r.rebuilt).toEqual(r.placed);
  expect(r.everyEntryHasOne).toBe(true);
});

test('placed units face the other side, red ones too (playtest: the enemies stood facing away)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    const left = at(10, 10), right = at(30, 10);
    battle.preset = 'sword'; battleTap(left.x, left.y);
    battle.preset = 'brute'; battleTap(right.x, right.y);
    return { green: Math.cos(settlers[0].facing || 0), red: Math.cos(enemies[0].facing || 0) };
  });
  expect(r.green).toBeGreaterThan(0.9);
  expect(r.red).toBeLessThan(-0.9);
});
