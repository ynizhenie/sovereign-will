import { test, expect } from './helpers.mjs';
import { openGame, sim, iconText } from './helpers.mjs';

test('a new game opens on the Building tab; the undead see bones and rot right after the people (#188)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => { openTab('tab-farming'); document.getElementById('main-menu').style.display = ''; });
  await page.click('#play-button');
  expect(await page.evaluate(() => activeTab)).toBe('tab-build');
  await expect(page.locator('#tab-build')).toHaveClass(/active/);

  await sim(page, 'asUndeadForHud', {});
  // the line right after the base and the people: bones, then rot (one level, #248)
  const chips = await iconText(page, '#resources-hud .res-line:nth-child(2) .res-chip');
  expect(chips[0]).toContain('[[bones]]');
  expect(chips[1]).toContain('[[rot]]');
});

test('on a phone the bottom panel is compact, and the selected settler\'s card shows all of it, as wide, within half the screen (#188, #326)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const s = settlers[0];
    selectedSettler = s;
    updateUI();
    const box = () => { const b = document.getElementById('selected-bar').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
    const empty = box();
    s.carrying = { items: [{ type: 'wood', amount: 3 }, { type: 'stone', amount: 2 }, { type: 'leather', amount: 1 }] };
    s.activity = 'deliverCarrying';
    updateUI();
    return { panel: document.getElementById('bottom-panel').getBoundingClientRect().height, empty, carrying: box(), screen: innerHeight,
      shown: document.getElementById('selected-info').textContent };
  });
  expect(r.panel).toBeLessThan(280);
  // (#326) the card shows all of it, a line each: as wide, taller by the line, never more than about half the screen
  expect(r.carrying[0]).toBe(r.empty[0]);
  expect(r.carrying[1]).toBeGreaterThan(r.empty[1]);
  expect(r.carrying[1]).toBeLessThanOrEqual(Math.min(r.screen * 0.46, 340) + 1);
  expect(r.shown).toContain('3');
});

test('the camera goes half a screen past every edge at any zoom, and zoomed right out stays where it is (#189)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const out = [];
    for (const zoom of [getMinZoom(), 1, getMaxZoom()]) {
      setZoom(zoom);
      camera.x = -1000; camera.y = -1000; clampCamera();
      const low = [camera.x, camera.y];
      camera.x = 1e6; camera.y = 1e6; clampCamera();
      out.push({ low, high: [camera.x, camera.y] });
    }
    setZoom(getMinZoom());
    camera.x = WORLD_WIDTH * 0.2; camera.y = WORLD_HEIGHT * 0.8; clampCamera();
    return { out, kept: [camera.x, camera.y], world: [WORLD_WIDTH, WORLD_HEIGHT] };
  });
  for (const o of r.out) expect(o).toEqual({ low: [0, 0], high: r.world });
  expect(r.kept).toEqual([r.world[0] * 0.2, r.world[1] * 0.8]);
});
