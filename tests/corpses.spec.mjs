import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('fallen settlers and enemies leave grey corpses that disappear after a while (#42)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('corpse-test');
    const s = makeSettler(1, townHall.x + 90, townHall.y, { hp: 0 });
    const keep = makeSettler(2, townHall.x - 90, townHall.y, { isPossessed: true });
    settlers = [s, keep];
    const en = createConfiguredEnemy({ x: townHall.x + 200, y: townHall.y + 200 }, 'raider');
    en.hp = 0;
    enemies = [en];
    window.sim.run(0.1);
    const after = corpses.map(c => ({ side: c.side, kind: c.kind, x: Math.round(c.x), y: Math.round(c.y) }));
    render(); // draws them without errors
    window.sim.run(GAME_CONFIG.corpses.seconds - 1);
    const beforeLifetime = corpses.length;
    window.sim.run(2);
    return { after, where: { settler: [Math.round(s.x), Math.round(s.y)], enemy: [Math.round(en.x), Math.round(en.y)] },
      beforeLifetime, gone: corpses.length };
  });
  expect(r.after).toEqual([
    { side: 'settler', kind: 'normal', x: r.where.settler[0], y: r.where.settler[1] },
    { side: 'enemy', kind: 'raider', x: r.where.enemy[0], y: r.where.enemy[1] }
  ]);
  expect(r.beforeLifetime).toBe(2);
  expect(r.gone).toBe(0);
  expect(errors).toEqual([]);
});

test('corpses keep the fallen unit body type, faction visuals, and armor', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('corpse-visual-test');
    const settler = makeSettler(1, townHall.x + 80, townHall.y, { weapon: 'spear', armor: 'iron', look: { female: true, style: 0, shade: 1 } });
    const enemy = createConfiguredEnemy({ x: townHall.x + 120, y: townHall.y }, 'demon_brute');
    enemy.armor = 'leather';
    addCorpse(settler, 'settler', settler.type);
    addCorpse(enemy, 'enemy', enemy.enemyKey);
    const [playerCorpse, enemyCorpse] = corpses;
    const armorColors = [];
    const fill = ctx.fill;
    ctx.fill = function (...args) {
      if (['#9aa7b1', '#8d5a35'].includes(String(this.fillStyle))) armorColors.push(String(this.fillStyle));
      return fill.apply(this, args);
    };
    unitPictures.on = false; // (#425: drawn on the screen itself, to see the calls; a kept picture holds the same)
    try { drawCorpses(); } finally { ctx.fill = fill; unitPictures.on = true; }
    return {
      player: { type: playerCorpse.type, weapon: playerCorpse.weapon, armor: playerCorpse.armor, look: playerCorpse.look, kin: unitKin(playerCorpse) },
      enemy: { type: enemyCorpse.type, enemyKey: enemyCorpse.enemyKey, bigBody: enemyCorpse.bigBody, weapon: enemyCorpse.weapon, armor: enemyCorpse.armor, kin: unitKin(enemyCorpse) },
      armorColors: [...new Set(armorColors)]
    };
  });
  expect(result.player).toMatchObject({ type: 'normal', weapon: 'spear', armor: 'iron', kin: 'humans', look: { female: true, style: 0, shade: 1 } });
  expect(result.enemy).toMatchObject({ enemyKey: 'demon_brute', bigBody: true, weapon: 'spear', armor: 'leather', kin: 'demons' });
  expect(result.armorColors).toEqual(expect.arrayContaining(['#9aa7b1', '#8d5a35']));
  expect(errors).toEqual([]);
});

