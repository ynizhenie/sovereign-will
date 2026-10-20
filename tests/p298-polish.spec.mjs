import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #298, its last comment: hired in armour, the frame rate zoomed out, loads in hand, the armour

test('one hired comes with no armour, drawn or named (#298, c3.1)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    stock.food = 999;
    const before = settlers.length;
    spawnSettler('normal');
    const s = settlers[settlers.length - 1];
    game.selectedSettler = s; updateUI(); render();
    return { hired: settlers.length > before, armour: armorOf(s), named: document.body.textContent.includes(t('hud.ironArmor')) };
  });
  expect(r).toEqual({ hired: true, armour: null, named: false });
  expect(errors).toEqual([]);
});

test('the ground drawn zoomed out from one picture, painted again once a tile changes; zoomed in, as ever (#298, c3.2)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    setZoom(-99); isPaused = true;
    render();
    const a = getTileIndex().signature;
    render();
    const same = getTileIndex().signature === a;
    naturalRocks.splice(0, 1); resetTileIndex();
    render();
    const changed = getTileIndex().signature !== a;
    setZoom(99); render();
    return { same, changed };
  });
  expect(r).toEqual({ same: true, changed: true });
  expect(errors).toEqual([]);
});
