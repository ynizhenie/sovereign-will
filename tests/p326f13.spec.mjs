import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('medics and necromancers find a reachable backline spot when their preferred tile is blocked', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await expect(page.locator('[data-battle-category="units"]')).toBeVisible();

  const result = await page.evaluate(() => {
    const { makeSettler, tileCenter } = window.sim.helpers;
    game.gameMode = 'battle';
    game.buildings.length = 0;
    game.enemyTents.length = 0;

    const playerFighter = makeSettler(1, 505, 300, { weapon: 'sword', role: 'soldier' });
    const playerMedic = makeSettler(2, 350, 300, { role: 'worker', tool: 'medbag' });
    const playerNecromancer = makeSettler(3, 350, 340, { tool: 'necro_staff' });
    const enemyFighter = createConfiguredEnemy({ x: 805, y: 300 }, 'raider');
    const enemyAnchor = createConfiguredEnemy({ x: 1015, y: 700 }, 'raider');
    const enemyMedic = createConfiguredEnemy({ x: 1115, y: 700 }, 'raider_medic');
    const enemyNecromancer = createConfiguredEnemy({ x: 1115, y: 670 }, 'undead_necromancer');
    game.settlers = [playerFighter, playerMedic, playerNecromancer];
    game.enemies = [enemyFighter, enemyAnchor, enemyMedic, enemyNecromancer];

    const closest = (units, point) => units.reduce((a, b) =>
      Math.hypot(a.x - point.x, a.y - point.y) < Math.hypot(b.x - point.x, b.y - point.y) ? a : b);
    const backline = (anchor, opponent, direction) => {
      const distance = Math.hypot(anchor.x - opponent.x, anchor.y - opponent.y);
      return {
        x: anchor.x + (anchor.x - opponent.x) / distance * 50 * direction,
        y: anchor.y + (anchor.y - opponent.y) / distance * 50 * direction
      };
    };
    const playerTarget = backline(playerFighter, closest(game.enemies, playerFighter), 1);
    const enemyTarget = backline(enemyAnchor, closest(game.settlers, enemyAnchor), 1);
    const blockTarget = point => {
      const tile = tileCenter(Math.floor(point.x / TILE_SIZE), Math.floor(point.y / TILE_SIZE));
      game.buildings.push({ type: 'wall_wood', ...tile, hp: 100, maxHp: 100 });
    };
    blockTarget(playerTarget);
    blockTarget(enemyTarget);
    resetTileIndex();

    const before = [playerMedic, playerNecromancer, enemyMedic, enemyNecromancer].map(unit => ({ x: unit.x, y: unit.y }));
    playerMedicKeepsBack(playerMedic, 1 / 60);
    playerNecromancerKeepsBack(playerNecromancer, 1 / 60);
    enemyMedicKeepsBack(enemyMedic, 1 / 60);
    necromancerKeepsBack(enemyNecromancer, 1 / 60);

    return [playerMedic, playerNecromancer, enemyMedic, enemyNecromancer].map((unit, i) => {
      const goal = unit.pathTarget;
      const gx = goal && Math.floor(goal.x / TILE_SIZE), gy = goal && Math.floor(goal.y / TILE_SIZE);
      const isEnemy = i >= 2;
      return {
        foundSafeGoal: !!goal && !(isEnemy ? isTileBlockedForEnemyStrict(gx, gy) : isTileBlockedForSettler(gx, gy)) &&
          !collidesWithWall(goal.x, goal.y, unit.radius, isEnemy),
        moved: Math.hypot(unit.x - before[i].x, unit.y - before[i].y) > 0
      };
    });
  });

  expect(result).toEqual([
    { foundSafeGoal: true, moved: true },
    { foundSafeGoal: true, moved: true },
    { foundSafeGoal: true, moved: true },
    { foundSafeGoal: true, moved: true }
  ]);
  expect(errors).toEqual([]);
});

test('enemy replanning skips the current tile instead of taking a backward step', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    const { tileCenter } = window.sim.helpers;
    window.sim.start('enemy-path-replan');
    game.gameMode = 'endless';
    game.buildings = [];
    game.enemyTents = [];
    game.enemyCamps = [];
    game.enemyCamp = null;
    let lane = null;
    for (let gy = 2; gy < game.ROWS - 2 && !lane; gy++) {
      for (let gx = 2; gx < game.COLS - 12; gx++) {
        if (Array.from({ length: 11 }, (_, i) => isTileBlockedForEnemyStrict(gx + i, gy)).every(blocked => !blocked)) {
          lane = { gx, gy };
          break;
        }
      }
    }
    if (!lane) throw new Error('Could not find a clear lane for the path-replanning test');
    const tile = tileCenter(lane.gx, lane.gy);
    const enemy = createConfiguredEnemy({ x: tile.x + 12, y: tile.y }, 'raider');
    enemy.speed = 2;
    const startGrid = getGridPos(enemy.x, enemy.y);
    const wall = tileCenter(startGrid.gx + 3, startGrid.gy);
    game.buildings.push({ type: 'wall_wood', side: 'green', x: wall.x, y: wall.y, hp: 100, maxHp: 100 });
    resetTileIndex();
    const beforeX = enemy.x;
    moveEntityTowards(enemy, enemy.x + TILE_SIZE * 10, enemy.y, enemy.speed, true, 1 / 60);
    const next = enemy.path?.[0] && getGridPos(enemy.path[0].x, enemy.path[0].y);
    return {
      hadDetour: !!enemy.path?.length,
      firstNodeLeavesStartTile: !!next && (next.gx !== startGrid.gx || next.gy !== startGrid.gy),
      movedForward: enemy.x >= beforeX,
      startGrid
    };
  });
  expect(result).toMatchObject({ hadDetour: true, firstNodeLeavesStartTile: true, movedForward: true });
  expect(errors).toEqual([]);
});

test('an enemy can move out if ore appears underneath it', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    const { tileCenter } = window.sim.helpers;
    window.sim.start('enemy-ore-escape');
    game.gameMode = 'endless';
    game.buildings = [];
    game.enemyTents = [];
    game.enemyCamps = [];
    game.enemyCamp = null;
    game.ironOres = [];
    game.coalOres = [];

    let lane = null;
    for (let gy = 2; gy < game.ROWS - 2 && !lane; gy++) {
      for (let gx = 2; gx < game.COLS - 12; gx++) {
        if (Array.from({ length: 11 }, (_, i) => isTileBlockedForEnemyStrict(gx + i, gy)).every(blocked => !blocked)) {
          lane = { gx, gy };
          break;
        }
      }
    }
    if (!lane) throw new Error('Could not find a clear lane for the ore escape test');

    const tile = tileCenter(lane.gx, lane.gy);
    const enemy = createConfiguredEnemy(tile, 'raider');
    game.enemies = [enemy];
    game.ironOres.push(tile);
    resetTileIndex();

    for (let i = 0; i < 240; i++) {
      game.pathTick++;
      moveEntityTowards(enemy, tile.x + TILE_SIZE * 8, tile.y, enemy.speed, true, 1 / 60);
    }
    return {
      leftOre: Math.hypot(enemy.x - tile.x, enemy.y - tile.y) > 28,
      noLongerColliding: !collidesWithEnemyNaturalResource(enemy.x, enemy.y, Math.min(enemy.radius, 13)),
      position: { x: enemy.x, y: enemy.y },
      speed: enemy.speed,
      path: enemy.path,
      retry: enemy.pathRetryTimer
    };
  });
  expect(result).toMatchObject({ leftOre: true, noLongerColliding: true });
  expect(errors).toEqual([]);
});
