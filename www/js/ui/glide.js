// In a row of options (Off / On, 30 / 60 / Screen, a language...) a soft light slides under the mouse from option to
// option, instead of each one only changing its colour as the pointer comes onto it. Only a mouse: a finger taps, it
// doesn't hover. The light is a thin layer over the row (pointer-events: none), so it lights the plank it's on.

const OPTION = '.wave-option, .fps-option, .difficulty-option, .cards-option, .map-option, .battle-size-option, ' +
  '.map-source-option, .editor-size-option, .faction-option';

/** @type {HTMLElement | null} */
let lit = null; // the row the light is in now

/** @param {HTMLElement} row */
function glideOf(row) {
  let glide = /** @type {HTMLElement | null} */ (row.querySelector(':scope > .glide'));
  if (!glide) {
    if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
    glide = document.createElement('div');
    glide.className = 'glide';
    row.appendChild(glide);
  }
  return glide;
}

/** @param {HTMLElement} row */
function dim(row) {
  const glide = row.querySelector(':scope > .glide');
  if (glide) glide.classList.remove('on');
}

export function initGlide() {
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const option = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest?.(OPTION) || null);
    const row = option && !option.matches(':disabled') ? option.parentElement : null;
    if (row !== lit && lit) dim(lit);
    if (!row || !option) { lit = null; return; }
    const glide = glideOf(row);
    const place = `translate(${option.offsetLeft}px, ${option.offsetTop}px)`;
    // (coming into the row: put where the pointer is at once, then slide from there)
    if (row !== lit || !glide.classList.contains('on')) {
      glide.classList.add('jump');
      glide.style.transform = place;
      glide.style.width = `${option.offsetWidth}px`;
      glide.style.height = `${option.offsetHeight}px`;
      void glide.offsetWidth; // (the jump laid out before the slide is turned back on)
      glide.classList.remove('jump');
      glide.classList.add('on');
    } else {
      glide.style.transform = place;
      glide.style.width = `${option.offsetWidth}px`;
      glide.style.height = `${option.offsetHeight}px`;
    }
    lit = row;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (lit) dim(lit); lit = null; });
}
