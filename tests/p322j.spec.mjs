import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: tufts of grass in pictures zoomed out

test('zoomed out the tufts of grass come from pictures, still; closer each from a picture leaning with the wind (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    importFog({ cols: COLS, rows: ROWS, explored: btoa(String.fromCharCode(255).repeat(Math.ceil(COLS * ROWS / 8))) });
    const g = getGridPos(townHall.x, townHall.y);
    for (let i = 0; i < 12; i++) grassList.push({ x: townHall.x + (i - 6) * 40, y: townHall.y + 120, hp: 1, maxHp: 1, priority: 0 });
    camera.x = townHall.x; camera.y = townHall.y + 100;
    const greens = ['#2ecc71', '#27ae60', '#58d68d'];
    // (grass strokes on the screen itself; and the small pictures nature is laid down from close up, #322)
    const live = scale => {
      setZoom(scale / getBaseScale()); for (let i = 0; i < 30; i++) render();
      let n = 0, pictures = 0; const s = ctx.stroke, d = ctx.drawImage;
      ctx.stroke = function (...a) { if (greens.includes(String(ctx.strokeStyle))) n++; return s.apply(this, a); };
      ctx.drawImage = function (...a) { if (a[0].width < 120) pictures++; return d.apply(this, a); };
      render(); ctx.stroke = s; ctx.drawImage = d; return { strokes: n, pictures };
    };
    return { far: live(0.45), near: live(1.2) };
  });
  expect(r.far.strokes).toBe(0);
  expect(r.near.pictures).toBeGreaterThanOrEqual(12); // (the twelve tufts, each from its picture as the wind leans it)
  expect(errors).toEqual([]);
});