test('the worms on an old corpse crawl and wriggle as the game goes on', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    window.sim.start('worm-test');
    const life = GAME_CONFIG.corpses.seconds;
    const wormy = { x: townHall.x + 60, y: townHall.y + 60, radius: 11, side: 'settler', kind: 'normal', age: life * 0.6, big: false, wormsTaken: false };
    const fresh = { ...wormy, x: townHall.x + 120, age: 0 };
    // every point of a worm's pink stroke, as drawCorpses draws it now
    const worms = () => {
      const points = [];
      const original = ctx.lineTo;
      ctx.lineTo = function (x, y) { if (String(ctx.strokeStyle) === '#e91e63') points.push([x, y]); return original.call(this, x, y); };
      try { drawCorpses(); } finally { ctx.lineTo = original; }
      return points;
    };
    const away = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    corpses = [wormy];
    pathTick = 600; const first = worms();
    pathTick = 630; const later = worms();
    corpses = [fresh]; pathTick = 660; const none = worms();
    return {
      drawn: first.length,
      wriggled: first.map((p, i) => away(p, later[i])), // how far each point of them moved on in half a second
      onTheCorpse: first.every(p => Math.hypot(p[0] - wormy.x, p[1] - wormy.y) < 13),
      noneOnAFreshOne: none.length
    };
  });
  expect(r.drawn).toBe(15); // (three worms, five segments each)
  expect(Math.min(...r.wriggled)).toBeGreaterThan(0.05); // every point of them moved on: they wriggle
  expect(r.onTheCorpse).toBe(true); // they crawl over it, not off it
  expect(r.noneOnAFreshOne).toBe(0);
  expect(errors).toEqual([]);
});

test('Endless resource rewards and successful item drops lie by the corpse and decay with it', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    window.sim.start('corpse-loot-test');
    game.gameMode = 'endless';
    game.plagueMode = false;
    settlers = [];
    stock.food = 0;
    const itemChance = GAME_CONFIG.loot.itemChance, resourceChance = GAME_CONFIG.loot.resourceChance;
    try {
      GAME_CONFIG.loot.itemChance = 0;
      GAME_CONFIG.loot.resourceChance = 1;
      const noItem = createConfiguredEnemy({ x: townHall.x + 180, y: townHall.y }, 'raider');
      noItem.hp = 0;
      enemies = [noItem];
      removeDeadEnemies();

      GAME_CONFIG.loot.itemChance = 1;
      const item = createConfiguredEnemy({ x: townHall.x + 260, y: townHall.y }, 'raider');
      item.hp = 0;
      enemies = [item];
      removeDeadEnemies();

      const corpsesBefore = corpses.length;
      const piles = loot.map(pile => ({ x: pile.x, y: pile.y, yield: pile.yield, items: pile.items, age: pile.corpseDropAge }));
      const corpse = corpses[1];
      const weapon = loot.find(pile => pile.items.includes('weapons:sword'));
      const expectedWeaponPosition = { x: corpse.x + Math.min(corpse.radius, 16) * 0.9, y: corpse.y + 4 };
      const expectedGrid = getGridPos(expectedWeaponPosition.x, expectedWeaponPosition.y);
      const expectedReach = getSettlerReach({ x: townHall.x, y: townHall.y }, true);
      const expectedReachable = !isTileBlockedForSettler(expectedGrid.gx, expectedGrid.gy) &&
        getReachSteps(expectedReach, expectedGrid.gx, expectedGrid.gy) >= 0;
      const weaponGrid = getGridPos(weapon.x, weapon.y);
      const weaponReachable = !isTileBlockedForSettler(weaponGrid.gx, weaponGrid.gy) &&
        getReachSteps(expectedReach, weaponGrid.gx, weaponGrid.gy) >= 0;
      updateCorpses(GAME_CONFIG.corpses.seconds);
      return {
        stockFood: stock.food,
        corpsesBefore,
        resourcePiles: piles.filter(pile => pile.yield.food === 1).length,
        itemPiles: piles.filter(pile => pile.items.includes('weapons:sword')).length,
        weaponAtPlaguePositionOrMovedToReachableTile: expectedReachable
          ? Math.abs(weapon.x - expectedWeaponPosition.x) < 0.001 && Math.abs(weapon.y - expectedWeaponPosition.y) < 0.001
          : weaponReachable && (weaponGrid.gx !== expectedGrid.gx || weaponGrid.gy !== expectedGrid.gy),
        pilesHaveCorpseAge: piles.every(pile => pile.age === 0),
        corpsesAfter: corpses.length,
        lootAfter: loot.length
      };
    } finally {
      GAME_CONFIG.loot.itemChance = itemChance;
      GAME_CONFIG.loot.resourceChance = resourceChance;
    }
  });
  expect(result).toEqual({
    stockFood: 0,
    corpsesBefore: 2,
    resourcePiles: 2,
    itemPiles: 1,
    weaponAtPlaguePositionOrMovedToReachableTile: true,
    pilesHaveCorpseAge: true,
    corpsesAfter: 0,
    lootAfter: 0
  });
  expect(errors).toEqual([]);
});

