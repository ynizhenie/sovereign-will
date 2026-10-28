// (#322) The canvas's resolution follows how the frames come: when they come slow it draws with fewer pixels (the page shows
// the canvas at the same size, a little softer), and when there's room again, with more. A pixel is paid for each frame by the
// screen's fill (a 2x or 3x screen has four or nine times a CSS pixel's worth); zoomed out, where the detail is too fine to see
// anyway, that was most of what a frame cost on a weak phone.
//
// It steps down after about a second of slow frames, and tries a step up after a stretch of frames on time and with room
// in them (the work of a frame well under its interval); a step up that goes slow again at once makes the wait to the next
// one longer, so it doesn't flicker between two sizes.

import { setRenderFactor } from '../engine/platform/index.js';

export const FACTORS = [1, 0.75, 0.5];
const SLOW_FOR_MS = 1200, MIN_HOLD_MS = 5000, MAX_HOLD_MS = 60000, CHANGE_GAP_MS = 2000, RETRY_WINDOW_MS = 20000;

export const resolution = { index: 0, frameEma: 16.7, workEma: 4, slowFor: 0, fastFor: 0, hold: MIN_HOLD_MS, lastChange: -Infinity, lastDown: -Infinity, on: true };

/** @param {number} index */
function apply(index, now) {
  resolution.index = index; resolution.lastChange = now; resolution.slowFor = 0; resolution.fastFor = 0;
  setRenderFactor(FACTORS[index]);
}

/**
 * A frame was drawn: frameMs since the last one, workMs the game's own time in it, intervalMs the one asked for (the frame-rate setting)
 * @param {number} now @param {number} frameMs @param {number} workMs @param {number} intervalMs
 */
export function adaptResolution(now, frameMs, workMs, intervalMs) {
  const r = resolution;
  if (!r.on || frameMs > 250 || frameMs <= 0) return; // (a hitch or a tab put away isn't how the frames come)
  r.frameEma = r.frameEma * 0.9 + frameMs * 0.1;
  r.workEma = r.workEma * 0.9 + workMs * 0.1;
  if (now - r.lastChange < CHANGE_GAP_MS) return;
  if (r.frameEma > intervalMs * 1.35) {
    r.fastFor = 0; r.slowFor += frameMs;
    if (r.slowFor >= SLOW_FOR_MS && r.index < FACTORS.length - 1) {
      // (a step up that was slow again soon: wait longer for the next try)
      if (now - r.lastChange < RETRY_WINDOW_MS && r.lastChange > r.lastDown) r.hold = Math.min(MAX_HOLD_MS, r.hold * 2);
      r.lastDown = now;
      apply(r.index + 1, now);
    }
  } else if (r.index > 0 && r.frameEma <= intervalMs * 1.15 && r.workEma < intervalMs * 0.5) {
    r.slowFor = 0; r.fastFor += frameMs;
    if (r.fastFor >= r.hold) apply(r.index - 1, now);
  } else { r.slowFor = 0; r.fastFor = 0; }
}
