import { test, expect } from './helpers.mjs';
import { openGame, started } from './helpers.mjs';

// Battle mode from the main menu, with taps placed straight in world coordinates
async function openBattle(page) {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await expect(page.locator('[data-battle-category="units"]')).toBeVisible();
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
    battle.preset = 'humans:sword'; battleTap(left.x, left.y);
    battle.preset = 'humans:big_spear'; battleTap(right.x, right.y);
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

test('battle taps cannot select a friendly unit or mark an enemy during a fight', async ({ page }) => {
  await openBattle(page);
  const result = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'humans:sword'; battleTap(at(10, 10).x, at(10, 10).y);
    battle.preset = 'humans:sword'; battleTap(at(30, 10).x, at(30, 10).y);
    startBattleFight();
    mouse.x = settlers[0].x; mouse.y = settlers[0].y; handleCanvasClick();
    mouse.x = enemies[0].x; mouse.y = enemies[0].y; handleCanvasClick();
    return {
      phase: battle.phase,
      selected: game.selectedSettler,
      selectedGroup: game.selectedGroup.length,
      target: settlers[0].orderTarget,
      marked: enemies[0].markedTarget
    };
  });
  expect(result).toEqual({ phase: 'fight', selected: null, selectedGroup: 0, target: undefined, marked: undefined });
});

test('Battles can zoom out enough to see the whole field', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const battleMin = getMinZoom();
    game.gameMode = 'endless';
    const endlessMin = getMinZoom();
    game.gameMode = 'battle';
    setZoom(0);
    const view = getViewRect();
    return { battleMin, endlessMin, zoom: camera.zoom, view, width: WORLD_WIDTH, height: WORLD_HEIGHT };
  });
  expect(r.battleMin).toBeLessThan(r.endlessMin);
  expect(r.zoom).toBe(r.battleMin);
  expect(r.view.x0).toBeLessThan(0);
  expect(r.view.y0).toBeLessThan(0);
  expect(r.view.x1).toBeGreaterThan(r.width);
  expect(r.view.y1).toBeGreaterThan(r.height);
});

test('one Units sheet for both sides, every faction under its heading in the same order; armour, shield and banner for units; buildings everyone\'s, then each faction\'s (#142, #279, #326)', async ({ page }) => {
  await openBattle(page);
  await showCategory(page, 'units');
  const sheet = await page.evaluate(() => {
    const sections = [];
    for (const el of document.getElementById('battle-presets').children) {
      if (el.classList.contains('panel-heading')) sections.push({ name: el.textContent, tiles: [] });
      else sections[sections.length - 1].tiles.push(...[...el.querySelectorAll('.tile')].map(b => b.dataset.preset));
    }
    return sections;
  });
  expect(sheet.map(s => s.name)).toEqual(['Люди', 'Демоны', 'Нежить']);
  const order = ids => ids.map(id => id.split(':')[1]);
  expect(order(sheet[0].tiles)).toEqual(['fist', 'club', 'sword', 'spear', 'iron_sword', 'iron_spear', 'bow', 'crossbow', 'medic', 'pet']); // (the big ones are the Big switch's, #326)
  expect(order(sheet[1].tiles)).toEqual(order(sheet[0].tiles)); // (a medic with a bag: the demons' too)
  expect(order(sheet[2].tiles)).toEqual(['fist', 'club', 'sword', 'spear', 'iron_sword', 'iron_spear', 'bow', 'crossbow', 'necromancer', 'pet']);
  expect(await page.locator('[data-battle-category="units"]').innerText()).toBe('Юниты');
  await expect(page.locator('#battle-factions')).toHaveCount(0); // (no sub-tabs)
  await expect(page.locator('[data-battle-gear="armor"]')).toBeVisible();
  await expect(page.locator('[data-battle-gear="banner"]')).toBeVisible();
  await showCategory(page, 'buildings');
  await expect(page.locator('[data-battle-gear="armor"]')).toBeHidden();
  const headings = await page.locator('#battle-presets .panel-heading').allInnerTexts();
  expect(headings[0]).toBe('Общие');
  const shown = await page.$$eval('#battle-presets .tile', bs => bs.map(b => b.dataset.preset));
  expect(shown).toEqual(expect.arrayContaining(['wall_wood', 'watchtower', 'grave', 'portal', 'sacrifice_circle']));
});