test('corpse resource drops move off blocked tiles to reachable ground', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    window.sim.start('corpse-loot-accessibility');
    game.gameMode = 'endless';
    game.plagueMode = false;
    settlers = [];
    const itemChance = GAME_CONFIG.loot.itemChance, resourceChance = GAME_CONFIG.loot.resourceChance;
    try {
      GAME_CONFIG.loot.itemChance = 0;
      GAME_CONFIG.loot.resourceChance = 1;
      const enemy = createConfiguredEnemy({ x: townHall.x + 180, y: townHall.y }, 'raider');
      enemy.hp = 0;
      enemies = [enemy];
      const preferred = { x: enemy.x + Math.min(enemy.radius || 11, 16) * 0.9, y: enemy.y + 4 };
      const blocked = getGridPos(preferred.x, preferred.y);
      waterTiles.push(sim.helpers.tileCenter(blocked.gx, blocked.gy));
      invalidateAllPaths();
      removeDeadEnemies();
      const pile = loot.find(drop => drop.corpseDropAge !== undefined && Object.values(drop.yield || {}).some(amount => amount > 0));
      const grid = getGridPos(pile.x, pile.y);
      const reach = getSettlerReach({ x: townHall.x, y: townHall.y }, true);
      return {
        moved: grid.gx !== blocked.gx || grid.gy !== blocked.gy,
        passable: !isTileBlockedForSettler(grid.gx, grid.gy),
        reachable: getReachSteps(reach, grid.gx, grid.gy) >= 0
      };
    } finally {
      GAME_CONFIG.loot.itemChance = itemChance;
      GAME_CONFIG.loot.resourceChance = resourceChance;
    }
  });
  expect(result).toEqual({ moved: true, passable: true, reachable: true });
  expect(errors).toEqual([]);
});

test('corpse resource packs use the bundle icon instead of the food icon', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(async () => {
    window.sim.start('corpse-resource-bundle-icon');
    const { getIconCanvas } = await import('/js/ui/icons.js');
    loot = [{ x: townHall.x + 60, y: townHall.y + 60, yield: { food: 1 }, items: [], corpseDropAge: 0 }];
    const icons = [];
    const drawImage = ctx.drawImage;
    ctx.drawImage = function (image, ...args) {
      icons.push(image);
      return drawImage.call(this, image, ...args);
    };
    try { drawLoot(true); } finally { ctx.drawImage = drawImage; }
    return {
      bundle: icons.includes(getIconCanvas('bundle')),
      food: icons.includes(getIconCanvas(GAME_CONFIG.resources.food.icon))
    };
  });
  expect(result).toEqual({ bundle: true, food: false });
  expect(errors).toEqual([]);
});

test('half of Endless enemy resource rewards become corpse packs', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    window.sim.start('corpse-resource-drop-chance');
    game.gameMode = 'endless';
    game.plagueMode = false;
    settlers = [];
    const itemChance = GAME_CONFIG.loot.itemChance;
    try {
      GAME_CONFIG.loot.itemChance = 0;
      enemies = [];
      for (let i = 0; i < 100; i++) {
        const enemy = createConfiguredEnemy({ x: townHall.x + 180, y: townHall.y }, 'raider');
        enemy.hp = 0;
        enemies.push(enemy);
      }
      removeDeadEnemies();
      return {
        chance: GAME_CONFIG.loot.resourceChance,
        drops: loot.filter(pile => pile.corpseDropAge !== undefined &&
          Object.values(pile.yield || {}).some(amount => amount > 0)).length
      };
    } finally {
      GAME_CONFIG.loot.itemChance = itemChance;
    }
  });
  expect(result.chance).toBe(0.5);
  expect(result.drops).toBeGreaterThanOrEqual(35);
  expect(result.drops).toBeLessThanOrEqual(65);
  expect(errors).toEqual([]);
});
