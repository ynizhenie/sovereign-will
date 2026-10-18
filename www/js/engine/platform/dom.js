// Page helpers

// like the play button: touchend too, since a second tap within 300ms never becomes a click (see input.js)
// A finger that moved more than this many px between touching and lifting was scrolling, not tapping
const TAP_SLOP = 10;

export function onTap(element, action) {
  const handler = (e) => { e.preventDefault(); action(); };
  element.addEventListener('click', handler);
  // a touch is a tap only if the finger didn't move: a scroll over the button pressed it (#232)
  /** @type {{ x: number, y: number } | null} */
  let start = null;
  element.addEventListener('touchstart', e => { const t = e.touches[0]; start = t ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
  element.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    const moved = start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > TAP_SLOP;
    start = null;
    if (moved) { e.preventDefault(); return; } // (no click either)
    handler(e);
  });
}
