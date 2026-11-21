import { test, expect, openGame } from './helpers.mjs';

test('enemy levels ramp from 1 to 3 across waves 10, 20, and 30', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const transitions = [
      getEnemyLevelForWave(10, 0.99),
      getEnemyLevelForWave(11, 0.05), getEnemyLevelForWave(11, 0.1),
      getEnemyLevelForWave(15, 0.49), getEnemyLevelForWave(15, 0.5),
      getEnemyLevelForWave(20, 0.99),
      getEnemyLevelForWave(21, 0.05), getEnemyLevelForWave(21, 0.1),
      getEnemyLevelForWave(25, 0.49), getEnemyLevelForWave(25, 0.5),
      getEnemyLevelForWave(30, 0.99), getEnemyLevelForWave(40, 0.99)
    ];
    const assigned = [10, 20, 30].map(wave => {
      const enemy = createConfiguredEnemy({ x: townHall.x + 300, y: townHall.y }, 'raider');
      return { result: setEnemyLevelForWave(enemy, wave), level: getUnitLevel(enemy) };
    });
    return { transitions, assigned };
  });
  expect(result.transitions).toEqual([1, 2, 1, 2, 1, 2, 3, 2, 3, 2, 3, 3]);
  expect(result.assigned).toEqual([
    { result: 1, level: 1 },
    { result: 2, level: 2 },
    { result: 3, level: 3 }
  ]);
});

test('enemy level progression follows its enemies config', async ({ page }) => {
  await openGame(page);
  const levels = await page.evaluate(() => {
    const config = GAME_CONFIG.waveLevels;
    const saved = { ...config };
    try {
      Object.assign(config, { firstLevelWaves: 2, rampWaves: 2, maxLevel: 4 });
      return [
        getEnemyLevelForWave(2, 0.99),
        getEnemyLevelForWave(3, 0.2), getEnemyLevelForWave(3, 0.5),
        getEnemyLevelForWave(4, 0.99),
        getEnemyLevelForWave(5, 0.2), getEnemyLevelForWave(6, 0.99),
        getEnemyLevelForWave(8, 0.99), getEnemyLevelForWave(20, 0.99)
      ];
    } finally {
      Object.assign(config, saved);
    }
  });
  expect(levels).toEqual([1, 2, 1, 2, 3, 3, 4, 4]);
});

test('Endless wave spawns receive their wave level', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const waves = await page.evaluate(() => {
    sides.enemy.faction = 'humans';
    const result = [];
    for (const wave of [10, 20, 30]) {
      game.waveNum = wave;
      game.enemies = [];
      game.enemyRafts = [];
      game.enemyTents = [];
      game.enemyTentBlueprints = [];
      game.enemyCamps = [];
      game.enemyCamp = null;
      game.portalQueue = [];
      startNextWave();
      const spawned = [...game.enemies, ...game.enemyRafts.flatMap(raft => raft.units)];
      result.push({ wave, levels: [...new Set(spawned.map(enemy => enemy.level).filter(Number.isInteger))] });
    }
    return result;
  });
  expect(waves).toEqual([
    { wave: 10, levels: [1] },
    { wave: 20, levels: [2] },
    { wave: 30, levels: [3] }
  ]);
});
