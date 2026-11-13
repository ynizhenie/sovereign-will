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
  expect(r.trees).toBeGreaterThan(5); // (a map by chance: a dozen or so in sight on a bare one)
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

test('with WebGL on, nature is kept on the card: a tree felled or taken away leaves it, a new one comes to it', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sovereign-will-gl', 'on'); } catch (e) { /* none */ } });
  const errors = await openGame(page);
  await page.click('#play-button');
  await page.waitForFunction(() => glReady());
  const r = await page.evaluate(() => {
    isPaused = true;
    setZoom(getMaxZoom()); // (close enough for the wavelets to show)
    const frames = n => { for (let i = 0; i < n; i++) render(); };
    const standing = () => game.trees.filter(t => !t.isGrowing && !t.fallen).length;
    frames(Math.ceil(game.trees.length / 400) + 2); // (every tree looked at)
    const start = { groups: glGroups(), kept: glKept(1), standing: standing(), small: glKept(0), smallThings: game.sticks.length + game.pebbles.length + game.stumps.length + game.berryBushes.length + game.cacti.length + game.boulders.length };
    // one felled where it stands, one taken away, a sapling planted
    const felled = game.trees.find(t => !t.isGrowing && !t.fallen);
    felled.fallen = true;
    game.trees.splice(game.trees.findIndex(t => t !== felled && !t.isGrowing && !t.fallen), 1);
    game.trees.push({ x: felled.x + 60, y: felled.y, hp: 1, maxHp: 3, isGrowing: true, growProgress: 0, priority: 0 });
    frames(Math.ceil(game.trees.length / 400) + 2);
    const after = { kept: glKept(1), standing: standing() };
    // the sapling grown
    game.trees[game.trees.length - 1].isGrowing = false;
    frames(Math.ceil(game.trees.length / 400) + 2);
    return { start, after, grown: { kept: glKept(1), standing: standing() } };
  });
  expect(r.start.groups.sway).toBeGreaterThan(0); // (the tufts of grass, kept in groups)
  expect(r.start.groups.waves).toBeGreaterThan(0); // (the water's wavelets round the screen)
  expect(r.start.kept).toBe(r.start.standing);
  expect(r.start.small).toBe(r.start.smallThings);
  expect(r.after.standing).toBe(r.start.standing - 2);
  expect(r.after.kept).toBe(r.after.standing);
  expect(r.grown.kept).toBe(r.after.standing + 1);
  expect(errors).toEqual([]);
});