test('any unit on either side: on the left one of yours, on the right an enemy, the very same unit (#326)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    const wrong = [];
    for (const preset of BATTLE_PRESETS) {
      battle.lineup = []; battle.category = 'units'; battle.preset = preset.id;
      battleTap(at(10, 10).x, at(10, 10).y); battleTap(at(30, 10).x, at(30, 10).y);
      const s = settlers[0], en = enemies[0];
      const foe = en && enemyPlayerUnit(getEnemyDef(en));
      const mine = s && { type: s.type, weapon: s.weapon, tool: s.tool === 'none' ? null : s.tool };
      if (!s || !en || JSON.stringify(mine) !== JSON.stringify({ type: foe.type, weapon: foe.weapon, tool: foe.tool || null })) wrong.push([preset.id, mine, foe]);
    }
    return { wrong, count: BATTLE_PRESETS.length };
  });
  expect(r.wrong).toEqual([]);
  expect(r.count).toBe(57); // (the big ones too, #326: 19 each; 27.10, 32: a big archer, crossbowman, medic or necromancer too)
});

test('a battle has no commander unless the player gives a banner (#279)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'humans:sword';
    for (const gy of [8, 10, 12, 14, 16, 18]) battleTap(at(10, gy).x, at(10, gy).y);
    battle.preset = 'humans:sword';
    for (const gy of [8, 10, 12, 14, 16, 18]) battleTap(at(30, gy).x, at(30, gy).y);
    const auto = { green: settlers.filter(s => s.banner).length, red: enemies.filter(en => en.captain).length };
    battle.banner = true;
    battle.category = 'units'; battle.preset = 'humans:sword'; battleTap(at(12, 18).x, at(12, 18).y);
    battle.category = 'units'; battle.preset = 'humans:sword'; battleTap(at(28, 18).x, at(28, 18).y);
    const given = { green: settlers.filter(s => s.banner).length, red: enemies.filter(en => en.captain).length };
    const own = settlers.find(s => s.banner), foe = enemies.find(en => en.captain);
    battle.banner = false;
    battle.category = 'units'; battle.preset = 'humans:sword'; battleTap(at(14, 18).x, at(14, 18).y);
    const after = { green: settlers.filter(s => s.banner).length, red: enemies.filter(en => en.captain).length };
    return { auto, given, after, ownRole: own && own.role, ownType: own && own.type, foeType: foe && foe.type, foeKey: foe && foe.enemyKey,
      entries: battle.lineup.filter(e => e.banner).length };
  });
  expect(r).toEqual({ auto: { green: 0, red: 0 }, given: { green: 1, red: 1 }, after: { green: 1, red: 1 },
    ownRole: 'soldier', ownType: 'normal', foeType: 'normal', foeKey: 'raider', entries: 2 });
});

test('the battle settings pick the field: a glade or a desert, and the line-up stays (#279)', async ({ page }) => {
  await openBattle(page);
  await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'humans:sword'; battleTap(at(10, 10).x, at(10, 10).y);
  });
  await page.click('[data-dock="battle-settings"]');
  await page.click('[data-battle-field="desert"]');
  const desert = await page.evaluate(() => ({ field: battle.field, sand: desertTiles.length, total: COLS * ROWS, units: settlers.length }));
  await expect(page.locator('[data-battle-field="desert"]')).toHaveClass(/on/);
  expect(desert).toEqual({ field: 'desert', sand: 40 * 26, total: 40 * 26, units: 1 });
  await page.click('[data-battle-field="glade"]');
  const glade = await page.evaluate(() => ({ field: battle.field, sand: desertTiles.length, units: settlers.length }));
  expect(glade).toEqual({ field: 'glade', sand: 0, units: 1 });
});

