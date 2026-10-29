// The start: texts and panel made, the canvas fitted, and the loop: the game in fixed steps of 1/60 s,
// drawn as often as the frame rate setting allows

import { renderConfigHud, syncHudMode } from '../ui/index.js';
import { applyPageTexts, camera, clampCamera, fitCanvasToScreen, loadSetting } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';
import { update } from './update.js';
import { render } from './render.js';
import { isDefeated, updateDefeat } from '../modes/endless/index.js';
import { syncMenuWorld } from '../modes/menu/index.js';
import { updateMusic } from './sounds.js';
import { adaptResolution, resolution } from './resolution.js';

// The game runs in fixed steps of 1/60 s whatever the frame rate, so it plays at the same speed on a
// 30 Hz phone and a 144 Hz monitor (much of the movement is per step). Frames are drawn as often as the
// frame-rate setting allows: 30, 60, or every screen refresh (a browser can't show more than that).
export const STEP = 1 / 60;

export const MAX_STEPS_PER_FRAME = 6; // after a long hitch, catch up at most this much instead of freezing
export const STEP_BUDGET_MS = 9; // (#322) and the steps of a frame take at most about this long (the first is always made)

// the loop's clock: when the last frame was, game time not stepped yet, when the last frame was drawn,
// and the frame-rate setting (30, 60, or 'display': every screen refresh)
export const loop = { lastTime: performance.now(), stepTime: 0, lastDrawn: 0, lastFrameAt: performance.now(), frameRate: loadSetting('fps', 'display') };

// One step of the game, unless it's lost: then the world stops and no more waves come
export function stepGame(dt) {
  updateDefeat(dt);
  if (isDefeated()) return;
  update(dt);
}

export function gameLoop(now) {
  // (the next frame asked for first: a frame that fails doesn't stop the game for good)
  requestAnimationFrame(gameLoop);
  if (typeof syncMenuWorld === 'function') syncMenuWorld(); // the world behind the main menu
  syncHudMode();
  if (typeof updateMusic === 'function') updateMusic();
  loop.stepTime += Math.min(0.25, (now - loop.lastTime) / 1000);
  loop.lastTime = now;
  let steps = 0;
  const started = performance.now();
  // (#322) On a slow device the steps owed are not all made in one frame whatever they cost (that left a frame of many long
  // steps and one drawing, five or six a second): past STEP_BUDGET_MS the frame is drawn, and the game goes a little slow
  // (the rest of what's owed is let go) instead of the screen going slow
  while (loop.stepTime >= STEP && steps < MAX_STEPS_PER_FRAME && (steps === 0 || performance.now() - started < STEP_BUDGET_MS)) {
    rememberPositions();
    stepGame(STEP);
    loop.stepTime -= STEP;
    steps++;
  }
  if (loop.stepTime >= STEP && (steps === MAX_STEPS_PER_FRAME || performance.now() - started >= STEP_BUDGET_MS)) loop.stepTime = 0;

  if (frameDue(now)) {
    fitCanvasToScreen(); // cheap unless the game area changed size (rotation, panels)
    drawBetweenSteps(Math.min(1, loop.stepTime / STEP), render);
    countFrame(now);
    loop.lastFrameAt = now;
  }
}

// (#322) Smooth on a fast screen: the game moves in steps of 1/60 s, but a 120 or 144 Hz screen shows a frame
// two or more times a step. Each frame draws what moves (settlers, enemies, boars, arrows, the camera on the
// one possessed) where it is between its last step and this one, by how far into the next step the frame
// falls; then puts it back. A jump (a ghost back by its grave, a settler through a portal) isn't smoothed
const movingLists = () => [game.settlers, game.enemies, game.boars, game.scouts, game.projectiles];
export function rememberPositions() {
  for (const list of movingLists()) for (const o of list) { o.prevX = o.x; o.prevY = o.y; }
  camera.prevX = camera.x; camera.prevY = camera.y;
}

export function drawBetweenSteps(alpha, draw) {
  /** @type {[any, number, number][]} */
  const moved = [];
  if (alpha < 1) {
    for (const list of movingLists()) {
      for (const o of list) {
        if (o.prevX === undefined) continue;
        const dx = o.x - o.prevX, dy = o.y - o.prevY;
        if ((dx || dy) && Math.abs(dx) < 40 && Math.abs(dy) < 40) { moved.push([o, o.x, o.y]); o.x = o.prevX + dx * alpha; o.y = o.prevY + dy * alpha; }
      }
    }
  }
  // (the camera on the one possessed moves with it, between steps too)
  const followed = game.settlers.find(s => s.isPossessed);
  const cam = followed && camera.prevX !== undefined ? { x: camera.x, y: camera.y } : null;
  if (cam && followed) { camera.x = followed.x; camera.y = followed.y; clampCamera(); }
  try { draw(); } finally {
    for (const [o, x, y] of moved) { o.x = x; o.y = y; }
    if (cam) { camera.x = cam.x; camera.y = cam.y; }
  }
}

// Is a frame to be drawn at `now`, under the frame-rate setting? Each one is due a whole interval after the
// last one was due, not after it was drawn: drawn after, a 60 cap gave every third refresh on a 144 Hz
// screen (48 fps) and every other one at 90 Hz (45) (#197). After a hitch it doesn't rush to catch up.
export function frameDue(now) {
  const limit = Number(loop.frameRate);
  if (!limit) return true;
  const interval = 1000 / limit;
  if (now - loop.lastDrawn < interval - 1) return false;
  loop.lastDrawn = Math.max(loop.lastDrawn + interval, now - interval);
  return true;
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
  if (loop.frameRate === 'unlimited') loop.frameRate = 'display'; // the old "no limit" setting
  fitCanvasToScreen();
  requestAnimationFrame(gameLoop);
}
