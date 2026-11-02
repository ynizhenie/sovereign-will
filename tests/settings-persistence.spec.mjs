import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('Endless setup and map-generator choices survive reload', async ({ page }) => {
  await openGame(page);
  await page.locator('[data-difficulty="hard"]').click();
  await page.locator('[data-cards="on"]').click();
  await page.locator('[data-wave-interval="custom"]').click();
  await page.locator('#wave-custom').fill('444');
  await page.locator('#wave-custom').dispatchEvent('change');
  await page.locator('[data-map-size="custom"]').click();
  await page.locator('#map-cols').fill('160');
  await page.locator('#map-cols').dispatchEvent('change');
  await page.locator('#map-rows').fill('176');
  await page.locator('#map-rows').dispatchEvent('change');
  await page.locator('#seed-input').fill('remember-this-seed');
  await page.locator('#open-generator').click();
  const ironSpawners = page.locator('#generator-fields input[data-key="ironSpawners"]').first();
  await ironSpawners.fill('12');
  await ironSpawners.dispatchEvent('change');

  await page.reload();
  await page.evaluate(() => showMenuScreen('endless'));
  await expect(page.locator('[data-difficulty="hard"]')).toHaveClass(/active/);
  await expect(page.locator('[data-cards="on"]')).toHaveClass(/active/);
  await expect(page.locator('[data-wave-interval="custom"]')).toHaveClass(/active/);
  await expect(page.locator('#wave-custom')).toHaveValue('444');
  await expect(page.locator('[data-map-size="custom"]')).toHaveClass(/active/);
  await expect(page.locator('#map-cols')).toHaveValue('160');
  await expect(page.locator('#map-rows')).toHaveValue('176');
  await expect(page.locator('#seed-input')).toHaveValue('remember-this-seed');

  await page.locator('#open-generator').click();
  await expect(page.locator('#generator-fields input[data-key="ironSpawners"]').first()).toHaveValue('12');
});

test('battle settings survive reload', async ({ page }) => {
  await openGame(page);
  await page.locator('[data-screen="endless"] [data-back]').click();
  await page.locator('#mode-battles').click();
  await page.locator('[data-dock="battle-settings"]').click();
  await page.locator('[data-battle-field="desert"]').click();
  await page.locator('[data-battle-look="time"][data-value="night"]').click();
  await page.locator('[data-battle-look="weather"][data-value="storm"]').click();
  await page.locator('[data-battle-difficulty="hard"]').click();
  await page.locator('#battle-music [data-theme="demons"]').click();
  await page.locator('[data-battle-category="buildings"]').click();
  await page.reload();

  await page.evaluate(() => showMenuScreen('endless'));
  await page.locator('[data-screen="endless"] [data-back]').click();
  await page.locator('#mode-battles').click();
  await expect(page.locator('#battle-panel')).toHaveAttribute('data-category', 'buildings');
  await page.locator('[data-dock="battle-settings"]').click();
  await expect(page.locator('[data-battle-field="desert"]')).toHaveClass(/on/);
  await expect(page.locator('[data-battle-look="time"][data-value="night"]')).toHaveClass(/on/);
  await expect(page.locator('[data-battle-look="weather"][data-value="storm"]')).toHaveClass(/on/);
  await expect(page.locator('[data-battle-difficulty="hard"]')).toHaveClass(/on/);
  await expect(page.locator('#battle-music [data-theme="demons"]')).toHaveClass(/on/);
});

test('map-editor setup choices survive reload', async ({ page }) => {
  await openGame(page);
  await page.locator('[data-screen="endless"] [data-back]').click();
  await page.locator('#mode-editor').click();
  await page.locator('[data-editor-size="custom"]').click();
  await page.locator('#editor-map-cols').fill('208');
  await page.locator('#editor-map-cols').dispatchEvent('change');
  await page.locator('#editor-map-rows').fill('224');
  await page.locator('#editor-map-rows').dispatchEvent('change');
  await page.locator('#editor-faction [data-faction="demons"]').click();
  await page.reload();

  await page.evaluate(() => showMenuScreen('endless'));
  await page.locator('[data-screen="endless"] [data-back]').click();
  await page.locator('#mode-editor').click();
  await expect(page.locator('[data-editor-size="custom"]')).toHaveClass(/active/);
  await expect(page.locator('#editor-map-cols')).toHaveValue('208');
  await expect(page.locator('#editor-map-rows')).toHaveValue('224');
  await expect(page.locator('#editor-faction [data-faction="demons"]')).toHaveClass(/active/);
});