test('the desert field keeps the midline and the green and red halves of the glade (#279)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    setBattleField('desert');
    // (The zoom-out limit no longer shows the whole map; pan left so its outer border is on-screen.)
    camera.x = game.WORLD_WIDTH / 4;
    const frames = () => { for (let i = 0; i < 24; i++) render(); }; // (#322: the terrain's pictures are painted a piece or two a frame)
    frames();
    const x = Math.round(canvas.width / 2 + (game.WORLD_WIDTH / 2 - camera.x) * getViewScale()), y = Math.floor(canvas.height / 2);
    // (With the zoom-out limit the map edge can be off-screen; sample the sand just past its red border instead.)
    const outsideWorldX = BORDER_MARGIN * TILE_SIZE - 30;
    const outsideX = Math.round(x + (outsideWorldX - camera.x) * getViewScale());
    const sample = (px, py) => [...ctx.getImageData(px, py, 1, 1).data];
    const on = { line: sample(x, y), left: sample(x - 200, y), right: sample(x + 200, y), outside: sample(outsideX, y) };
    const phase = battle.phase;
    battle.phase = 'fight'; // the same frame without the placing overlay
    frames();
    const off = { line: sample(x, y), left: sample(x - 200, y), right: sample(x + 200, y), outside: sample(outsideX, y) };
    battle.phase = phase;
    frames();
    return { on, off };
  });
  // the white midline is drawn over the sand
  expect(r.on.line[2] - r.off.line[2]).toBeGreaterThan(20);
  // the left half is tinted green, the right red
  expect((r.on.left[1] - r.off.left[1]) - (r.on.left[0] - r.off.left[0])).toBeGreaterThan(3);
  expect((r.on.right[0] - r.off.right[0]) - (r.on.right[1] - r.off.right[1])).toBeGreaterThan(3);
  // and beyond the red line the sand goes on, not the dark green border of the other modes
  expect(r.on.outside[0]).toBeGreaterThan(150);
});

test('a pet keeps its id and a ghost hovers where it was placed in a battle, not in the empty town hall (#314)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'humans:pet'; battleTap(at(10, 10).x, at(10, 10).y);
    const dog0 = settlers.find(s => s.type === 'dog').id;
    battle.preset = 'humans:sword'; battleTap(at(34, 20).x, at(34, 20).y);
    const dog1 = settlers.find(s => s.type === 'dog').id;
    battle.category = 'units'; battle.preset = 'undead:pet'; battleTap(at(8, 8).x, at(8, 8).y);
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
    battle.preset = 'humans:pet'; battleTap(at(12, 12).x, at(12, 12).y);
    battle.preset = 'humans:pet'; battleTap(at(30, 12).x, at(30, 12).y);
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
    battle.preset = 'humans:bow'; battleTap(at(12, 12).x, at(12, 12).y);
    battle.preset = 'humans:sword'; battleTap(at(25, 12).x, at(25, 12).y);
    selectedSettler = settlers[0]; switchPossession(); // (#326: the selected one, from its card)
    const possessedInSetup = !!getPossessed();
    startBattleFight();
    enemies[0].hp = enemies[0].maxHp = 1e5; // a long fight (the line-up's own raider comes back on cancel)
    selectedSettler = settlers[0]; switchPossession();
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

test('armour, shield and buildings on either side; a side cleared (#142)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.armor = true; battle.shield = true;
    battle.preset = 'humans:sword'; battleTap(at(8, 8).x, at(8, 8).y);
    battle.preset = 'humans:bow'; battleTap(at(8, 10).x, at(8, 10).y);           // an archer gets no shield
    battle.preset = 'humans:sword'; battleTap(at(30, 8).x, at(30, 8).y);
    battle.category = 'buildings'; battle.building = 'wall_stone';
    battleTap(at(12, 8).x, at(12, 8).y); battleTap(at(26, 8).x, at(26, 8).y);
    const sword = settlers.find(s => s.weapon === 'sword'), bow = settlers.find(s => s.weapon === 'bow');
    const out = {
      sword: { armor: sword.armor, shield: !!sword.shield, hp: sword.maxHp }, bowShield: !!bow.shield,
      raider: { weapon: enemies[0].weapon, hp: enemies[0].maxHp, armor: enemies[0].armor, shield: !!enemies[0].shield },
      walls: buildings.filter(b => b.type === 'wall_stone').length
    };
    clearBattleSide('green');
    out.afterClearGreen = { settlers: settlers.length, enemies: enemies.length, walls: buildings.length };
    return out;
  });
  expect(r).toEqual({
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
    battle.preset = 'humans:iron_sword';
    for (const gy of [9, 11, 13]) battleTap(at(17, gy).x, at(17, gy).y);
    battle.preset = 'humans:club'; battleTap(at(22, 11).x, at(22, 11).y);
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

test('identical Hard duels can resolve differently between fights', async ({ page }) => {
  await openBattle(page);
  const winners = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    setBattleDifficulty('hard');
    battle.preset = 'humans:club'; battleTap(at(14, 13).x, at(14, 13).y);
    battle.preset = 'humans:club'; battleTap(at(26, 13).x, at(26, 13).y);
    game.worldSeed.setState(0x12345678);
    const results = [];
    for (let fight = 0; fight < 12; fight++) {
      startBattleFight();
      let seconds = 0;
      while (battle.phase === 'fight' && seconds < 30) {
        update(1 / 60); seconds += 1 / 60;
      }
      results.push(battle.winner);
      battle.phase = 'setup';
      resetBattleUnits();
    }
    return results;
  });
  expect(new Set(winners).size).toBeGreaterThan(1);
});

