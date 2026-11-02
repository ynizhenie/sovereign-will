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
    const enemyMedic = createConfiguredEnemy({ x: 1150, y: 700 }, 'raider_medic');
    const enemyNecromancer = createConfiguredEnemy({ x: 1150, y: 740 }, 'undead_necromancer');
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
