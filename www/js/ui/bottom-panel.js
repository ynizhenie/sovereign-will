// The bottom panel: its tabs, and the buttons made from the config (hire, build, farm, tools, weapons)

import { GAME_CONFIG } from '../content/configs/index.js';
import { escapeHtml, iconHtml, setRichText } from './icons.js';
import { onTap, t } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';
import { assignTool, craftWeapon, getHeldItems } from '../domains/colony/equipment/index.js';
import { formatCost } from '../domains/colony/storage/index.js';
import { resourceHudId, toggleResourceGroup, updateUI } from './hud.js';
import { getPlayerFaction, sides } from '../domains/factions/index.js';
import { getUpgrade, spawnSettler, upgradeToBig } from '../domains/colony/settlers/index.js';
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

export let renderedFaction = null; // whose units and buildings the HUD shows (#43)

export function renderConfigHud() {
  // only what the player's faction has (#43): its resources, buildings, units to hire and upgrade
  renderedFaction = sides.player.faction;
  const ours = item => !item.factions || item.factions.includes(sides.player.faction);
  const resourcesHud = document.getElementById('resources-hud');
  if (resourcesHud) {
    const base = document.createElement('div');
    base.innerHTML = `${iconHtml('hall')} ${escapeHtml(t('hud.base'))}: <b id="base-hp-txt" style="color: #e74c3c;">100/100</b>`;
    resourcesHud.appendChild(base);

    const population = document.createElement('div');
    population.className = 'population-tile';
    population.innerHTML = `${iconHtml('worker')} ${escapeHtml(t('hud.people'))}: <b id="pop-txt" style="color: #2ecc71;">2/5</b> <span style="font-size: 0.9em; opacity: 0.85;">(${iconHtml('worker')} <b id="workers-cnt">0</b> | ${iconHtml('swords')} <b id="warriors-cnt">0</b>)</span>`;
    resourcesHud.appendChild(population);

    // resources by group (GAME_CONFIG.resourceGroups): a tile with the group's total; tapping it opens a
    // row with each resource in it, underneath the tiles
    const resourceTile = (resource, parent) => {
      const item = document.createElement('div');
      item.innerHTML = `${resource.icon ? iconHtml(resource.icon) : ''} ${escapeHtml(resource.label)}: <b id="${resourceHudId(resource.id)}">0</b>`;
      parent.appendChild(item);
    };
    const details = document.createElement('div');
    details.id = 'resource-details';
    details.className = 'resource-details';
    const grouped = new Set();
    for (const group of GAME_CONFIG.resourceGroups) {
      const members = group.members.filter(id => GAME_CONFIG.resources[id]);
      members.forEach(id => grouped.add(id));
      if (!ours(group)) continue; // the undead have no food groups (#164), nor its resources' tiles
      if (group.kinds) {
        // one resource opening onto its kinds (Food: berries, bread...)
        const resource = GAME_CONFIG.resources[members[0]];
        const tile = document.createElement('div');
        tile.className = 'resource-group';
        tile.id = `group-${group.id}`;
        tile.innerHTML = `${resource.icon ? iconHtml(resource.icon) : ''} ${escapeHtml(resource.label)}: <b id="${resourceHudId(resource.id)}">0</b> ▾`;
        resourcesHud.appendChild(tile);
        const row = document.createElement('div');
        row.className = 'resource-group-members';
        row.id = `group-${group.id}-members`;
        row.hidden = true;
        for (const kind of Object.values(GAME_CONFIG[group.kinds])) {
          const item = document.createElement('div');
          item.innerHTML = `${iconHtml(kind.icon)} ${escapeHtml(kind.label)}: <b id="food-kind-${kind.id}-txt">0</b>`;
          row.appendChild(item);
        }
        details.appendChild(row);
        tile.addEventListener('click', () => toggleResourceGroup(group.id));
        continue;
      }
      if (members.length === 1) { resourceTile(GAME_CONFIG.resources[members[0]], resourcesHud); continue; }
      if (group.held) {
        const tile = document.createElement('div');
        tile.className = 'resource-group';
        tile.id = `group-${group.id}`;
        tile.innerHTML = `${iconHtml(group.icon)} ${escapeHtml(group.label)}: <b id="group-${group.id}-txt">0</b> ▾`;
        resourcesHud.appendChild(tile);
        const row = document.createElement('div');
        row.className = 'resource-group-members';
        row.id = `group-${group.id}-members`;
        row.hidden = true;
        for (const [category, id] of getHeldItems(group)) {
          const item = GAME_CONFIG[category][id];
          const cell = document.createElement('div');
          cell.innerHTML = `${item.icon ? iconHtml(item.icon) : ''} ${escapeHtml(item.label)}: <b id="held-${category}-${id}-txt">0</b>`;
          row.appendChild(cell);
        }
        details.appendChild(row);
        tile.addEventListener('click', () => toggleResourceGroup(group.id));
        continue;
      }
      const tile = document.createElement('div');
      tile.className = 'resource-group';
      tile.id = `group-${group.id}`;
      tile.innerHTML = `${iconHtml(group.icon)} ${escapeHtml(group.label)}: <b id="group-${group.id}-txt">0</b> ▾`;
      resourcesHud.appendChild(tile);
      const row = document.createElement('div');
      row.className = 'resource-group-members';
      row.id = `group-${group.id}-members`;
      row.hidden = true;
      members.forEach(id => resourceTile(GAME_CONFIG.resources[id], row));
      details.appendChild(row);
      tile.addEventListener('click', () => toggleResourceGroup(group.id));
    }
    Object.values(GAME_CONFIG.resources).filter(r => !grouped.has(r.id) && ours(r)).forEach(r => resourceTile(r, resourcesHud));
    resourcesHud.after(details);
  }

  // the Building tab in sections (#181), the Farming tab as it is
  const buildSections = {};
  const sectionFor = group => {
    if (buildSections[group]) return buildSections[group];
    const section = document.createElement('div');
    section.className = 'panel-section';
    section.innerHTML = `<div class="panel-heading">${escapeHtml(t(`panel.${group}`))}</div><div class="btn-grid-2col"></div>`;
    document.getElementById('build-actions').appendChild(section);
    return (buildSections[group] = section.lastChild);
  };
  for (const group of ['defense', 'homes', 'economy']) sectionFor(group);
  Object.values(GAME_CONFIG.buildings).filter(ours).forEach(item => {
    const actions = item.tab ? document.getElementById(`${item.tab}-actions`) : sectionFor(item.group || 'economy');
    if (actions) actions.appendChild(createConfigButton(item, setMode));
  });
  for (const section of Object.values(buildSections)) section.parentNode.hidden = section.children.length === 0;

  const toolActions = document.getElementById('tool-actions');
  Object.values(GAME_CONFIG.tools).filter(ours).forEach(item => {
    if (toolActions) toolActions.appendChild(createConfigButton(item, assignTool));
  });

  const recruit = document.getElementById('recruit-row');
  for (const type of getPlayerFaction().units) {
    const unit = GAME_CONFIG.settlerTypes[type];
    const button = document.createElement('button');
    button.className = 'btn';
    button.id = `btn-hire-${type}`;
    setRichText(button, `[[${unit.icon}]] ${unit.label} (${formatCost(unit.hireCost)})`);
    onTap(button, () => spawnSettler(type));
    recruit.appendChild(button);
  }
  // craft / gear buttons in index.html get their text from the config
  const label = (id, text) => { const el = document.getElementById(id); if (el) setRichText(el, text); };
  const recipes = GAME_CONFIG.recipes;
  const upgrade = getUpgrade();
  if (upgrade) {
    const button = document.createElement('button');
    button.className = 'btn btn-armor';
    button.id = 'btn-upgrade';
    setRichText(button, t('btn.upgrade', { icon: upgrade.big.icon, cost: formatCost(upgrade.big.upgradeCost) }));
    onTap(button, () => upgradeToBig());
    recruit.appendChild(button);
    label('btn-upgrade-big', t('btn.upgradeWorker', { icon: upgrade.big.icon, cost: formatCost(upgrade.big.upgradeCost) }));
  }
  label('btn-craft-arrows', `[[${recipes.arrows.icon}]] ${recipes.arrows.label} (${formatCost(recipes.arrows.cost)} → ${recipes.arrows.produces.arrows})`);
  for (const item of Object.values(GAME_CONFIG.gear)) {
    label(`btn-${item.id}`, `[[${item.icon}]] ${item.label} (${formatCost(item.cost)})`);
    const button = document.getElementById(`btn-${item.id}`);
    if (button) button.hidden = !ours(item);
  }
  // the undead blight the ground instead of farming (#164)
  document.getElementById('tab-btn-farming').hidden = sides.player.faction === 'undead';
  document.getElementById('tab-btn-blight').hidden = sides.player.faction !== 'undead';

  const weaponActions = document.getElementById('weapon-actions');
  Object.values(GAME_CONFIG.weapons).forEach(item => {
    if (item.id !== 'fist' && !item.hidden && weaponActions) {
      weaponActions.appendChild(createConfigButton(item, craftWeapon));
    }
  });
}
