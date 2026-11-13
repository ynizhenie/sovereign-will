import { test, expect, openGame } from './helpers.mjs';

// The ground's pictures (world.draw.js) are painted twice as fine zoomed in, so the small things in them aren't stretched soft
test('zoomed in the ground is laid down from pictures twice as fine; as the size changes no piece is left bare', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    // the widest picture of the ground laid down in a frame, and how many of them
    const frame = () => {
      let widest = 0, pieces = 0, flat = 0;
      const drawImage = ctx.drawImage, fillRect = ctx.fillRect;
      ctx.drawImage = function (...args) { if (args[0].width >= 400) { pieces++; widest = Math.max(widest, args[0].width); } return drawImage.apply(this, args); };
      // (a piece with no picture is a flat fill of the grass's colour the size of the piece)
      ctx.fillRect = function (...args) { if (args[2] >= 400 && ctx.fillStyle === '#2d4a22') flat++; return fillRect.apply(this, args); };
      try { render(); } finally { ctx.drawImage = drawImage; ctx.fillRect = fillRect; }
      return { widest, pieces, flat, holes: chunkStats().holes };
    };
    const settle = () => { let last; for (let i = 0; i < 40; i++) last = frame(); return last; };
    const piece = CHUNK * TILE_SIZE;
    setZoom(0.9 / getBaseScale()); // (a screen pixel to a world unit, about)
    const far = settle();
    setZoom(3 / getBaseScale());
    const crossing = frame(), near = settle();
    setZoom(0.9 / getBaseScale());
    const back = frame(), farAgain = settle();
    return { piece, scale: getViewScale(), far, crossing, near, back, farAgain };
  });
  expect(r.far.widest).toBeLessThan(r.piece * 1.5);
  expect(r.near.widest).toBeGreaterThan(r.piece * 1.9);
  expect(r.farAgain.widest).toBeLessThan(r.piece * 1.5);
  // the frame the size changes in: the pieces not painted at the new size yet show their old pictures
  for (const at of [r.crossing, r.back]) { expect(at.holes).toBe(0); expect(at.flat).toBe(0); expect(at.pieces).toBeGreaterThan(0); }
  expect(errors).toEqual([]);
});
