import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: nature (trees, cacti, boulders, bushes) drawn into the ground's pictures when zoomed out

// how many trunks (#5d4037 rectangles) a frame draws onto the screen itself, not into a picture
const trunks = `(() => {
  let n = 0; const fill = ctx.fillRect;
  ctx.fillRect = function (...a) { if (String(this.fillStyle) === '#5d4037') n++; return fill.apply(this, a); };
  for (let i = 0; i < 12; i++) render();
  ctx.fillRect = fill;
  return n;
})()`;

test('standing trees come from pictures: zoomed out the ground\'s, close up each its own; what is felled or growing is still drawn one by one (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(trunksSource => {
    isPaused = true;
    window.sim.helpers.clearResources();
    resetTileIndex();
    camera.x = townHall.x; camera.y = townHall.y + 150;
    const at = (dx, dy, extra) => ({ x: townHall.x + dx * TILE_SIZE, y: townHall.y + 150 + dy * TILE_SIZE, hp: 3, maxHp: 3, isGrowing: false, growProgress: 0, priority: 0, ...extra });
    for (let i = 0; i < 12; i++) trees.push(at(-6 + i, -2, {}));
    const count = () => eval(trunksSource);
    const out = {};
    setZoom(getMaxZoom());
    out.near = count();
    // (close up each from its own small picture, #322)
    let pictures = 0; const d = ctx.drawImage; ctx.drawImage = function (...a) { if (a[0].width < 200) pictures++; return d.apply(this, a); }; render(); ctx.drawImage = d;
    out.nearPictures = pictures;
    setZoom(Math.min(0.6, getMaxZoom()));
    out.farStanding = count();
    trees.push(at(0, 2, { fallen: true, fallAt: -999, fallAngle: 0, hp: 1, maxHp: 3 }));
    for (let i = 0; i < 5; i++) game.pathTick += 1;
    out.farWithFelled = count();
    return out;
  }, trunks);
  expect(r.near).toBe(0);
  expect(r.nearPictures).toBeGreaterThanOrEqual(12);
  expect(r.farStanding).toBe(0);
  expect(r.farWithFelled).toBeGreaterThan(0); // (the log lying there)
  expect(errors).toEqual([]);
});

test('a tree taken from the map is gone from its picture within a few ticks (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    window.sim.helpers.clearResources();
    resetTileIndex();
    camera.x = townHall.x; camera.y = townHall.y + 150;
    setZoom(Math.min(0.6, getMaxZoom()));
    const tree = { x: townHall.x, y: townHall.y + 150, hp: 3, maxHp: 3, isGrowing: false, growProgress: 0, priority: 0 };
    trees.push(tree);
    const frames = (count = 12) => { for (let i = 0; i < count; i++) render(); };
    // (where the crown shows on the screen)
    const px = () => { const s = getViewScale(); const x = Math.round(canvas.width / 2), y = Math.round(canvas.height / 2 - 2 * s); return Array.from(ctx.getImageData(x, y, 1, 1).data).join(','); };
    // (let the zoomed-out picture queue finish before comparing its pixels)
    frames(60); const withTree = px();
    trees.splice(0, trees.length);
    for (let i = 0; i < 5; i++) game.pathTick++;
    frames(60); const without = px();
    return { withTree, without };
  });
  expect(r.without).not.toBe(r.withTree);
  expect(errors).toEqual([]);
});