test('an enemy killed before its turn cannot strike back', async ({ page }) => {
  await openBattle(page);
  const hp = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'humans:iron_sword'; battleTap(at(19, 13).x, at(19, 13).y);
    battle.preset = 'humans:club'; battleTap(at(20, 13).x, at(20, 13).y);
    startBattleFight();
    const settler = settlers[0], enemy = enemies[0];
    enemy.hp = 0;
    update(1 / 60);
    return settler.hp;
  });
  expect(hp).toBe(100);
});

test('a settler panicking from a ghost leaves the battle without a corpse or loot at the border (#314)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'humans:iron_sword'; battleTap(at(2, 13).x, at(2, 13).y);
    battle.preset = 'undead:pet'; battleTap(at(30, 13).x, at(30, 13).y);
    const settler = settlers[0];
    settler.x = 700;
    const remainingEnemy = createConfiguredEnemy({ x: 1100, y: 700 }, 'raider');
    remainingEnemy.speed = 0;
    remainingEnemy.damage = 0;
    enemies.push(remainingEnemy);
    const lootBefore = loot.length;
    startBattleFight();
    for (let f = 0; f < 60 * 15 && settlers.includes(settler); f++) update(1 / 60);
    return {
      removed: !settlers.includes(settler),
      ghostScared: settler.ghostHits > 0,
      fled: settler.fled,
      corpse: corpses.some(c => c.by === settler),
      lootDropped: loot.length > lootBefore
    };
  });
  expect(r).toEqual({ removed: true, ghostScared: true, fled: true, corpse: false, lootDropped: false });
});

test('a human in Battles speaks human phrases when the player faction is undead', async ({ page }) => {
  await openBattle(page);
  const result = await page.evaluate(() => {
    setSideFaction('player', 'undead');
    const human = createSettler('normal', 1, 300, 300);
    game.settlers = [human];
    says(human, 'hired', true);
    return { phrase: human.say && human.say.text, humans: t('voice.humans.hired').split('|') };
  });
  expect(result.humans).toContain(result.phrase);
});

test('a panicking player soldier flees in Battle even when recently struck at close range', async ({ page }) => {
  await openBattle(page);
  const result = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.preset = 'humans:iron_sword'; battleTap(at(12, 13).x, at(12, 13).y);
    battle.preset = 'humans:club'; battleTap(at(26, 13).x, at(26, 13).y);
    startBattleFight();
    const settler = settlers[0], enemy = enemies[0];
    Object.assign(settler, { panic: true, morale: 0, lastAttacker: enemy, lastAttackedTick: game.pathTick });
    enemy.speed = 0;
    const before = Math.hypot(settler.x - enemy.x, settler.y - enemy.y);
    for (let frame = 0; frame < 30; frame++) update(1 / 60);
    return { fledFromAttacker: Math.hypot(settler.x - enemy.x, settler.y - enemy.y) > before };
  });
  expect(result.fledFromAttacker).toBe(true);
});

test('an enemy necromancer keeps behind its allies away from the opposing side in Battles', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    const necromancer = createConfiguredEnemy({ x: 820, y: 300 }, 'undead_necromancer');
    const ally = createConfiguredEnemy({ x: 780, y: 300 }, 'undead_zombie');
    const ghost = createConfiguredEnemy({ x: 600, y: 300 }, 'undead_ghost');
    game.settlers = [{ x: 450, y: 300, hp: 100 }];
    game.enemies = [necromancer, ally, ghost];
    const before = { x: necromancer.x, y: necromancer.y };
    const moved = necromancerKeepsBack(necromancer, 1 / 60);
    return { moved, x: necromancer.x, y: necromancer.y, before };
  });
  expect(movement.moved).toBe(true);
  expect(movement.x).toBe(movement.before.x);
  expect(movement.y).toBe(movement.before.y);
});

