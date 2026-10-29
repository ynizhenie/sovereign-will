import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: what lies under the fog's full dark isn't drawn

test('sticks and ground pieces on tiles never seen are not drawn; seen, they are (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    window.sim.helpers.clearResources();
    resetTileIndex();
    // far from the hall, in the dark: sticks on a few tiles
    const g = getGridPos(townHall.x, townHall.y);
    const far = { gx: Math.min(COLS - 20, g.gx + 60), gy: g.gy };
    for (let i = 0; i < 6; i++) sticks.push({ x: (far.gx + i) * TILE_SIZE + 15, y: far.gy * TILE_SIZE + 15, hp: 1, maxHp: 1, priority: 0 });
    camera.x = (far.gx + 3) * TILE_SIZE; camera.y = far.gy * TILE_SIZE;
    setZoom(getMaxZoom() * 0.7);
    // (a stick: a stroke in its brown, or one of the small pictures nature is laid down from close up)
    const drawn = () => { let n = 0; const s = ctx.stroke, d = ctx.drawImage; ctx.stroke = function (...a) { if (ctx.strokeStyle === '#8e5a2b') n++; return s.apply(this, a); }; ctx.drawImage = function (...a) { if (a[0].width < 120) n++; return d.apply(this, a); }; render(); ctx.stroke = s; ctx.drawImage = d; return n; };
    const dark = drawn();
    importFog({ cols: COLS, rows: ROWS, explored: btoa(String.fromCharCode(255).repeat(Math.ceil(COLS * ROWS / 8))) });
    const seen = drawn();
    return { dark, seen };
  });
  expect(r.dark).toBe(0);
  expect(r.seen).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a piece of the ground wholly in the dark is not laid down; one at the edge of what is seen is (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    setZoom(getMinZoom());
    camera.x = townHall.x; camera.y = townHall.y;
    const images = () => { let n = 0; const d = ctx.drawImage; ctx.drawImage = function (...a) { n++; return d.apply(this, a); }; for (let i = 0; i < 30; i++) render(); ctx.drawImage = d; return n; };
    const partly = images();
    importFog({ cols: COLS, rows: ROWS, explored: btoa(String.fromCharCode(255).repeat(Math.ceil(COLS * ROWS / 8))) });
    const all = images();
    return { partly, all };
  });
  expect(r.partly).toBeGreaterThan(0); // (the start's land: laid down)
  expect(r.all).toBeGreaterThan(r.partly); // (all of the map seen: more pieces)
  expect(errors).toEqual([]);
});

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
