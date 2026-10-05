import { test, expect } from '@playwright/test';
import { openGame, sim, iconText } from './helpers.mjs';

test('blight: as far on every side of the graveyard; a tap again unmarks; no mark on blighted ground; taking it away fades (#186)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'blightZonesFollowup', {});
  expect(r).toEqual({
    reach: { left: true, right: true, up: true, down: true },
    refused: true, marked: true, unmarked: true, stillAfter1s: true, goneLater: true
  });
});

test('a new game opens on the Building tab; the undead see bones and rot right after the people (#188)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => { openTab('tab-farming'); document.getElementById('main-menu').style.display = ''; });
  await page.click('#play-button');
  expect(await page.evaluate(() => activeTab)).toBe('tab-build');
  await expect(page.locator('#tab-build')).toHaveClass(/active/);

  await sim(page, 'asUndeadForHud', {});
  const tiles = await iconText(page, '#resources-hud > div');
  expect(tiles[2]).toContain('[[bones]]');
  expect(tiles[3]).toContain('[[rot]]');
});

test('on a phone the bottom panel is compact, and the selected settler box keeps its size (#188)', async ({ page }) => {
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
    return { panel: document.getElementById('bottom-panel').getBoundingClientRect().height, empty, carrying: box() };
  });
  expect(r.panel).toBeLessThan(280);
  expect(r.carrying).toEqual(r.empty);
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
