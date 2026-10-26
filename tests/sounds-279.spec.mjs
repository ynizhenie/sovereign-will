import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's batch of fixes (#279): every sound checked (43); (the flute (41) gone, #326)
const sourceFiles = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.js') ? [p] : []; });

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