test('an enemy dog follows its soldiers, and advances to fight when none are left', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    townHall.x = 1200; townHall.y = 1200;
    const dog = createConfiguredEnemy({ x: 800, y: 300 }, 'raider_dog');
    const soldier = createConfiguredEnemy({ x: 1040, y: 300 }, 'raider');
    const player = { x: 300, y: 300, hp: 100, maxHp: 100, radius: 10, visualRadius: 10 };
    game.settlers = [player];
    game.enemies = [dog, soldier];
    const followingBefore = Math.hypot(dog.x - soldier.x, dog.y - soldier.y);
    tickEnemy(dog, 1 / 60);
    const followingAfter = Math.hypot(dog.x - soldier.x, dog.y - soldier.y);

    game.enemies = [dog];
    dog.x = 700; dog.y = 300; dog.petFollowing = false; dog.attackTarget = null; dog.nextStrikeTick = 0;
    const fightingBefore = Math.hypot(dog.x - player.x, dog.y - player.y);
    for (let frame = 0; frame < 30; frame++) tickEnemy(dog, 1 / 60);
    const fightingAfter = Math.hypot(dog.x - player.x, dog.y - player.y);
    return { followingCloser: followingAfter < followingBefore, fightingCloser: fightingAfter < fightingBefore };
  });
  expect(movement).toEqual({ followingCloser: true, fightingCloser: true });
});

test('a player necromancer keeps behind allies in Battles', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    const necromancer = Object.assign(createSettler('zombie', 1, 300, 300), { tool: 'necro_staff' });
    const ally = createSettler('zombie', 2, 500, 300);
    const enemy = createConfiguredEnemy({ x: 800, y: 300 }, 'raider');
    game.settlers = [necromancer, ally];
    game.enemies = [enemy];
    const before = { x: necromancer.x, y: necromancer.y };
    const moved = playerNecromancerKeepsBack(necromancer, 1 / 60);
    return { moved, x: necromancer.x, y: necromancer.y, before };
  });
  expect(movement.moved).toBe(true);
  expect(movement.x).toBeGreaterThan(movement.before.x);
  expect(movement.y).toBe(movement.before.y);
});

test('a player necromancer eases its movement while following allies', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    const necromancer = Object.assign(createSettler('zombie', 1, 300, 300), { tool: 'necro_staff', speed: 1.2 });
    const ally = createSettler('zombie', 2, 500, 300);
    const enemy = createConfiguredEnemy({ x: 1000, y: 300 }, 'raider');
    game.settlers = [necromancer, ally];
    game.enemies = [enemy];
    const steps = [];
    for (let frame = 0; frame < 8; frame++) {
      ally.x += 0.25;
      const before = { x: necromancer.x, y: necromancer.y };
      playerNecromancerKeepsBack(necromancer, 1 / 60);
      steps.push(Math.hypot(necromancer.x - before.x, necromancer.y - before.y));
    }
    return { eased: !!necromancer.moveVx || !!necromancer.moveVy, increasing: steps[1] > steps[0] };
  });
  expect(movement).toEqual({ eased: true, increasing: true });
});

test('a medic keeps behind armed allies in Battles', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    const medic = Object.assign(createSettler('zombie', 1, 300, 300), { role: 'worker', weapon: 'fist', tool: 'medbag' });
    const ally = createSettler('zombie', 2, 500, 300);
    ally.weapon = 'sword';
    const enemy = createConfiguredEnemy({ x: 800, y: 300 }, 'raider');
    game.settlers = [medic, ally];
    game.enemies = [enemy];
    const before = { x: medic.x, y: medic.y };
    const moved = playerMedicKeepsBack(medic, 1 / 60);
    return { moved, x: medic.x, y: medic.y, before };
  });
  expect(movement.moved).toBe(true);
  expect(movement.x).toBeGreaterThan(movement.before.x);
});

test('an enemy necromancer heals an injured ally instead of fighting a nearby settler', async ({ page }) => {
  await openBattle(page);
  const result = await page.evaluate(() => {
    const necromancer = createConfiguredEnemy({ x: 800, y: 300 }, 'undead_necromancer');
    const ally = createConfiguredEnemy({ x: 900, y: 300 }, 'undead_zombie');
    const settler = createSettler('zombie', 1, 810, 300);
    ally.hp -= 20;
    game.settlers = [settler];
    game.enemies = [necromancer, ally];
    const before = { hp: ally.hp, x: necromancer.x, y: necromancer.y };
    for (let frame = 0; frame < 240 && ally.hp < ally.maxHp; frame++) tickEnemy(necromancer, 1 / 60);
    return {
      healed: ally.hp > before.hp,
      moved: necromancer.x !== before.x || necromancer.y !== before.y,
      target: necromancer.attackTarget,
      workKind: necromancer.workKind,
      treatedAt: ally.treatedAt
    };
  });
  expect(result).toMatchObject({ healed: true, moved: true, target: undefined });
  expect(result.workKind).not.toBe('heal');
  expect(result.treatedAt).toBeUndefined();
});

