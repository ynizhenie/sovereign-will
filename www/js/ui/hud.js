// The top bar and the resource tiles: the wave and its timer, the base, settlers, the stock, the seed

import { GAME_CONFIG, getDefinition } from '../content/configs/index.js';
import { escapeHtml, iconHtml, setRichText } from './icons.js';
import { renderBuildingCard } from './building-card.js';
import { t } from '../engine/platform/index.js';
import { game, townHall } from '../engine/world/index.js';
import { getCurrentPop, getMaxPop, getSelectedSettler, getUpgrade, renderSettlerInfo } from '../domains/colony/settlers/index.js';
import { countHeld, getHeldItems, hasGear } from '../domains/colony/equipment/index.js';
import { getResourceAmount, stock, syncFoodMix } from '../domains/colony/storage/index.js';
import { isForPlayerFaction } from '../domains/factions/index.js';

export function updateUI() {
  updateWave();
  renderBuildingCard();
  updateResourceStrip();
  updateSheetStock();
  Object.keys(GAME_CONFIG.resources).forEach(resourceKey => {
    const resourceElement = document.getElementById(resourceHudId(resourceKey));
    if (resourceElement) resourceElement.innerText = String(Math.floor(getResourceAmount(resourceKey)));
  });
  syncFoodMix();
  for (const kind of Object.keys(GAME_CONFIG.foodKinds)) {
    const el = document.getElementById(`food-kind-${kind}-txt`);
    if (el) el.innerText = String(Math.floor(game.foodMix[kind] || 0));
  }
  for (const group of GAME_CONFIG.resourceGroups.filter(g => g.held)) {
    let total = 0;
    for (const [category, id] of getHeldItems(group)) {
      const count = countHeld(category, id);
      total += count;
      const el = document.getElementById(`held-${category}-${id}-txt`);
      if (el) el.innerText = String(count);
    }
    const totalEl = document.getElementById(`group-${group.id}-txt`);
    if (totalEl) totalEl.innerText = String(total);
  }
  for (const group of GAME_CONFIG.resourceGroups.filter(g => !g.held)) {
    const total = document.getElementById(`group-${group.id}-txt`);
    let sum = 0;
    for (const id of group.members) sum += getResourceAmount(id);
    if (total) total.innerText = String(Math.floor(sum));
  }
  document.getElementById('pop-txt').innerText = `${getCurrentPop()}/${getMaxPop()}`;
  document.getElementById('base-hp-txt').innerText = `${Math.max(0, Math.ceil(townHall.hp))}/${townHall.maxHp}`;

  let btnUpgrade = document.getElementById('btn-upgrade-big');

  const selected = getSelectedSettler();
  if (selected) {
    const type = GAME_CONFIG.settlerTypes[selected.type] || GAME_CONFIG.settlerTypes.normal;
    let name = `[[${type.icon}]] ${type.label}`;
    let wName = getDefinition('weapons', selected.weapon)?.label || selected.weapon;
    let tName = selected.tool === 'none' ? '' : ' / ' + (getDefinition('tools', selected.tool)?.label || selected.tool);
    let aName = selected.armor === 'iron' ? ` / ${t('hud.ironArmor')}` : '';
    let qName = selected.quiver ? ` / ${t('hud.quiver', { n: selected.arrows || 0 })}` : '';
    // the rest of what it wears
    const gear = ['shield', 'backpack', 'wateringCan'].filter(id => hasGear(selected, id)).map(id => ` / [[${GAME_CONFIG.gear[id].icon}]]`).join('');
    setRichText(document.getElementById('selected-settler-txt'), `${name} (${wName}${tName}${aName}${qName}${gear})`);
    renderSettlerInfo(selected);
    document.getElementById('btn-deselect').style.display = 'inline-block';
    if (btnUpgrade) {
      const upgrade = getUpgrade();
      btnUpgrade.style.display = upgrade && selected.type === upgrade.from ? 'block' : 'none';
    }
  } else {
    game.selectedSettler = null;
    document.getElementById('selected-settler-txt').innerText = t('hud.nobody');
    document.getElementById('selected-info').hidden = true;
    document.getElementById('selected-bar').classList.remove('has-settler');
    document.getElementById('btn-deselect').style.display = 'none';
    if (btnUpgrade) {
      btnUpgrade.style.display = 'none';
    }
  }

}

