import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's batch of fixes (#279): the flute (41), every sound checked (43)
const sourceFiles = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.js') ? [p] : []; });

test('one with a flute by a campfire plays a tune over the music, one of ten (#279, 41)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  await page.mouse.click(5, 5);
  const r = await page.evaluate(() => {
    const { placeBuilding, clearResources } = window.sim.helpers;
    clearResources(); boars = [];
    const fire = placeBuilding('campfire', townHall.x + 90, townHall.y + 15); fire.fuelLeft = 99;
    const s = settlers[0];
    settlers = [s];
    s.flute = true;
    camera.x = fire.x; camera.y = fire.y;
    let heard = null;
    for (let f = 0; f < 60 * 15 && !heard; f++) {
      if (!s.idle || s.idle.act !== 'campfire') s.idle = { act: 'campfire', left: 99, spot: { x: fire.x, y: fire.y }, partnerId: null };
      update(1 / 60); waveTimer = 999; s.hunger = 999; boarRespawnTimer = 999;
      heard = Object.keys(musicMix()).find(k => k.startsWith('flute_')) || null;
    }
    render();
    return { tunes: Object.keys(GAME_CONFIG.music).filter(k => k.startsWith('flute_')).length, heard, playing: pathTick - (s.playingFlute ?? -1e9) < 10 };
  });
  expect(r.tunes).toBe(10);
  expect(r.playing).toBe(true);
  expect(r.heard).toMatch(/^flute_/);
  expect(errors).toEqual([]);
});

test('every sound plays without an error and has a gap; every sound the game asks for is there (#279, 43)', async ({ page }) => {
  const errors = await openGame(page);
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const sink = audio.ctx.createGain(); sink.gain.value = 0; sink.connect(audio.ctx.destination);
    const failed = [];
    for (const [name, sound] of Object.entries(SOUNDS)) {
      try { sound(sink, audio.ctx.currentTime + 0.05, 200, 3, false); } catch (e) { failed.push(`${name}: ${e.message}`); }
    }
    return { names: Object.keys(SOUNDS), failed, noGap: Object.keys(SOUNDS).filter(n => !(n in SOUND.minGap)) };
  });
  expect(r.failed).toEqual([]);
  expect(r.noGap).toEqual([]);
  // every playSound('...') / playWorkSound(.., '...') in the game names one of them
  const asked = new Set();
  for (const file of sourceFiles('www/js')) {
    for (const m of readFileSync(file, 'utf8').matchAll(/play(?:Work)?Sound\((?:[^,()]+,\s*)?'([a-zA-Z]+)'/g)) asked.add(m[1]);
  }
  expect([...asked].filter(n => !r.names.includes(n))).toEqual([]);
  expect(errors).toEqual([]);
});
