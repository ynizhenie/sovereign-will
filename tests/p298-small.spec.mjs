import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's #298, part 1: the small ones (2, 5, 6, 7)

test('no sharpening, smoking or wheat stalk among the pastimes any more (#298, 5)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    window.sim.start('no-smokes');
    const { makeSettler, clearResources } = window.sim.helpers;
    clearResources();
    settlers = [makeSettler(1, townHall.x + 60, townHall.y + 60, { weapon: 'sword', role: 'soldier' }), makeSettler(2, townHall.x - 60, townHall.y + 60, { tool: 'hoe' }), makeSettler(3, townHall.x, townHall.y + 90)];
    const acts = new Set();
    for (let f = 0; f < 60 * 120; f++) { update(1 / 60); waveTimer = 999; settlers.forEach(s => { s.hunger = 999; if (s.idle) acts.add(s.idle.act); }); }
    return { acts: [...acts], listed: Object.keys(IDLE_ACTIVITIES) };
  });
  for (const gone of ['sharpen', 'smoke', 'straw']) { expect(r.acts).not.toContain(gone); expect(r.listed).not.toContain(gone); }
  expect(errors).toEqual([]);
});

test('the camp\'s enemies are the same whichever party comes (#298, 6)', async ({ page }) => {
  const errors = await openGame(page);
  await sim(page, 'campOpens', { soldiers: 4 });
  const r = await page.evaluate(() => {
    raidCamp.layout = 'square';
    const step = (sec, until) => { for (let f = 0; f < sec * 60; f++) { update(1 / 60); waveTimer = 999; if (until && until()) return; } };
    const look = party => {
      startRaid(party);
      step(60, () => !!document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'));
      enterCamp();
      const sig = enemies.map(en => `${en.enemyKey}@${Math.round(en.x)},${Math.round(en.y)}`).sort().join(' ');
      const n = enemies.length;
      leaveCamp(false); endRaid(false);
      return { sig, n };
    };
    const soldiers = settlers.filter(s => s.role === 'soldier');
    const camp = { ...raidCamp };
    const one = look([soldiers[0]]);
    raidCamp = camp; // (a raid ends the camp: the same camp back, as if it were still there)
    const all = look(soldiers);
    return { one: one.n, all: all.n, same: one.sig === all.sig };
  });
  expect(r.one).toBeGreaterThan(0);
  expect(r).toEqual({ one: r.one, all: r.one, same: true });
  expect(errors).toEqual([]);
});

test('iron ore in its old silver-grey on the map, its icon the same colour; one relieving itself is censored (#298, 7, 2)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    drawIcon(x, 'ironOre', 16, 16, 32);
    const d = x.getImageData(0, 0, 32, 32).data;
    let silver = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0xaa) < 6 && Math.abs(d[i + 1] - 0xb7) < 6 && Math.abs(d[i + 2] - 0xc3) < 6) silver++;
    const s = settlers[0]; s.needsRelief = true; s.reliefSpot = { x: s.x, y: s.y }; s.reliefTimer = 0.5;
    render();
    return { mapColour: ORE_COLORS.iron.body, silver };
  });
  expect(r.mapColour).toBe('#aab7c3');
  expect(r.silver).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
