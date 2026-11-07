// (#326) A loading screen: the world is made or a save is read in steps, then rendered behind the screen until
// its visible terrain and shadow chunks are ready.

import { t } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';
import { chunkStats } from '../domains/world/index.js';

const nextFrame = () => new Promise(resolve => {
  let drawn = false;
  const done = () => resolve(drawn);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { drawn = true; done(); });
  setTimeout(done, 60); // (a hidden page draws no frames)
});

/** @param {string} title what's loading (a text key)
 * @param {Iterator<number | Promise<unknown>>} steps what to do, step by step, each yielding its share done
 * @param {() => void | Promise<void>} [onReady] set up the finished world before it is rendered */
export async function runLoading(title, steps, onReady) {
  const screen = document.getElementById('loading-screen'), fill = document.getElementById('loading-fill'), label = document.getElementById('loading-title');
  if (!screen || !fill || !label) {
    for (let step = steps.next(); !step.done; step = steps.next()) await step.value;
    if (onReady) await onReady();
    return;
  }
  label.textContent = t(title);
  fill.style.width = '0%';
  screen.hidden = false;
  document.body.classList.add('loading');
  game.loading = true;
  game.loadingRender = false;
  await nextFrame();
  try {
    for (let step = steps.next(); !step.done; step = steps.next()) {
      if (typeof step.value === 'number') fill.style.width = `${Math.round(Math.min(1, step.value) * 100)}%`;
      else await step.value;
      await nextFrame();
    }
    if (onReady) await onReady();
    game.loadingRender = true;
    let readyFrames = 0;
    while (readyFrames < 2) {
      const before = game.loadingRenderFrame || 0;
      let drawn;
      do { drawn = await nextFrame(); } while (drawn && game.loadingRenderFrame === before);
      if (!drawn) break;
      const stats = chunkStats();
      const progress = stats.warmTotal ? stats.warmReady / stats.warmTotal : 0;
      const current = Number.parseFloat(fill.style.width) || 0;
      fill.style.width = `${Math.min(99, Math.max(current, 90 + progress * 9))}%`;
      readyFrames = stats.pending === 0 && stats.holes === 0 ? readyFrames + 1 : 0;
    }
    fill.style.width = '100%';
  } finally {
    game.loadingRender = false;
    game.loading = false;
    screen.hidden = true;
    document.body.classList.remove('loading');
  }
}
