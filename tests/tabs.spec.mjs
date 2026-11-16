import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('switching to any tab goes back to the Point mode (#80)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  for (const tab of ['tab-build', 'tab-farming', 'tab-craft']) {
    const mode = await page.evaluate(tab => {
      setMode('wall_wood');
      switchTab(document.querySelector(`.tab-btn[data-arg="${tab}"]`), tab);
      return buildMode;
    }, tab);
    expect([tab, mode]).toEqual([tab, 'interact']);
  }
});

test('the base zone is hidden by default and can be toggled in Zones', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  await page.click('#tab-btn-farming');
  const result = await page.evaluate(() => {
    const button = document.getElementById('btn-base-zone');
    const stroke = ctx.stroke;
    let boundaries = 0;
    ctx.stroke = function (...args) {
      if (this.strokeStyle === 'rgba(255, 255, 255, 0.8)') boundaries++;
      return stroke.apply(this, args);
    };
    try {
      const defaultOff = game.showBaseZone === false && !button.classList.contains('on');
      const separateCategory = button.parentElement.previousElementSibling.dataset.i18n === 'panel.base';
      drawBaseZoneBoundary();
      const hiddenByDefault = boundaries === 0;
      button.style.transition = 'none';
      button.click();
      drawBaseZoneBoundary();
      const activeStyle = getComputedStyle(button);
      const activeColor = activeStyle.backgroundColor;
      const activeTextColor = activeStyle.color;
      const shown = game.showBaseZone && button.classList.contains('on') && boundaries === 1;
      button.click();
      drawBaseZoneBoundary();
      const hiddenAgain = !game.showBaseZone && !button.classList.contains('on') && boundaries === 1;
      button.click();
      window.sim.start('base-zone-default');
      const resetForNewGame = game.showBaseZone === false;
      return { defaultOff, separateCategory, hiddenByDefault, activeColor, activeTextColor, shown, hiddenAgain, resetForNewGame };
    } finally {
      ctx.stroke = stroke;
    }
  });
  expect(result).toEqual({
    defaultOff: true, separateCategory: true, hiddenByDefault: true,
    activeColor: 'rgb(17, 120, 100)', activeTextColor: 'rgb(255, 255, 255)',
    shown: true, hiddenAgain: true, resetForNewGame: true
  });
  expect(errors).toEqual([]);
});