// The wave in the middle of the top bar: its number, the time to the next as m:ss, a bar running down to
// it; the last seconds pulse, and a new wave shakes it
let shownWave = 0;
function updateWave() {
  const left = Math.max(0, Math.ceil(game.waveTimer));
  document.getElementById('wave-num').innerText = String(game.waveNum);
  document.getElementById('wave-timer').innerText = Number.isFinite(left) ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
  const share = game.waveInterval > 0 && Number.isFinite(game.waveTimer) ? game.waveTimer / game.waveInterval : 0;
  document.getElementById('wave-progress').style.width = `${Math.max(0, Math.min(1, share)) * 100}%`;
  const box = document.getElementById('top-wave');
  box.classList.toggle('soon', left <= 10);
  if (game.waveNum !== shownWave) {
    if (shownWave && game.waveNum > shownWave) { box.classList.remove('arrived'); void box.offsetWidth; box.classList.add('arrived'); }
    shownWave = game.waveNum;
  }
}

// The strip under the top bar: the base, the settlers and the pinned resources (GAME_CONFIG.resourceGroups
// pinned) of the player's faction. A tap drops down all of the stock (toggleResources)
export function renderResourceStrip() {
  const strip = document.getElementById('resource-strip');
  if (!strip) return;
  const chip = (icon, id, title) => `<span class="strip-chip" title="${escapeHtml(title)}">${iconHtml(icon)} <b id="${id}">0</b></span>`;
  let html = chip('hall', 'strip-base', t('hud.base')) + chip('worker', 'strip-pop', t('hud.people'));
  for (const group of GAME_CONFIG.resourceGroups.filter(g => g.pinned && isForPlayerFaction(g))) {
    const resource = GAME_CONFIG.resources[group.members[0]];
    if (resource) html += chip(resource.icon || group.icon, `strip-${resource.id}`, resource.label);
  }
  strip.innerHTML = `${html}<span class="strip-more">▾</span>`;
}

function updateResourceStrip() {
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
  set('strip-base', String(Math.max(0, Math.ceil(townHall.hp))));
  set('strip-pop', `${getCurrentPop()}/${getMaxPop()}`);
  for (const group of GAME_CONFIG.resourceGroups.filter(g => g.pinned)) {
    set(`strip-${group.members[0]}`, String(Math.floor(getResourceAmount(group.members[0]))));
  }
}

// The colony sheet's own stock row: each resource the tab's (tabId) prices ask for, with what the stock has of it,
// so a price and what there is to pay it with are read in one place (the friend's playtest)
export function renderSheetStock(tabId) {
  const row = document.getElementById('sheet-stock');
  const pane = document.getElementById(tabId);
  if (!row || !pane) return;
  const ids = [...new Set([...pane.querySelectorAll('.cost-part')].map(part => part.dataset.res || ''))].filter(id => GAME_CONFIG.resources[id]);
  row.innerHTML = ids.map(id => `<span class="strip-chip" data-res="${id}" title="${escapeHtml(GAME_CONFIG.resources[id].label)}">${iconHtml(GAME_CONFIG.resources[id].icon)} <b>0</b></span>`).join('');
  row.hidden = ids.length === 0;
  updateSheetStock();
}

export function updateSheetStock() {
  for (const chip of document.querySelectorAll('#sheet-stock [data-res]')) {
    const b = chip.querySelector('b');
    if (b) b.textContent = String(Math.floor(Number(stock[/** @type {HTMLElement} */ (chip).dataset.res || ''] || 0)));
  }
}

// ---- Reserves (#212): what the colony's upkeep leaves in the stock, set in the stock's drop-down

export function renderReserves() {
  const box = document.getElementById('reserves');
  if (!box) return;
  const config = GAME_CONFIG.reserves;
  box.innerHTML = `<div class="panel-heading">${escapeHtml(t('reserves.title'))}</div>`;
  const row = document.createElement('div');
  row.className = 'reserves-row';
  for (const id of config.resources.filter(r => GAME_CONFIG.resources[r] && isForPlayerFaction(GAME_CONFIG.resources[r]))) {
    const cell = document.createElement('span');
    cell.className = 'reserve';
    cell.dataset.res = id;
    const step = (delta) => () => { game.reserves[id] = Math.max(0, (game.reserves[id] || 0) + delta); renderReserves(); };
    const minus = document.createElement('button'); minus.className = 'btn'; minus.textContent = '−'; minus.addEventListener('click', step(-config.step));
    const plus = document.createElement('button'); plus.className = 'btn'; plus.textContent = '+'; plus.addEventListener('click', step(config.step));
    const value = document.createElement('b'); value.textContent = String(game.reserves[id] || 0);
    const icon = document.createElement('span'); icon.innerHTML = iconHtml(GAME_CONFIG.resources[id].icon); icon.title = GAME_CONFIG.resources[id].label;
    cell.append(icon, minus, value, plus);
    row.appendChild(cell);
  }
  box.appendChild(row);
}

