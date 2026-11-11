import { test, expect, openGame } from './helpers.mjs';

// The trial of the graphics card's canvas (engine/platform/gl.js): on from Settings, used from the next start
test('with WebGL on, the ground, nature and shadows are drawn on a canvas under the game\'s, and the game\'s is clear there', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sovereign-will-gl', 'on'); } catch (e) { /* none */ } });
  const errors = await openGame(page);
  await page.click('#play-button');
  await page.waitForFunction(() => glReady());
  const r = await page.evaluate(() => {
    isPaused = true;
    setZoom(getMaxZoom() * 0.5);
    for (let i = 0; i < 6; i++) render(); // (the ground's pieces painted)
    let drawn = 0;
    const drawImage = ctx.drawImage;
    ctx.drawImage = function (...args) { drawn++; return drawImage.apply(this, args); };
    try { render(); } finally { ctx.drawImage = drawImage; }
    const card = document.getElementById('worldCanvas');
    return {
      card: !!card, before: !!card && card.nextElementSibling === canvas, size: card ? [card.width, card.height] : null, game: [canvas.width, canvas.height],
      // a corner of the game's canvas with nothing of its own drawn there: clear, the ground shows from under it
      trees: depthSortedTrees().length, grass: game.grassList.length, drawn
    };
  });
  expect(r.card).toBe(true);
  expect(r.before).toBe(true);
  expect(r.size).toEqual(r.game);
  expect(r.trees).toBeGreaterThan(20);
  expect(r.drawn).toBeLessThan(r.trees); // (the trees' pictures, the tufts and the ground's pieces are not laid down on the game's canvas)
  expect(errors).toEqual([]);
});

test('with WebGL off (as it is to begin with) there is no second canvas', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  expect(await page.evaluate(() => [GL, glReady(), !!document.getElementById('worldCanvas')])).toEqual([false, false, false]);
  expect(await page.locator('[data-gl="off"]').getAttribute('class')).toContain('active');
  expect(errors).toEqual([]);
});
