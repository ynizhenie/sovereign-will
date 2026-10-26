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
import { test as base, expect } from '@playwright/test';
import { pageBridgeSource } from './bridge.mjs';

// The specs' test(): every page it opens (goto, reload) gets the tests' bridge to the game (tests/bridge.mjs)
// once the page has loaded, and goto/reload wait for it
const BRIDGE = pageBridgeSource();
export { expect };
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(source => {
      document.addEventListener('DOMContentLoaded', () => {
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = source;
        document.head.appendChild(script);
      });
    }, BRIDGE);
    for (const method of ['goto', 'reload']) {
      const original = page[method].bind(page);
      page[method] = async (...args) => {
        const response = await original(...args);
        await page.waitForFunction(() => window.__bridged === true);
        return response;
      };
    }
    // (#326) Play makes the world behind a loading screen: a click on it is done once the game has started
    const click = page.click.bind(page);
    page.click = async (selector, ...args) => {
      await click(selector, ...args);
      if (selector === '#play-button') await started(page);
    };
    await use(page);
  }
});

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

// (#326) Play (the editor's too) makes its world behind a loading screen: done once the game has started
export const started = page => page.waitForFunction(() => gameStarted === true && !game.loading, null, { timeout: 30000 });

// Run window.sim[fn](arg) in the page and return its result
export const sim = (page, fn, arg) => page.evaluate(([fn, arg]) => window.sim[fn](arg), [fn, arg]);

// The text of each element matching `selector`, with its drawn icons (www/js/icons.js) as [[name]]
export const iconText = (page, selector) => page.$$eval(selector, els => els.map(el => {
  const copy = el.cloneNode(true);
  copy.querySelectorAll('i.ic').forEach(i => i.replaceWith(`[[${[...i.classList].find(c => c.startsWith('ic-')).slice(3)}]]`));
  return copy.textContent.replace(/\s+/g, ' ').trim();
}));