test('an enemy medic uses the player medic healing animation state', async ({ page }) => {
  await openBattle(page);
  const result = await page.evaluate(() => {
    const medic = createConfiguredEnemy({ x: 800, y: 300 }, 'raider_medic');
    const ally = createConfiguredEnemy({ x: 830, y: 300 }, 'raider');
    const settler = createSettler('zombie', 1, 600, 300);
    ally.hp -= 20;
    game.settlers = [settler];
    game.enemies = [medic, ally];
    tickEnemy(medic, 1 / 60);
    return { workKind: medic.workKind, working: medic.working, treatedAt: ally.treatedAt, healed: ally.hp > ally.maxHp - 20 };
  });
  expect(result.workKind).toBe('heal');
  expect(result.working).toBeGreaterThan(0);
  expect(result.treatedAt).toBeGreaterThanOrEqual(0);
  expect(result.healed).toBe(true);
});

test('medics have unlimited herbs during Battles', async ({ page }) => {
  await openBattle(page);
  const result = await page.evaluate(() => {
    const playerMedic = Object.assign(createSettler('normal', 1, 300, 300), { role: 'worker', weapon: 'fist', tool: 'medbag', bagHerbs: 0 });
    const ally = createSettler('normal', 2, 320, 300);
    ally.weapon = 'sword';
    ally.role = 'soldier';
    ally.hp = 10000 - 40;
    ally.maxHp = 10000;
    const enemy = createConfiguredEnemy({ x: 900, y: 300 }, 'raider');
    enemy.speed = 0;
    enemy.damage = 0;
    enemy.hp = enemy.maxHp = 100000;
    const enemyMedic = createConfiguredEnemy({ x: 700, y: 300 }, 'raider_medic');
    enemyMedic.speed = 0;
    const enemyAlly = createConfiguredEnemy({ x: 720, y: 300 }, 'raider');
    enemyAlly.hp -= 20;
    game.settlers = [playerMedic, ally];
    game.enemies = [enemy, enemyMedic, enemyAlly];
    stock.herbs = 0;
    startBattleFight();
    for (let frame = 0; frame < 180 && battle.phase === 'fight'; frame++) update(1 / 60);
    return {
      playerBag: playerMedic.bagHerbs,
      playerHealed: ally.hp > ally.maxHp - 40,
      enemyBag: enemyMedic.herbs,
      enemyHealed: enemyAlly.hp > enemyAlly.maxHp - 20
    };
  });
  expect(result.playerBag).toBe(0);
  expect(result.playerHealed).toBe(true);
  expect(result.enemyBag).toBe(GAME_CONFIG.enemies.raider_medic.healer.bagSize);
  expect(result.enemyHealed).toBe(true);
});

test('an enemy medic uses the player medic swing animation duration', async ({ page }) => {
  await openBattle(page);
  const swingLen = await page.evaluate(() => {
    const medic = createConfiguredEnemy({ x: 800, y: 300 }, 'raider_medic');
    const settler = createSettler('zombie', 1, 810, 300);
    game.settlers = [settler];
    game.enemies = [medic];
    medic.nextStrikeTick = 0;
    tickEnemy(medic, 1 / 60);
    return medic.swingLen;
  });
  expect(swingLen).toBe(0.3);
});

test('an enemy necromancer raises a nearby corpse despite an enemy unit being close', async ({ page }) => {
  await openBattle(page);
  const result = await page.evaluate(() => {
    const necromancer = createConfiguredEnemy({ x: 800, y: 300 }, 'undead_necromancer');
    const settler = createSettler('zombie', 1, 810, 300);
    game.settlers = [settler];
    game.enemies = [necromancer];
    game.corpses = [{ x: 905, y: 300, radius: 11, side: 'player', kind: 'zombie', age: 0, big: false, wormsTaken: false }];
    let animatedRaise = false;
    for (let frame = 0; frame < 120 && game.corpses.length; frame++) {
      tickEnemy(necromancer, 1 / 60);
      if (necromancer.raising && necromancer.working > 0) animatedRaise = true;
    }
    const raised = game.enemies.find(enemy => enemy.raisedBy === necromancer);
    return { corpseLeft: game.corpses.length, raised: !!raised, temporary: raised && raised.temporary > 0, animatedRaise };
  });
  expect(result).toEqual({ corpseLeft: 0, raised: true, temporary: true, animatedRaise: true });
});

