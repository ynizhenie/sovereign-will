import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('Endless: pick your faction and the enemy\'s, each with a colour the other side can\'t have (#43)', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#faction-player [data-faction="humans"]')).toHaveClass(/active/);
  await expect(page.locator('#faction-player [data-faction="undead"]')).toBeEnabled();
  await expect(page.locator('#faction-player [data-faction="demons"]')).toBeDisabled();
  await expect(page.locator('#faction-player [data-faction="demons"]')).toHaveText('Демоны · скоро');
  // the enemy's colour can't be yours, and the other way round
  await expect(page.locator('#colors-player [data-color="#e8572a"]')).toBeDisabled();
  await expect(page.locator('#colors-enemy [data-color="#e9c46a"]')).toBeDisabled();
  await page.click('#colors-player [data-color="#3498db"]');
  await expect(page.locator('#colors-player [data-color="#3498db"]')).toHaveClass(/active/);
  await expect(page.locator('#colors-enemy [data-color="#3498db"]')).toBeDisabled();
  await expect(page.locator('#colors-enemy [data-color="#e9c46a"]')).toBeEnabled();
  // remembered on the device
  await page.reload();
  await page.evaluate(() => showMenuScreen('endless'));
  expect(await page.evaluate(() => sides.player.color)).toBe('#3498db');
});

test('units are drawn in their side\'s colour; waves are the enemy faction\'s kinds (#43)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    sides.player.color = '#3498db'; sides.enemy.color = '#9b59b6';
    window.sim.start('faction-colours');
    waveNum = 11; startNextWave();
    const kinds = new Set(enemies.map(en => en.enemyKey));
    return {
      settler: getSettlerColor(), enemy: getEnemyColor({ type: 'normal' }), bigDarker: getEnemyColor({ type: 'big' }) !== '#9b59b6',
      kindsFromFaction: [...kinds].every(k => getEnemyFaction().enemies.includes(k)), enemies: enemies.length
    };
  });
  expect(r).toMatchObject({ settler: '#3498db', enemy: '#9b59b6', bigDarker: true, kindsFromFaction: true });
  expect(r.enemies).toBeGreaterThan(0);
});

test('a settler type can be limited to some kinds of orders (#133)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    window.sim.start('orders-limited');
    window.showNotification = () => {};
    const s = settlers[0];
    s.isPossessed = true; s.tool = 'axe';
    const tree = trees.find(t => !t.isGrowing);
    GAME_CONFIG.settlerTypes.normal.orders = ['attack'];
    const limited = orderPossessed(s, tree.x, tree.y) ? s.order && s.order.kind : null;
    delete GAME_CONFIG.settlerTypes.normal.orders;
    orderPossessed(s, tree.x, tree.y);
    return { limited, free: s.order && s.order.kind };
  });
  expect(r).toEqual({ limited: null, free: 'harvest' });
});
