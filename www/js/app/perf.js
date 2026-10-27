// (#322) Where a frame's time goes, for Settings → Show FPS → Details: the game's steps, the drawing, and each part of them
// (marked by `mark` as it goes). Kept every frame at a few clock reads; the parts only while the details are on.

export const perf = {
  detail: false,
  stepMs: 0, steps: 0, drawMs: 0, frames: 0, slow: 0, // (over the second: the steps' and the drawing's time, how many; frames over 20 ms)
  t: 0,
  /** @type {Map<string, number>} */ parts: new Map(),
  /** @type {Map<string, number>} */ shown: new Map()
};

// The time since the last mark goes to this part (a no-op while the details are off)
export function mark(name) {
  if (!perf.detail) return;
  const now = performance.now();
  perf.parts.set(name, (perf.parts.get(name) || 0) + now - perf.t);
  perf.t = now;
}
export function startMarks() { if (perf.detail) perf.t = performance.now(); }

// The line(s) for the counter: a second's averages
export function perfText(fps) {
  const steps = Math.max(1, perf.steps), frames = Math.max(1, perf.frames);
  let text = `${fps} FPS`;
  if (perf.detail) {
    text += `\nstep ${(perf.stepMs / steps).toFixed(1)} ms x${(perf.steps / frames).toFixed(1)}/frame, draw ${(perf.drawMs / frames).toFixed(1)} ms, slow frames ${perf.slow}`;
    const top = [...perf.parts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(v / (k.startsWith('draw') ? frames : steps)).toFixed(2)}`);
    text += `\n${top.join('\n')}`;
  }
  perf.stepMs = perf.steps = perf.drawMs = perf.frames = perf.slow = 0;
  perf.parts.clear();
  return text;
}
