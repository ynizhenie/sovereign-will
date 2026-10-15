// The bottom panel: its tabs, and the buttons made from the config (hire, build, farm, tools, weapons)

import { GAME_CONFIG } from '../content/configs/index.js';
import { escapeHtml, iconHtml, setRichText } from './icons.js';
import { onTap, t } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';
import { renderGearLabels, renderQuotas, renderToolsTab, renderWeaponsTab } from '../domains/colony/equipment/index.js';
import { formatCost } from '../domains/colony/storage/index.js';
import { renderReserves, renderResourceStrip, renderResourceTiles, renderSheetStock, renderStance, updateUI } from './hud.js';
import { sides } from '../domains/factions/index.js';
import { renderRecruitRow } from '../domains/colony/settlers/index.js';
import { renderBuildTab } from '../domains/economy/building/index.js';
import { setMode } from './map-input.js';
import { refreshAffordability } from './widgets.js';
import { closeSheet, getOpenSheet, toggleSheet } from './sheets.js';

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
  activeTab = tabId;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === tabId));
  renderSheetStock(tabId);
}

// A dock button: back to Point (#80), and its tab's sheet opens, or closes if it's the one open (a picked
// tool's sheet comes back from its chip instead, the tool kept)
export function switchTab(_button, tabId) {
  setMode('interact');
  showTab(tabId);
  toggleSheet('colony', tabId);
}

// A button for a config item (category: its GAME_CONFIG section, for its card, #213)
export function createConfigButton(item, action, category) {
  const button = document.createElement('button');
  button.className = 'btn';
  button.id = `btn-${item.id}`;
  if (category) button.dataset.info = `${category}:${item.id}`;
  setRichText(button, `${item.icon ? `[[${item.icon}]]` : ''} ${item.label} (${formatCost(item.cost || {})})`);
  button.addEventListener('click', () => action(item.id));
  return button;
}

// Rebuild the generated HUD and buttons, e.g. after a language change (setLanguage)
export function rebuildConfigHud() {
  for (const id of ['resource-strip', 'resources-hud', 'build-actions', 'farming-actions', 'tool-actions', 'weapon-actions', 'recruit-row']) {
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
  renderResourceTiles();
  renderResourceStrip();
  renderReserves();
  renderStance();
  renderBuildTab();
  renderToolsTab();
  renderRecruitRow();
  renderGearLabels();
  // the undead blight the ground instead of farming
  document.getElementById('tab-btn-farming').hidden = sides.player.faction === 'undead';
  document.getElementById('tab-btn-blight').hidden = sides.player.faction !== 'undead';
  renderWeaponsTab();
  renderQuotas(true);
  renderSheetStock(activeTab);
  // the tab left open was another faction's (Farming for the undead): back to Building (#200)
  if (document.querySelector(`.tab-btn[data-arg="${activeTab}"]`)?.hidden) openTab('tab-build');
}
