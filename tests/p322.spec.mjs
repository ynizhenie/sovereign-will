import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #322: smoother, and lighter for a phone

test('a frame between two steps draws what moves between them, then puts it back; the camera on the one possessed with it (#322)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 40, rows: 40 }; window.sim.start('between');
    isPaused = true;
    const s = settlers[0];
    rememberPositions();
    const from = { x: s.x, y: s.y };
    s.x += 10; s.y -= 6;
    let seen = null;
    drawBetweenSteps(0.5, () => { seen = { x: s.x, y: s.y }; });
    const back = { x: s.x, y: s.y };
    // a jump (a portal, a ghost back by its grave) isn't smoothed
    rememberPositions(); s.x += 300;
    let jumped = null;
    drawBetweenSteps(0.5, () => { jumped = s.x; });
    // possessed: the camera with it
    rememberPositions(); s.isPossessed = true; camera.x = s.x; const cx = camera.x; s.x += 8;
    let cam = null;
    drawBetweenSteps(0.5, () => { cam = camera.x; });
    s.isPossessed = false;
    return { from, seen, back, jumped, landed: s.x - 8, cam, cx, cameraBack: camera.x };
  });
  expect(r.seen).toEqual({ x: r.from.x + 5, y: r.from.y - 3 });
  expect(r.back).toEqual({ x: r.from.x + 10, y: r.from.y - 6 });
  expect(r.jumped).toBe(r.landed);
  expect(r.cam).toBeCloseTo(r.cx + 4, 5);
  expect(r.cameraBack).toBe(r.cx);
  expect(errors).toEqual([]);
});

test('the night\'s dark is drawn small and laid over stretched; a busy wave renders without errors (#322)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 128, rows: 128 }; window.sim.start('night-busy');
    const { makeSettler } = window.sim.helpers;
    for (let i = 0; i < 20; i++) settlers.push(makeSettler(300 + i, townHall.x + (i % 5) * 30, townHall.y + 80 + Math.floor(i / 5) * 30, i % 2 ? { weapon: 'sword', role: 'soldier' } : {}));
    waveNum = 6; startNextWave(); window.sim.run(8, { holdWaves: false });
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 10;
    isPaused = true; render();
    return { enemies: enemies.length, dark: getDarkness() > 0.3 };
  });
  expect(r.dark).toBe(true);
  expect(r.enemies).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
