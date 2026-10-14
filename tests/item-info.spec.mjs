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
  test('a long press shows the card and doesn\'t press the button; a tap still does', async ({ page }) => {
    await openGame(page);
    await page.click('#play-button');
    await page.evaluate(() => { stock.food = 100; updateUI(); });
    await page.tap('[data-arg="tab-tools"]');
    const hire = page.locator('#btn-hire-normal');
    const box = await hire.boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const settlers0 = await page.evaluate(() => settlers.length);
    // a long press: down, held, up
    await hire.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: at.x, clientY: at.y, bubbles: true });
    await page.waitForTimeout(600);
    await expect(page.locator('#info-card')).toContainText('Рабочий');
    await hire.dispatchEvent('pointerup', { pointerType: 'touch', bubbles: true });
    await hire.dispatchEvent('touchend', { bubbles: true, cancelable: true });
    await hire.dispatchEvent('click', { bubbles: true, cancelable: true });
    expect(await page.evaluate(() => settlers.length)).toBe(settlers0);
    // a plain tap hires
    await page.tap('#btn-hire-normal');
    expect(await page.evaluate(() => settlers.length)).toBe(settlers0 + 1);
  });
});
