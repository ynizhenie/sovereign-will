import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('Endless: pick your faction and the enemy\'s, each with a colour the other side can\'t have (#43)', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#faction-player [data-faction="humans"]')).toHaveClass(/active/);
  await expect(page.locator('#faction-player [data-faction="undead"]')).toBeEnabled();
  await expect(page.locator('#faction-player [data-faction="demons"]')).toBeEnabled();
  await expect(page.locator('#faction-player [data-faction="demons"]')).toHaveText('Демоны');
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


test('switching to the undead: no other faction\'s items or tab left in the panel; the limit hint names a grave (#200)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.click('[data-arg="tab-farming"]'); // a humans' tab left open
  await page.evaluate(() => exitToMainMenu());
  await page.evaluate(() => showMenuScreen('endless'));
  await page.click('#faction-player [data-faction="undead"]');
  await page.click('#play-button');
  const r = await page.evaluate(() => ({
    tab: document.querySelector('.tab-pane.active').id,
    held: [...document.querySelectorAll('#group-toolsHeld-members div')].map(d => d.querySelector('b').id),
    canButtons: ['btn-wateringCan', 'btn-hoe', 'btn-medbag'].map(id => document.getElementById(id)?.hidden ?? 'none')
  }));
  expect(r.tab).toBe('tab-build');
  expect(r.held).toContain('held-tools-necro_staff-txt');
  expect(r.held.filter(id => /wateringCan|hoe|medbag/.test(id))).toEqual([]);
  expect(r.canButtons).toEqual([true, 'none', 'none']);
  await page.evaluate(() => { stock.bones = 999; stock.rot = 999; settlers = settlers.concat(settlers, settlers); spawnSettler(getPlayerFaction().startUnits); });
  await expect(page.locator('#toast-notification')).toContainText('Могила');
});
