// (#322) Text put on the page only when it has changed: the HUD was written to every game step, sixty times a second, and writing
// innerText (or the same text again) made the browser lay the page out again each time (8 per cent of a slow device's time)

/** @type {WeakMap<Element, string>} */
const shown = new WeakMap();

/** @param {Element | null} el @param {string} text */
export function setText(el, text) {
  if (!el || shown.get(el) === text) return;
  shown.set(el, text);
  el.textContent = text;
}
