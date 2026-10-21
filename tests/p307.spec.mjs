import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #307: shores and sand edges soft (1), rock and water outlines whole at the corners (2), shadows by
// the sun (3)
test('outer corners rounded, inner corners joined; the sun\'s shadows by the time of day; drawn zoomed in and out with no error (#307)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const keys = new Set(['30,0', '0,30']); // (neighbours north... a tile at 30,30: west and north of it filled, its north-west corner not)
    const inner = openSides(keys, 30, 30);
    const lone = cornerRadii(openSides(new Set(), 0, 0));
    const c = GAME_CONFIG.daytime, at = t => { dayTime = t; return getSun(); };
    const morning = at(5), noon = at(c.morning + c.day / 2), evening = at(c.morning + c.day + c.evening - 5), night = at(c.morning + c.day + c.evening + 10);
    isPaused = true;
    setZoom(-99); render(); setZoom(99); render();
    return { innerCorner: !inner.n && !inner.w && inner.nw, lone: [lone.nw, lone.ne, lone.se, lone.sw].every(k => k > 0),
      morning: morning.dx < -1, noon: Math.abs(noon.dx) < 0.1, evening: evening.dx > 1, night: night.alpha < 0.1 };
  });
  expect(r).toEqual({ innerCorner: true, lone: true, morning: true, noon: true, evening: true, night: true });
  expect(errors).toEqual([]);
});
