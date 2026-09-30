import { test, expect } from '@playwright/test';

// These open the game themselves: helpers.openGame switches it to Russian for the other tests
async function openFresh(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  return errors;
}

test('the game starts in English (#41)', async ({ page }) => {
  const errors = await openFresh(page);
  await expect(page.locator('#play-button')).toHaveText('PLAY');
  await expect(page.locator('#btn-hire-normal')).toHaveText('👨‍🌾 Worker (15🍞)');
  await expect(page.locator('.tab-btn').first()).toHaveText('🏗️ Building');
  await expect(page.locator('#language-options button.active')).toHaveText('English');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(errors).toEqual([]);
});

test('picking Ukrainian in the menu switches every text, and is remembered (#41)', async ({ page }) => {
  await openFresh(page);
  await page.click('#open-settings');
  await page.click('#language-options button[data-language="uk"]');
  await page.click('#main-menu [data-screen="settings"] [data-back]');
  await page.click('#mode-endless');
  await expect(page.locator('#play-button')).toHaveText('ГРАТИ');
  await expect(page.locator('#btn-hire-normal')).toHaveText('👨‍🌾 Робітник (15🍞)');
  await expect(page.locator('#btn-wall_wood')).toHaveText('🪵 Дерев\'яна стіна (5🪵)');
  await expect(page.locator('.tab-btn').nth(1)).toHaveText('🌾 Фермерство');
  await expect(page.locator('#seed-reroll')).toHaveAttribute('title', 'Новий випадковий сід');
  await page.click('#play-button');
  await expect(page.locator('#group-materials')).toContainText('Матеріали');
  const toast = await page.evaluate(() => { repairAllBuildings(); return document.getElementById('toast-notification').innerText; });
  expect(toast).toBe('✅ Усе ціле');
  // remembered on the device
  await page.reload();
  await expect(page.locator('#mode-endless')).toHaveText('Нескінченний');
  await page.click('#open-settings');
  await expect(page.locator('#language-options button.active')).toHaveText('Українська');
});

test('every language has every text and every name (#41)', async ({ page }) => {
  await openFresh(page);
  const gaps = await page.evaluate(() => {
    const missing = [];
    const en = LANGUAGES.en;
    for (const [code, language] of Object.entries(LANGUAGES)) {
      for (const key of Object.keys(en.text)) if (!(key in language.text)) missing.push(`${code} text ${key}`);
      for (const key of Object.keys(language.text)) if (!(key in en.text)) missing.push(`${code} extra text ${key}`);
      for (const [category, items] of Object.entries(GAME_CONFIG)) {
        if (!en.names[category]) continue;
        for (const item of Array.isArray(items) ? items : Object.values(items)) {
          const needsName = category !== 'resourceGroups' || item.members.length > 1;
          if (needsName && !(language.names[category] || {})[item.id]) missing.push(`${code} name ${category}.${item.id}`);
        }
      }
    }
    // and every text the page marks exists
    for (const el of document.querySelectorAll('[data-i18n], [data-i18n-title]')) {
      const key = el.dataset.i18n || el.dataset.i18nTitle;
      if (!(key in en.text)) missing.push(`page ${key}`);
    }
    return missing;
  });
  expect(gaps).toEqual([]);
});
