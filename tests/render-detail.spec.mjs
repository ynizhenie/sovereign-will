import { test, expect, openGame } from './helpers.mjs';

test('reduces unit detail at overview zoom and in crowded worlds', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const detailModes = await page.evaluate(() => {
    isPaused = true;
    setZoom(getMinZoom());
    const overview = simpleUnit();
    setZoom(getMaxZoom());
    settlers = Array.from({ length: 200 }, () => ({}));
    enemies = [];
    scouts = [];
    const crowded = simpleUnit();
    setZoom(getMinZoom());
    const tinyOverview = tinyUnit();
    settlers = settlers.slice(0, 1);
    setZoom(getMaxZoom());
    const ordinary = simpleUnit();
    return { overview, crowded, tinyOverview, ordinary };
  });

  expect(detailModes).toEqual({ overview: true, crowded: true, tinyOverview: true, ordinary: false });
});
