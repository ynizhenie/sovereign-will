// The bottom panel: its tabs, and the buttons made from the config (hire, build, farm, tools, weapons)

import { GAME_CONFIG } from '../content/configs/index.js';
import { escapeHtml, iconHtml, richText } from './icons.js';
import { onTap, t } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';
import { renderCraftLists } from '../domains/colony/equipment/index.js';
import { formatCost } from '../domains/colony/storage/index.js';
import { renderResourceStrip, renderResourceTiles, renderSheetStock, updateUI } from './hud.js';
import { applyFactionCosts, getPlayerFaction, sides } from '../domains/factions/index.js';
import { renderRecruitRow } from '../domains/colony/settlers/index.js';
import { renderBuildTab } from '../domains/economy/building/index.js';
import { setMode } from './map-input.js';
import { refreshAffordability } from './widgets.js';
import { updateUnitsTab } from './units-tab.js';
import { closeSheet, getOpenSheet, toggleSheet } from './sheets.js';
import { closeSelectedCard } from './selected-card-state.js';

// the colony sheet's tab (the last one opened, even with the sheet closed)
export let activeTab = 'tab-build';

// A tab's things show on the map (farm zones, blight) while its sheet is out or one of its tools is in hand
export function isTabShown(tabId) {
  return activeTab === tabId && (getOpenSheet() === 'colony' || game.buildMode !== 'interact');
}

// Pick a tab, the sheet closed (a new game starts on Building)
export function openTab(tabId) {
  showTab(tabId);
  closeSheet();
}

function showTab(tabId) {
  closeSelectedCard();
  activeTab = tabId;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === tabId));
  renderSheetStock(tabId);
  if (tabId === 'tab-units') updateUnitsTab(true); // (at once, paused too)
}

// A dock button: its tab's sheet opens, or closes if it's the one open (a picked
// tool's sheet comes back from its chip instead, the tool kept)
export function switchTab(_button, tabId) {
  setMode('interact');
  showTab(tabId);
  toggleSheet('colony', tabId);
}

// A tile (#261): every tab's things look alike, a compact square-ish button with the thing's icon and name,
// and its cost under them (and `extra` after it, e.g. what it makes)
/** @returns {HTMLButtonElement} */
export function makeTile(item, extra = '') {
  const button = document.createElement('button');
  button.className = 'btn tile';
  const cost = formatCost(item.cost || {}) + extra;
  // (the spaces: its text reads "icon name cost" too)
  button.innerHTML = `<span class="tile-name">${item.icon ? iconHtml(item.icon) : ''} <b>${escapeHtml(item.label)}</b></span>` +
    (cost ? ` <span class="tile-cost">${richText(cost)}</span>` : '');
  return button;
}

// A small mark in a tile's top right corner (a lock: where it's made isn't built; a card: a card opens it,
// #255; 27.10, 20), on or off
export function tileMark(tile, className, icon, on) {
  let marks = tile.querySelector('.tile-marks'), mark = tile.querySelector(`.${className}`);
  if (on && !mark) {
    if (!marks) { marks = document.createElement('span'); marks.className = 'tile-marks'; tile.appendChild(marks); }
    mark = document.createElement('span'); mark.className = className; mark.innerHTML = iconHtml(icon);
    if (className === 'tile-lock') marks.prepend(mark); else marks.appendChild(mark);
  }
  if (!on && mark) mark.remove();
}

// A tile for a config item (category: its GAME_CONFIG section, for its card, #213)
export function createConfigButton(item, action, category) {
  const button = makeTile(item);
  button.id = `btn-${item.id}`;
  if (category) button.dataset.info = `${category}:${item.id}`;
  button.addEventListener('click', () => action(item.id));
  return button;
}

// Rebuild the generated HUD and buttons, e.g. after a language change (setLanguage)
export function rebuildConfigHud() {
  for (const id of ['resource-strip', 'resources-hud', 'build-actions', 'farming-actions', 'craft-tools', 'craft-weapons', 'craft-gear', 'craft-supplies', 'recruit-row']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  }
  const details = document.getElementById('resource-details');
  if (details) details.remove();
  renderConfigHud();
  if (typeof updateUI === 'function' && game.gameStarted) updateUI();
  refreshAffordability(true);
}

/** @type {string | null} */
export let renderedFaction = null; // whose units and buildings the HUD shows

export function renderConfigHud() {
  // only what the player's faction has: its resources, buildings, units to hire and upgrade
  renderedFaction = sides.player.faction;
  applyFactionCosts(); // (the undead's bones on every building, #279)
  renderResourceTiles();
  renderResourceStrip();
  renderBuildTab();
  renderRecruitRow();
  renderCraftLists();
  // (#279) the Zones tab for everyone: its farm and relief zones for those who eat
  const eats = getPlayerFaction().eats;
  document.querySelectorAll('#tab-farming .farm-only, #tab-farming .eats-only').forEach(el => { /** @type {HTMLElement} */ (el).hidden = !eats; });
  document.querySelectorAll('#tab-farming .undead-only').forEach(el => { /** @type {HTMLElement} */ (el).hidden = sides.player.faction !== 'undead'; }); // (the blight, #279)
  renderSheetStock(activeTab);
  // the tab left open was another faction's (Farming for the undead): back to Building (#200)
  if (document.querySelector(`.tab-btn[data-arg="${activeTab}"]`)?.hidden) openTab('tab-build');
}