export function resourceHudId(resourceKey) {
  return `resource-${resourceKey}-txt`;
}

// Open a resource group's row (closing any other), or close it if it's open
export function toggleResourceGroup(groupId) {
  for (const group of GAME_CONFIG.resourceGroups) {
    const row = document.getElementById(`group-${group.id}-members`);
    const tile = document.getElementById(`group-${group.id}`);
    if (!row) continue;
    row.hidden = group.id === groupId ? !row.hidden : true;
    if (tile) tile.classList.toggle('open', !row.hidden);
  }
}

export function updateSeedHud() {
  const seedElem = document.getElementById('hud-seed');
  if (seedElem && game.worldSeed) {
    seedElem.innerText = game.worldSeed.value;
  }
}

// The resource tiles: the base, the population, then the resources by group (GAME_CONFIG.resourceGroups):
// a tile with the group's total, tapping it opens a row with each resource in it, under the tiles
export function renderResourceTiles() {
  const resourcesHud = document.getElementById('resources-hud');
  if (!resourcesHud) return;
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
    if (!isForPlayerFaction(group)) continue; // the undead have no food groups, nor its resources' tiles
    if (group.kinds) {
      // one resource opening onto its kinds (Food: berries, bread...)
      const resource = GAME_CONFIG.resources[members[0]];
      const row = groupTile(group, `${resource.icon ? iconHtml(resource.icon) : ''} ${escapeHtml(resource.label)}: <b id="${resourceHudId(resource.id)}">0</b> ▾`, resourcesHud, details);
      for (const kind of Object.values(GAME_CONFIG[group.kinds])) {
        const item = document.createElement('div');
        item.innerHTML = `${iconHtml(kind.icon)} ${escapeHtml(kind.label)}: <b id="food-kind-${kind.id}-txt">0</b>`;
        row.appendChild(item);
      }
      continue;
    }
    if (members.length === 1) { resourceTile(GAME_CONFIG.resources[members[0]], resourcesHud); continue; }
    if (group.held) {
      const row = groupTile(group, `${iconHtml(group.icon)} ${escapeHtml(group.label)}: <b id="group-${group.id}-txt">0</b> ▾`, resourcesHud, details);
      for (const [category, id] of getHeldItems(group)) {
        const item = GAME_CONFIG[category][id];
        const cell = document.createElement('div');
        cell.innerHTML = `${item.icon ? iconHtml(item.icon) : ''} ${escapeHtml(item.label)}: <b id="held-${category}-${id}-txt">0</b>`;
        row.appendChild(cell);
      }
      continue;
    }
    const row = groupTile(group, `${iconHtml(group.icon)} ${escapeHtml(group.label)}: <b id="group-${group.id}-txt">0</b> ▾`, resourcesHud, details);
    members.forEach(id => resourceTile(GAME_CONFIG.resources[id], row));
  }
  Object.values(GAME_CONFIG.resources).filter(r => !grouped.has(r.id) && isForPlayerFaction(r)).forEach(r => resourceTile(r, resourcesHud));
  resourcesHud.after(details);
}

// A group's tile (its text as HTML) on the HUD, and its row of members (returned, to fill) in `details`,
// opened and closed by a tap on the tile
function groupTile(group, html, resourcesHud, details) {
  const tile = document.createElement('div');
  tile.className = 'resource-group';
  tile.id = `group-${group.id}`;
  tile.innerHTML = html;
  resourcesHud.appendChild(tile);
  const row = document.createElement('div');
  row.className = 'resource-group-members';
  row.id = `group-${group.id}-members`;
  row.hidden = true;
  details.appendChild(row);
  tile.addEventListener('click', () => toggleResourceGroup(group.id));
  return row;
}
