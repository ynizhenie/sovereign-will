import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('switching to any tab goes back to the Point mode (#80)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  for (const tab of ['tab-build', 'tab-farming', 'tab-tools', 'tab-weapons']) {
    const mode = await page.evaluate(tab => {
      setMode('wall_wood');
      switchTab(document.querySelector(`.tab-btn[onclick*="${tab}"]`), tab);
      return buildMode;
    }, tab);
    expect([tab, mode]).toEqual([tab, 'interact']);
  }
});