test('a lone player necromancer advances to fight in Battles', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    const necromancer = Object.assign(createSettler('zombie', 1, 200, 300), { tool: 'necro_staff' });
    const enemy = createConfiguredEnemy({ x: 900, y: 300 }, 'raider');
    game.settlers = [necromancer];
    game.enemies = [enemy];
    startBattleFight();
    const before = necromancer.x;
    for (let frame = 0; frame < 60 && battle.phase === 'fight'; frame++) update(1 / 60);
    return { moved: necromancer.x > before, x: necromancer.x, before };
  });
  expect(movement.moved).toBe(true);
  expect(movement.x).toBeGreaterThan(movement.before);
});

test('a lone medic advances to fight in Battles', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    const medic = Object.assign(createSettler('zombie', 1, 200, 300), { role: 'worker', weapon: 'fist', tool: 'medbag' });
    const enemy = createConfiguredEnemy({ x: 900, y: 300 }, 'raider');
    game.settlers = [medic];
    game.enemies = [enemy];
    startBattleFight();
    const before = medic.x;
    for (let frame = 0; frame < 60 && battle.phase === 'fight'; frame++) update(1 / 60);
    return { moved: medic.x > before, x: medic.x, before };
  });
  expect(movement.moved).toBe(true);
  expect(movement.x).toBeGreaterThan(movement.before);
});

test('an enemy necromancer with only ghost escorts does not walk toward the hidden town hall in Battles', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    const necromancer = createConfiguredEnemy({ x: game.WORLD_WIDTH - 100, y: 300 }, 'undead_necromancer');
    const ghost = createConfiguredEnemy({ x: necromancer.x - 20, y: necromancer.y }, 'undead_ghost');
    game.settlers = [];
    game.enemies = [necromancer, ghost];
    const before = { x: necromancer.x, y: necromancer.y };
    tickEnemy(necromancer, 1 / 60);
    return { x: necromancer.x, y: necromancer.y, before, hall: { x: townHall.x, y: townHall.y } };
  });
  expect(movement.x).toBe(movement.before.x);
  expect(movement.y).toBe(movement.before.y);
  expect(movement.hall.x).toBeLessThan(0);
});

test('a battle ends when the last player ghost is temporarily gone, and enemies stop chasing the hidden hall', async ({ page }) => {
  await openBattle(page);
  const result = await page.evaluate(() => {
    const enemy = createConfiguredEnemy({ x: game.WORLD_WIDTH - 100, y: 300 }, 'raider');
    const ghost = createSettler('ghost', 1, 200, 300);
    ghost.ghostGone = 10;
    game.settlers = [ghost];
    game.enemies = [enemy];
    battle.phase = 'fight';
    const before = { x: enemy.x, y: enemy.y };
    tickEnemy(enemy, 1 / 60);
    updateBattle(0);
    return {
      moved: enemy.x !== before.x || enemy.y !== before.y,
      phase: battle.phase,
      winner: battle.winner
    };
  });
  expect(result).toEqual({ moved: false, phase: 'result', winner: 'red' });
});

test('a fighting settler keeps facing its target while it moves', async ({ page }) => {
  await openBattle(page);
  const maxAimError = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    setBattleDifficulty('hard');
    battle.preset = 'humans:club'; battleTap(at(14, 13).x, at(14, 13).y);
    battle.preset = 'humans:club'; battleTap(at(26, 13).x, at(26, 13).y);
    startBattleFight();
    let seconds = 0, maxError = 0, samples = 0;
    while (battle.phase === 'fight' && seconds < 30) {
      update(1 / 60); seconds += 1 / 60;
      const settler = settlers[0];
      if (!settler) continue;
      const target = settler.fightTarget;
      if (!target || settler.swingT > 0) continue;
      const aimedAt = Math.atan2(target.y - settler.y, target.x - settler.x);
      const difference = Math.atan2(Math.sin(settler.facing - aimedAt), Math.cos(settler.facing - aimedAt));
      maxError = Math.max(maxError, Math.abs(difference));
      samples++;
    }
    return { maxError, samples };
  });
  expect(maxAimError.samples).toBeGreaterThan(0);
  expect(maxAimError.maxError).toBeLessThan(0.1);
});

