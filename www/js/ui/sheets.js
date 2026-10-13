// The sheets over the bottom of the map and the stock dropped down from the top: one sheet open at a
// time, by its dock button. Ways out: the same button, a tap on the map, Esc, Point, or picking a tool
// in it (the sheet steps aside for the map; the tool's chip brings it back).

import { game } from '../engine/world/index.js';

/** @type {string | null} */
let openName = null;
/** @type {string | null} */
let openKey = null;
/** @type {{ name: string, key: string | null } | null} */
let lastSheet = null;

// the dock button that opened it lights up: data-dock="<sheet>:<key>" (or just "<sheet>")
function markDock() {
  for (const button of document.querySelectorAll('[data-dock]')) {
    const id = openKey === null ? openName : `${openName}:${openKey}`;
    button.classList.toggle('active', openName !== null && button.dataset.dock === id);
  }
}

/** @param {string} name @param {string | null} [key] which part of it (a tab, a category) */
export function openSheet(name, key = null) {
  openName = name;
  openKey = key;
  lastSheet = { name, key };
  for (const sheet of document.querySelectorAll('.hud-sheet')) sheet.classList.toggle('open', sheet.dataset.sheet === name);
  document.body.classList.add('sheet-open');
  closeResources();
  markDock();
}

export function closeSheet() {
  if (openName === null) return;
  openName = null;
  openKey = null;
  document.body.classList.remove('sheet-open'); // the frame sinks away with the sheet still in it
  markDock();
}

/** @param {string} name @param {string | null} [key] @returns {boolean} open now */
export function toggleSheet(name, key = null) {
  if (openName === name && openKey === key) { closeSheet(); return false; }
  openSheet(name, key);
  return true;
}

/** @returns {string | null} */
export function getOpenSheet() {
  return openName;
}

// the sheet last opened, again (a tap on the chip of the tool picked in it)
export function reopenSheet() {
  if (lastSheet) openSheet(lastSheet.name, lastSheet.key);
}

// ---- The whole stock, dropped down under the strip of the main resources

export function toggleResources() {
  const open = !document.body.classList.contains('resources-open');
  if (open) closeSheet();
  document.body.classList.toggle('resources-open', open);
}

export function closeResources() {
  document.body.classList.remove('resources-open');
}

// Esc and a tap on the map: what's open closes. true if something was
export function closeOverlays() {
  const was = openName !== null || document.body.classList.contains('resources-open');
  closeSheet();
  closeResources();
  return was;
}

// ---- The chip of the tool picked in a sheet (a building, a zone, a unit to place...), over the dock while
// its sheet is closed: a tap on it opens the sheet again; its × puts the tool down (where there's a way to)

/** @type {(() => void) | null} */
let putDown = null;

/** @param {string} html its label @param {(() => void) | null} [stop] what × does (none: no ×) */
export function showPlacing(html, stop = null) {
  const what = document.getElementById('placing-what');
  what.innerHTML = html;
  putDown = stop;
  document.getElementById('placing-close').hidden = !stop;
  document.body.classList.add('placing');
}

export function hidePlacing() {
  document.body.classList.remove('placing');
  putDown = null;
}

// its × (and Esc)
export function stopPlacing() {
  if (!putDown) return false;
  putDown();
  return true;
}

// Each frame (app/main.js): the bars show the running mode's own row (body[data-hud]). Kept after the game
// ends, so they slide away as they were
export function syncHudMode() {
  if (game.gameStarted && game.gameMode !== 'menu' && document.body.dataset.hud !== game.gameMode) document.body.dataset.hud = game.gameMode;
}

// What this file sets up as the game starts (called by app/boot.js)
export function initSheets() {
  // ahead of the game's own keys (Esc there leaves possession): first the tool, then what's open
  window.addEventListener('keydown', e => {
    if (e.code !== 'Escape') return;
    if ((document.body.classList.contains('placing') && stopPlacing()) || closeOverlays()) e.stopImmediatePropagation();
  }, true);
}
