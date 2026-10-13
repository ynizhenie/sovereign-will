// The bottom panel: its tabs, and the buttons made from the config (hire, build, farm, tools, weapons)

import { GAME_CONFIG } from '../content/configs/index.js';
import { escapeHtml, iconHtml, setRichText } from './icons.js';
import { onTap, t } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';
import { renderGearLabels, renderToolsTab, renderWeaponsTab } from '../domains/colony/equipment/index.js';
import { formatCost } from '../domains/colony/storage/index.js';
import { renderResourceTiles, updateUI } from './hud.js';
import { sides } from '../domains/factions/index.js';
import { renderRecruitRow } from '../domains/colony/settlers/index.js';
import { renderBuildTab } from '../domains/economy/building/index.js';
import { setMode } from './map-input.js';
import { refreshAffordability } from './widgets.js';

// the bottom panel's open tab (farm zones are only drawn with the Farming tab open)
export let activeTab = 'tab-build';

// Open a tab by its id, as tapping its button does
export function openTab(tabId) {
  const button = document.querySelector(`.tab-btn[data-arg="${tabId}"]`);
  if (button) switchTab(button, tabId);
}

export function switchTab(btnElement, tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  // switching to any tab goes back to the Point (interact) mode
  setMode('interact');
  
  btnElement.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

export function createConfigButton(item, action) {
  const button = document.createElement('button');
  button.className = 'btn';
  button.id = `btn-${item.id}`;
  setRichText(button, `${item.icon ? `[[${item.icon}]]` : ''} ${item.label} (${formatCost(item.cost || {})})`);
  button.addEventListener('click', () => action(item.id));
  return button;
}

// Rebuild the generated HUD and buttons, e.g. after a language change (setLanguage)
export function rebuildConfigHud() {
  for (const id of ['resources-hud', 'build-actions', 'farming-actions', 'tool-actions', 'weapon-actions', 'recruit-row']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  }
  const details = document.getElementById('resource-details');
  if (details) details.remove();
  renderConfigHud();
  if (typeof updateUI === 'function' && game.gameStarted) { updateUI(); refreshAffordability(true); }
}

/** @type {string | null} */
export let renderedFaction = null; // whose units and buildings the HUD shows

export function renderConfigHud() {
  // only what the player's faction has: its resources, buildings, units to hire and upgrade
  renderedFaction = sides.player.faction;
  renderResourceTiles();
  renderBuildTab();
  renderToolsTab();
  renderRecruitRow();
  renderGearLabels();
  // the undead blight the ground instead of farming
  document.getElementById('tab-btn-farming').hidden = sides.player.faction === 'undead';
  document.getElementById('tab-btn-blight').hidden = sides.player.faction !== 'undead';
  renderWeaponsTab();
}
