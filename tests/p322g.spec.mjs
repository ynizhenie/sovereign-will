import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: the canvas's resolution follows how the frames come

test('slow frames lower the canvas resolution, frames with room raise it again, a hitch counts for nothing; the view stays the same size (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    resolution.on = true; resolution.index = 0; resolution.frameEma = 16.7; resolution.workEma = 4; resolution.slowFor = 0; resolution.fastFor = 0; resolution.hold = 5000; resolution.lastChange = -Infinity; resolution.lastDown = -Infinity;
    setRenderFactor(1); fitCanvasToScreen();
    const out = { start: canvas.width };
    const cssSeen = () => canvas.width / screenPixelRatio;
    out.cssBefore = cssSeen();
    let now = 100000;
    const frames = (ms, work, seconds) => { for (let t = 0; t < seconds * 1000; t += ms) { now += ms; adaptResolution(now, ms, work, 1000 / 60); fitCanvasToScreen(); } };
    frames(1000, 4, 5); // (hitches: a tab put away)
    out.afterHitch = resolution.index;
    frames(40, 30, 4);
    out.afterSlow = { index: resolution.index, width: canvas.width };
    out.cssAfter = cssSeen();
    frames(16.7, 4, 12);
    out.afterRoom = { index: resolution.index, width: canvas.width };
    return out;
  });
  expect(r.afterHitch).toBe(0);
  expect(r.afterSlow.index).toBeGreaterThanOrEqual(1);
  expect(r.afterSlow.width).toBeLessThan(r.start);
  expect(Math.abs(r.cssAfter - r.cssBefore)).toBeLessThan(1); // (the canvas is the same size on the page)
  expect(r.afterRoom.index).toBeLessThan(r.afterSlow.index);
  expect(errors).toEqual([]);
});

test('a lower resolution keeps what is on the screen where it was: the same part of the world, the same zoom (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    camera.x = townHall.x; camera.y = townHall.y; setZoom(getMaxZoom() * 0.5);
    setRenderFactor(1); fitCanvasToScreen();
    const rect = () => { const v = getViewRect(); return [Math.round(v.x1 - v.x0), Math.round(v.y1 - v.y0)]; };
    const before = rect(), zoomBefore = camera.zoom;
    setRenderFactor(0.5); fitCanvasToScreen();
    const after = rect();
    for (let i = 0; i < 5; i++) render();
    setRenderFactor(1); fitCanvasToScreen();
    return { before, after, same: Math.abs(camera.zoom - zoomBefore) < 1e-9 };
  });
  expect(Math.abs(r.after[0] - r.before[0])).toBeLessThanOrEqual(3);
  expect(Math.abs(r.after[1] - r.before[1])).toBeLessThanOrEqual(3);
  expect(r.same).toBe(true);
  expect(errors).toEqual([]);
});