test('melee units do not recoil while closing on a large enemy', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    for (const gy of [7, 9, 11, 15, 17]) {
      battle.preset = 'humans:sword'; battleTap(at(14, gy).x, at(14, gy).y);
    }
    battle.preset = 'humans:big_sword'; battleTap(at(26, 13).x, at(26, 13).y);
    const target = enemies[0];
    target.hp = target.maxHp = 1_000_000;
    target.trapped = true;
    startBattleFight();
    const previous = settlers.map(s => ({ x: s.x, y: s.y }));
    let reversals = 0;
    for (let frame = 0; frame < 60 * 18 && battle.phase === 'fight'; frame++) {
      update(1 / 60);
      settlers.forEach((unit, i) => {
        const vx = unit.x - previous[i].x, vy = unit.y - previous[i].y;
        const progress = vx * (target.x - unit.x) + vy * (target.y - unit.y);
        if (progress < -0.5) reversals++;
        previous[i] = { x: unit.x, y: unit.y };
      });
    }
    return { reversals, assigned: settlers.filter(unit => unit.fightTarget === target).length };
  });
  expect(movement.assigned).toBe(5);
  expect(movement.reversals).toBe(0);
});

test('melee fighters do not recoil when paths are replanned toward moving enemies', async ({ page }) => {
  await openBattle(page);
  const movement = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    for (const gy of [11, 12, 13, 14, 15]) {
      battle.preset = 'humans:sword'; battleTap(at(14, gy).x, at(14, gy).y);
      battle.preset = 'humans:sword'; battleTap(at(20, gy).x, at(20, gy).y);
    }
    for (const unit of [...settlers, ...enemies]) unit.hp = unit.maxHp = 1_000_000;
    startBattleFight();
    const previous = settlers.map(s => ({ x: s.x, y: s.y, dx: 0, dy: 0 }));
    let reversals = 0, sharpTurns = 0;
    for (let frame = 0; frame < 60 * 15 && battle.phase === 'fight'; frame++) {
      update(1 / 60);
      settlers.forEach((unit, i) => {
        const old = previous[i], dx = unit.x - old.x, dy = unit.y - old.y;
        const step = Math.hypot(dx, dy);
        const target = unit.fightTarget;
        if (target && dx * (target.x - unit.x) + dy * (target.y - unit.y) < -0.5) reversals++;
        if (step > 0.1 && Math.hypot(old.dx, old.dy) > 0.1 && dx * old.dx + dy * old.dy < -step * Math.hypot(old.dx, old.dy) * 0.5) {
          sharpTurns++;
        }
        previous[i] = { x: unit.x, y: unit.y, dx, dy };
      });
    }
    return { reversals, sharpTurns, assigned: settlers.filter(unit => unit.fightTarget && enemies.includes(unit.fightTarget)).length };
  });
  expect(movement.assigned).toBe(5);
  expect(movement.reversals).toBe(0);
  expect(movement.sharpTurns).toBe(0);
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
    battle.preset = 'humans:fist'; battleTap(at(18, 10).x, at(18, 10).y);
    battle.preset = 'humans:sword'; battleTap(at(18, 12).x, at(18, 12).y);
    battle.preset = 'humans:club'; battleTap(at(22, 11).x, at(22, 11).y);
    const fist = settlers.find(s => s.weapon === 'fist');
    startBattleFight();
    for (let f = 0; f < 120; f++) update(1 / 60);
    return { insideField: fist.x > 60 && fist.y > 60, nearFight: Math.hypot(fist.x - at(22, 11).x, fist.y - at(22, 11).y) < 150 };
  });
  expect(r).toEqual({ insideField: true, nearFight: true });
});

test('after a battle, Endless starts with a normal town hall (#135)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    startBattleMode();
    leaveBattleMode();
    showMenuScreen('endless');
    document.getElementById('play-button').click();
  });
  await started(page);
  const r = await page.evaluate(() => {
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
    battle.preset = 'humans:sword'; battleTap(at(10, 10).x, at(10, 10).y);
    battle.preset = 'humans:bow'; battleTap(at(10, 12).x, at(10, 12).y);
    battle.preset = 'humans:big_spear'; battleTap(at(30, 10).x, at(30, 10).y);
    const before = faces();
    battle.preset = 'humans:spear'; battleTap(at(12, 10).x, at(12, 10).y); // the line-up made again: the three keep their looks
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
    battle.preset = 'humans:sword'; battleTap(left.x, left.y);
    battle.preset = 'humans:big_spear'; battleTap(right.x, right.y);
    return { green: Math.cos(settlers[0].facing || 0), red: Math.cos(enemies[0].facing || 0) };
  });
  expect(r.green).toBeGreaterThan(0.9);
  expect(r.red).toBeLessThan(-0.9);
});
