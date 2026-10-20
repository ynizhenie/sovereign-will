import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's batch of fixes (#279), part A1: the bugs
test('soldiers on their posts go at archers shooting from off past them, and don\'t turn back half way (#279, 10)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'archersOffPost', {});
  expect(r.backToPost).toBe(0);
  expect(r.clearedAt).toBeGreaterThan(0);
  expect(r.clearedAt).toBeLessThan(5.5);
});

test('ones asleep don\'t push a settler walking past them (#279, 11)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'pastSleepers', {});
  expect(r.asleep).toBe(0);
  expect(r.awake).toBeGreaterThan(0);
});

test('possessing one asleep wakes it (#279, 18)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'possessSleeper', {})).toEqual({ possessed: true, asleep: false });
});

test('a necromancer heals its own calmly with an enemy close by, and itself last (#279, 21, 22)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'calmNecromancer', {});
  expect(r.moved).toBeLessThan(12);
  expect(r.healed).toBe(true);
  expect(r.selfHealed).toBe(true);
});

test('given a new tool, the old one goes into the store whole (#279, 24)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'oldToolStored', {})).toEqual({ tool: 'pickaxe', stored: 1 });
});

test('a build ordered comes before carrying a corpse (#279, 39)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'orderBeforeCorpse', {});
  expect(r).toEqual({ carryingCorpse: false, hauled: false, built: true });
});

test('what was picked in the editor isn\'t on the chip in the next game (#279, 36)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => startEditor({ cols: 30, rows: 30, generate: false }));
  await page.click('[data-editor-category="nature"]');
  await page.click('#editor-tools [data-tool="boar"]');
  await expect(page.locator('#placing-chip')).toBeVisible();
  await page.evaluate(() => { leaveEditor(); showMenuScreen('endless'); });
  await page.click('#play-button');
  await expect(page.locator('#placing-chip')).toBeHidden();
});
