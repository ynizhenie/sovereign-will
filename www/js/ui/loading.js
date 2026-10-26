// (#326) A loading screen: the menu's own scene stays up with a bar over it while a world is made or a save is
// read. The work is a generator that yields how far along it is (0..1), or a promise; between the yields the
// page draws a frame, so the bar moves.

import { t } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';

const nextFrame = () => new Promise(resolve => { const done = () => resolve(undefined); requestAnimationFrame(done); setTimeout(done, 60); }); // (a hidden page draws no frames)

/** @param {string} title what's loading (a text key)
 * @param {Iterator<number | Promise<unknown>>} steps what to do, step by step, each yielding its share done */
export async function runLoading(title, steps) {
  const screen = document.getElementById('loading-screen'), fill = document.getElementById('loading-fill'), label = document.getElementById('loading-title');
  if (!screen || !fill || !label) { for (let step = steps.next(); !step.done; step = steps.next()) await step.value; return; }
  label.textContent = t(title);
  fill.style.width = '0%';
  screen.hidden = false;
  document.body.classList.add('loading');
  game.loading = true;
  await nextFrame();
  try {
    for (let step = steps.next(); !step.done; step = steps.next()) {
      if (typeof step.value === 'number') fill.style.width = `${Math.round(Math.min(1, step.value) * 100)}%`;
      else await step.value;
      await nextFrame();
    }
    fill.style.width = '100%';
  } finally {
    game.loading = false;
    screen.hidden = true;
    document.body.classList.remove('loading');
  }
}
