// Shared by the spec files: open the game with the test helpers injected.
//
// tests/sim.js holds the core helpers and the older scenarios. New scenarios go in their own file in
// tests/scenarios/ (one per topic) and their tests in their own tests/<topic>.spec.mjs, so pull
// requests made in parallel don't all edit the same lines. A scenario file adds to window.sim:
//
//   Object.assign(window.sim, (() => {
//     const { start, run, helpers: { makeSettler } } = window.sim;
//     function myScenario({ seed = 'my-test' }) { start(seed); ...; return { ... }; }
//     return { myScenario };
//   })());
import { existsSync, readdirSync } from 'node:fs';

const SCENARIOS = 'tests/scenarios';

export async function openGame(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // the tests check Russian texts; the game itself starts in English (see i18n.js)
  await page.addInitScript(() => { try { localStorage.setItem('sovereign-will-language', 'ru'); } catch (e) { /* none */ } });
  await page.goto('/');
  await page.evaluate(() => showMenuScreen('endless')); // the play button and game setup live there
  await page.addScriptTag({ path: 'tests/sim.js' });
  const files = existsSync(SCENARIOS) ? readdirSync(SCENARIOS).filter(f => f.endsWith('.js')).sort() : [];
  for (const file of files) await page.addScriptTag({ path: `${SCENARIOS}/${file}` });
  return errors;
}

// Run window.sim[fn](arg) in the page and return its result
export const sim = (page, fn, arg) => page.evaluate(([fn, arg]) => window.sim[fn](arg), [fn, arg]);
