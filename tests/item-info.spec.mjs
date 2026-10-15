import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// What a thing in a sheet is and does (#213): a card with its name, a line about it and its numbers

test('pointing at a button in a sheet shows what it is: its name, a line about it and its numbers', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.click('[data-arg="tab-weapons"]');
  await page.hover('#btn-spear');
  const card = page.locator('#info-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Копье');
  await expect(card).toContainText('Бьёт дальше');
  await expect(card).toContainText('Урон: 25');
  await page.hover('#btn-armor');
  await expect(card).toContainText('Здоровье: +50');
  await expect(card).toContainText('Урон по носящему: −35%');
  await page.click('[data-arg="tab-build"]');
  await page.hover('#btn-watchtower');
  await expect(card).toContainText('Лучников: 1');
  await page.mouse.move(5, 5);
  await expect(card).toBeHidden();
});

test('every button with a card has a line about it, in every language', async ({ page }) => {
  await openGame(page);
  const missing = await page.evaluate(() => {
    const out = [];
    for (const language of ['en', 'ru', 'uk']) {
      setLanguage(language);
      for (const category of ['settlerTypes', 'tools', 'weapons', 'gear', 'buildings', 'recipes']) {
        for (const item of Object.values(GAME_CONFIG[category])) if (!item.desc) out.push(`${language} ${category}:${item.id}`);
      }
    }
    setLanguage('ru');
    return out;
  });
  expect(missing).toEqual([]);
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });
  test('the first tap on a button shows its card and doesn\'t press it; a second tap presses it (the friend\'s playtest)', async ({ page }) => {
    await openGame(page);
    await page.click('#play-button');
    await page.evaluate(() => { stock.food = 100; updateUI(); });
    await page.tap('[data-arg="tab-tools"]');
    const settlers0 = await page.evaluate(() => settlers.length);
    await page.tap('#btn-hire-normal');
    await expect(page.locator('#info-card')).toContainText('Рабочий');
    await expect(page.locator('#btn-hire-normal')).toHaveClass(/armed/);
    expect(await page.evaluate(() => settlers.length)).toBe(settlers0); // not hired yet
    await page.tap('#btn-hire-normal');
    expect(await page.evaluate(() => settlers.length)).toBe(settlers0 + 1);
    await page.tap('#btn-hire-normal'); // and again
    expect(await page.evaluate(() => settlers.length)).toBe(settlers0 + 2);
    // another button: its card first
    await page.tap('[data-arg="tab-build"]');
    await page.tap('#btn-wall_wood');
    await expect(page.locator('#info-card')).toContainText('Деревянная стена');
    expect(await page.evaluate(() => buildMode)).toBe('interact');
    await page.tap('#btn-wall_wood');
    expect(await page.evaluate(() => buildMode)).toBe('wall_wood');
  });
});
