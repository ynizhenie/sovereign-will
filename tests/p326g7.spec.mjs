import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, the 26.10 list, 28: the looks editor

test('Settings → Looks: each variation drawn with its chance; a chance, a colour, a new coat change the game and are kept on the device; Reset puts it back (#326, 26.10, 28)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { localStorage.removeItem('sovereign-will-looks'); showMenuScreen('settings'); });
  await page.click('#open-looks');
  await expect(page.locator('[data-screen="looks"]')).toBeVisible();
  // people: five and five hairstyles, each drawn, a chance each
  await expect(page.locator('#looks-pane .look-card canvas')).not.toHaveCount(0);
  const styles = await page.locator('#looks-pane [data-look-weight]').count();
  expect(styles).toBe(10);
  // a hair colour changed
  await page.locator('#looks-pane [data-look-colour="0"]').first().fill('#ff0000');
  await page.locator('#looks-pane [data-look-colour="0"]').first().dispatchEvent('change');
  expect(await page.evaluate(() => GAME_CONFIG.looks.hair.humans[0])).toBe('#ff0000');
  // boars: the first coat's chance to 0, the rest's stays; kept
  await page.click('[data-looks-tab="boars"]');
  const w = page.locator('#looks-pane [data-look-weight]').first();
  await w.fill('0'); await w.dispatchEvent('change');
  expect(await page.evaluate(() => GAME_CONFIG.mapResources.boar.looks.coats[0][3])).toBe(0);
  // pets: a new dog coat, every other's chance 0: a new dog has it
  await page.click('[data-looks-tab="pets"]');
  const before = await page.evaluate(() => GAME_CONFIG.pets.coats.dog.length);
  await page.locator('#looks-pane .look-add').first().click();
  const added = await page.evaluate(() => {
    const coats = GAME_CONFIG.pets.coats.dog;
    coats.forEach((c, i) => { c[2] = i === coats.length - 1 ? 1 : 0; });
    const picks = new Set(); for (let i = 0; i < 20; i++) picks.add(newPetLook('dog').coat);
    return { length: coats.length, picks: [...picks] };
  });
  expect(added.length).toBe(before + 1);
  expect(added.picks).toEqual([before]);
  // dummies: only the shield's chance left: a new dummy is a shield
  await page.click('[data-looks-tab="dummies"]');
  const dummies = page.locator('#looks-pane [data-look-weight]');
  const n = await dummies.count();
  for (let i = 0; i < n - 1; i++) { await dummies.nth(i).fill('0'); await dummies.nth(i).dispatchEvent('change'); }
  expect(await page.evaluate(() => DUMMY_VARIANTS.filter(v => v[1] > 0).map(v => v[0]))).toEqual(['shield']);
  // kept: after a reload it's still so
  await page.reload();
  const kept = await page.evaluate(() => ({ hair: GAME_CONFIG.looks.hair.humans[0], boar: GAME_CONFIG.mapResources.boar.looks.coats[0][3], dogs: GAME_CONFIG.pets.coats.dog.length }));
  expect(kept).toEqual({ hair: '#ff0000', boar: 0, dogs: before + 1 });
  // Reset all: as it came
  await page.evaluate(() => showMenuScreen('settings'));
  await page.click('#open-looks');
  await page.click('#looks-reset-all');
  const reset = await page.evaluate(() => ({ hair: GAME_CONFIG.looks.hair.humans[0], boar: GAME_CONFIG.mapResources.boar.looks.coats[0][3], dogs: GAME_CONFIG.pets.coats.dog.length, saved: localStorage.getItem('sovereign-will-looks') }));
  expect(reset).toEqual({ hair: '#3e2723', boar: 40, dogs: before, saved: '{}' });
  expect(errors).toEqual([]);
});
