import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: nature close up laid down from pictures of it: a call each, not a dozen; what's changing as before

test('close up, trees, bushes, grass, sticks and pebbles come from pictures; a felled tree and a sapling are drawn as they are (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    window.sim.helpers.clearResources();
    importFog({ cols: COLS, rows: ROWS, explored: btoa(String.fromCharCode(255).repeat(Math.ceil(COLS * ROWS / 8))) });
    const at = (dx, dy, extra = {}) => ({ x: townHall.x + dx * TILE_SIZE, y: townHall.y + 140 + dy * TILE_SIZE, hp: 3, maxHp: 3, isGrowing: false, growProgress: 0, priority: 0, ...extra });
    for (let i = 0; i < 10; i++) { trees.push(at(-5 + i, 0)); berryBushes.push(at(-5 + i, 1)); grassList.push(at(-5 + i, 2)); sticks.push(at(-5 + i, 3)); pebbles.push(at(-5 + i, 4)); }
    resetTileIndex();
    camera.x = townHall.x; camera.y = townHall.y + 140 + 2 * TILE_SIZE;
    setZoom(1.5 / getBaseScale());
    const count = () => {
      const n = { arc: 0, drawImage: 0, trunk: 0 }; const arc = ctx.arc, img = ctx.drawImage, rect = ctx.fillRect;
      ctx.arc = function (...a) { n.arc++; return arc.apply(this, a); };
      ctx.drawImage = function (...a) { n.drawImage++; return img.apply(this, a); };
      ctx.fillRect = function (...a) { if (String(ctx.fillStyle) === '#5d4037') n.trunk++; return rect.apply(this, a); };
      render(); ctx.arc = arc; ctx.drawImage = img; ctx.fillRect = rect; return n;
    };
    for (let i = 0; i < 5; i++) render();
    const standing = count();
    trees.push(at(0, -2, { fallen: true, fallAt: -999, fallAngle: 0, hp: 1 }));
    trees.push(at(2, -2, { isGrowing: true, hp: 1, maxHp: 3 }));
    resetTileIndex();
    const changing = count();
    return { standing, changing };
  });
  expect(r.standing.drawImage).toBeGreaterThanOrEqual(50); // (fifty things: a picture each)
  expect(r.standing.arc).toBeLessThan(40); // (not eighteen circles a tree)
  expect(r.standing.trunk).toBe(0);
  expect(r.changing.trunk).toBeGreaterThan(0); // (the felled log, drawn as it lies)
  expect(errors).toEqual([]);
});
