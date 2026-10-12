// The start: texts and panel made, the canvas fitted, and the loop: the game in fixed steps of 1/60 s,
// drawn as often as the frame rate setting allows

import { renderConfigHud } from '../ui/bottom-panel.js';
import { applyPageTexts } from '../engine/platform/i18n.js';
import { fitCanvasToScreen } from '../engine/platform/canvas.js';
import { update } from './update.js';
import { render } from './render.js';
import { loadSetting } from '../engine/platform/storage.js';
import { isDefeated, updateDefeat } from '../modes/endless/endless.rules.js';
import { syncMenuWorld } from '../modes/menu/menu.world.js';
import { updateMusic } from './sounds.js';

// The game runs in fixed steps of 1/60 s whatever the frame rate, so it plays at the same speed on a
// 30 Hz phone and a 144 Hz monitor (much of the movement is per step). Frames are drawn as often as the
// frame-rate setting allows: 30, 60, or every screen refresh (a browser can't show more than that).
export const STEP = 1 / 60;

export const MAX_STEPS_PER_FRAME = 6; // after a long hitch, catch up at most this much instead of freezing

// the loop's clock: when the last frame was, game time not stepped yet, when the last frame was drawn,
// and the frame-rate setting (30, 60, or 'display': every screen refresh)
export const loop = { lastTime: performance.now(), stepTime: 0, lastDrawn: 0, frameRate: loadSetting('fps', 'display') };

// One step of the game, unless it's lost: then the world stops and no more waves come (#169)
export function stepGame(dt) {
  updateDefeat(dt);
  if (isDefeated()) return;
  update(dt);
}

export function gameLoop(now) {
  if (typeof syncMenuWorld === 'function') syncMenuWorld(); // the world behind the main menu (#193)
  if (typeof updateMusic === 'function') updateMusic(); // (#174)
  loop.stepTime += Math.min(0.25, (now - loop.lastTime) / 1000);
  loop.lastTime = now;
  let steps = 0;
  while (loop.stepTime >= STEP && steps < MAX_STEPS_PER_FRAME) {
    stepGame(STEP);
    loop.stepTime -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) loop.stepTime = 0;

  const limit = Number(loop.frameRate);
  if (!limit || now - loop.lastDrawn >= 1000 / limit - 2) {
    loop.lastDrawn = now;
    fitCanvasToScreen(); // cheap unless the game area changed size (rotation, panels)
    render();
    countFrame(now);
  }
  requestAnimationFrame(gameLoop);
}

// ---- FPS counter (Settings): frames drawn over the last second
export const fpsCounter = document.getElementById('fps-counter');

export let framesThisSecond = 0, secondStart = 0;

export function countFrame(now) {
  framesThisSecond++;
  if (now - secondStart >= 1000) {
    if (!fpsCounter.hidden) fpsCounter.textContent = `${Math.round(framesThisSecond * 1000 / (now - secondStart))} FPS`;
    framesThisSecond = 0;
    secondStart = now;
  }
}

// What this file sets up as the game starts (called by app/boot.js)
export function initMain() {
  applyPageTexts();
  renderConfigHud();
  if (loop.frameRate === 'unlimited') loop.frameRate = 'display'; // the old "no limit" (see #123)
  fitCanvasToScreen();
  requestAnimationFrame(gameLoop);
}
