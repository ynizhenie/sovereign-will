import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322 (Lima3399): no pop-in. The pieces of the ground on the screen are always laid down from their own pictures:
// a pan, a jump across the map or the fog changes nothing of that; offscreen the pieces round the screen are painted ahead

test('panning fast, jumping across the map and under the fog, every piece on the screen is laid down at once (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    setZoom(0.6 / getBaseScale() * screenPixelRatio);
    camera.x = townHall.x; camera.y = townHall.y;
    for (let i = 0; i < 5; i++) render();
    let holes = 0, pending = 0, frames = 0;
    const frame = () => { render(); holes += chunkStats().holes; pending += chunkStats().pending; frames++; };
    // fast: a third of a screen a frame, right then down
    for (let i = 0; i < 20; i++) { camera.x += 400; clampCamera(); frame(); }
    for (let i = 0; i < 20; i++) { camera.y += 300; clampCamera(); frame(); }
    // a jump across the map (a tap on the world map), dark or not
    camera.x = WORLD_WIDTH * 0.2; camera.y = WORLD_HEIGHT * 0.8; clampCamera(); frame();
    camera.x = WORLD_WIDTH * 0.8; camera.y = WORLD_HEIGHT * 0.2; clampCamera(); frame();
    return { holes, pending, frames };
  });
  expect(r.frames).toBe(42);
  expect(r.holes).toBe(0);
  expect(r.pending).toBeGreaterThan(0); // (the light previews cover the screen while detailed pieces catch up)
  expect(errors).toEqual([]);
});

test('the pieces round the screen are painted ahead: a step of the camera finds them ready (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    setZoom(0.6 / getBaseScale() * screenPixelRatio);
    camera.x = townHall.x; camera.y = townHall.y;
    for (let i = 0; i < 120; i++) render(); // (two seconds: time for the ring to be painted)
    // a step of half a piece: the pieces on the screen that had to be painted on the spot
    camera.x += 240; camera.y += 240; clampCamera(); render();
    return { late: chunkStats().late };
  });
  expect(r.late).toBe(0);
  expect(errors).toEqual([]);
});
