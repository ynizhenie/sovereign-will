// The top bar and the resource tiles: the wave and its timer, the base, settlers, the stock, the seed

import { GAME_CONFIG, getDefinition } from '../content/configs/index.js';
import { escapeHtml, iconHtml, setRichText } from './icons.js';
import { renderBuildingCard } from './building-card.js';
import { t } from '../engine/platform/index.js';
import { game, townHall } from '../engine/world/index.js';
import { getCurrentPop, getMaxPop, getSelectedSettler, getUpgrade, renderSettlerInfo, roleTitle } from '../domains/colony/settlers/index.js';
import { countHeld, disarmSettler, getHeldItems, hasGear, orderGearOff, updateCraftLists } from '../domains/colony/equipment/index.js';
import { getResourceAmount, stock, syncFoodMix } from '../domains/colony/storage/index.js';
import { isForPlayerFaction } from '../domains/factions/index.js';
import { getDayPhase } from '../domains/world/index.js';

export function updateUI() {
  updateWave();
  updateResourcePanel(); // (#279)
  renderBuildingCard();
  updateCraftLists();
  // the blight-by-itself switch (#253): lit while on, greyed for good with none left
  const autoBlight = document.getElementById('btn-auto-blight');
  if (autoBlight) { autoBlight.classList.toggle('on', !!game.autoBlight); autoBlight.disabled = !!game.autoBlightDone; }
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
    name += ` · ${roleTitle(selected)}`; // (what it is by what it holds, #279; a commander, #248)
    let wName = getDefinition('weapons', selected.weapon)?.label || selected.weapon;
    let tName = selected.tool === 'none' ? '' : ' / ' + (getDefinition('tools', selected.tool)?.label || selected.tool);
    let aName = selected.armor ? ` / ${t(selected.armor === 'leather' ? 'hud.leatherArmor' : 'hud.ironArmor')}` : '';
    let qName = selected.quiver ? ` / ${t('hud.quiver', { n: selected.arrows || 0 })}` : '';
    // the rest of what it wears
    const gear = ['shield', 'backpack', 'wateringCan', 'whistle', 'banner', 'flute'].filter(id => hasGear(selected, id)).map(id => ` / [[${GAME_CONFIG.gear[id].icon}]]`).join('');
    setRichText(document.getElementById('selected-settler-txt'), `${name} (${wName}${tName}${aName}${qName}${gear})`);
    renderSettlerInfo(selected);
    renderSelectedGear(selected);
    document.getElementById('btn-deselect').style.display = 'inline-block';
    if (btnUpgrade) {
      const upgrade = getUpgrade();
      btnUpgrade.style.display = upgrade && selected.type === upgrade.from ? 'block' : 'none';
    }
  } else {
    game.selectedSettler = null;
    document.getElementById('selected-settler-txt').innerText = t('hud.nobody');
    document.getElementById('selected-info').hidden = true;
    renderSelectedGear(null);
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
// (#279) the dial of the day: its parts as wedges in their colours (once), the hand on now, the sun by day
// and the moon at night in the middle; hovered, what part of the day it is and how long till the next
let dialFor = '';
function updateDayClock() {
  const clock = document.getElementById('day-clock');
  if (!clock || game.gameMode !== 'endless') return;
  const c = GAME_CONFIG.daytime;
  /** @type {[string, number, string][]} */
  const parts = [['morning', c.morning, '#f5b041'], ['day', c.day, '#5dade2'], ['evening', c.evening, '#a569bd'], ['night', c.night, '#1b2631']];
  const length = parts.reduce((sum, p) => sum + p[1], 0);
  const key = parts.map(p => p[1]).join(',');
  if (dialFor !== key) {
    dialFor = key;
    let at = 0;
    clock.style.background = `conic-gradient(${parts.map(([, len, color]) => { const from = at; at += len / length * 360; return `${color} ${from}deg ${at}deg`; }).join(', ')})`;
  }
  const now = ((game.dayTime || 0) % length + length) % length;
  document.getElementById('day-hand').style.transform = `rotate(${now / length * 360 + 180}deg)`;
  const phase = getDayPhase();
  const face = document.getElementById('day-face');
  const icon = phase === 'night' ? 'moon' : 'sun';
  if (face.dataset.icon !== icon) { face.dataset.icon = icon; face.innerHTML = iconHtml(icon); }
  let end = 0;
  for (const [id, len] of parts) { end += len; if (id === phase) break; }
  const next = parts[(parts.findIndex(p => p[0] === phase) + 1) % parts.length][0];
  const left = Math.max(0, Math.ceil(end - now));
  clock.title = t('daytime.clock', { now: t(`daytime.${phase}`), next: t(`daytime.${next}`).toLowerCase(), time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` });
}

function updateWave() {
  updateDayClock();
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
  // (the sub-tab showing only, #261)
  const parts = [...pane.querySelectorAll('.cost-part')].filter(part => !part.closest('[hidden]'));
  const ids = [...new Set(parts.map(part => /** @type {HTMLElement} */ (part).dataset.res || ''))].filter(id => GAME_CONFIG.resources[id]);
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

export function resourceHudId(resourceKey) {
  return `resource-${resourceKey}-txt`;
}

export function updateSeedHud() {
  const seedElem = document.getElementById('hud-seed');
  if (seedElem && game.worldSeed) {
    seedElem.innerText = game.worldSeed.value;
  }
}

// (#279) the drop-down made plainer: a thing there's none of is hidden (and a group with none of anything);
// each resource says how much it's gone up or down in the last minute of play
/** @type {{ t: number, stock: Object<string, number> }[]} */
const samples = [];
function updateResourcePanel() {
  const now = game.pathTick / 60;
  if (!samples.length || now - samples[samples.length - 1].t >= 10) {
    samples.push({ t: now, stock: { ...stock } });
    while (samples.length > 7) samples.shift();
  }
  if (!document.body.classList.contains('resources-open')) return;
  const old = samples[0];
  for (const em of document.querySelectorAll('#resources-hud .res-rate')) {
    const id = /** @type {HTMLElement} */ (em).dataset.rate || '';
    const span = now - old.t, change = span >= 20 ? Math.round(((stock[id] || 0) - (old.stock[id] || 0)) * 60 / span) : 0;
    em.textContent = change ? `${change > 0 ? '+' : '−'}${Math.abs(change)}/${t('hud.perMinute')}` : '';
    em.classList.toggle('down', change < 0);
  }
  for (const line of document.querySelectorAll('#resources-hud .res-line')) {
    if (line.parentElement && line === line.parentElement.firstElementChild) continue; // (the base and the people, always)
    let any = false;
    for (const c of line.querySelectorAll('.res-chip')) {
      const b = c.querySelector('b'), zero = !b || b.textContent === '0';
      /** @type {HTMLElement} */ (c).hidden = zero;
      if (!zero) any = true;
    }
    /** @type {HTMLElement} */ (line).hidden = !any;
  }
}

// The stock's drop-down (#248: a drop-down of tiles that opened rows of their own was a menu in a menu in a
// menu): the base and the population, then one line a group (GAME_CONFIG.resourceGroups) with its name and
// every resource in it, an icon and a number each, all in sight at once
export function renderResourceTiles() {
  const resourcesHud = document.getElementById('resources-hud');
  if (!resourcesHud) return;
  resourcesHud.classList.add('res-lines');
  const line = (name, id = '') => {
    const el = document.createElement('div');
    el.className = 'res-line';
    if (id) el.id = `group-${id}`;
    if (name) { const n = document.createElement('span'); n.className = 'res-line-name'; n.textContent = name; el.appendChild(n); }
    resourcesHud.appendChild(el);
    return el;
  };
  // (#279) each with its name, and for a resource how it's changed in the last minute; none of it: hidden
  const chip = (parent, icon, label, id, res = '') => {
    const c = document.createElement('span');
    c.className = 'res-chip';
    c.title = label;
    c.innerHTML = `${icon ? iconHtml(icon) : ''} <b id="${id}">0</b> <small class="res-name">${escapeHtml(label)}</small>` + (res ? ` <em class="res-rate" data-rate="${res}"></em>` : '');
    parent.appendChild(c);
  };
  const top = line('');
  top.innerHTML = `<span class="res-chip">${iconHtml('hall')} ${escapeHtml(t('hud.base'))} <b id="base-hp-txt" style="color: #e74c3c;">100/100</b></span>` +
    `<span class="res-chip population-tile">${iconHtml('worker')} <b id="pop-txt" style="color: #2ecc71;">2/5</b> (${iconHtml('worker')} <b id="workers-cnt">0</b> ${iconHtml('swords')} <b id="warriors-cnt">0</b>)</span>`;
  const grouped = new Set();
  const singles = [];
  for (const group of GAME_CONFIG.resourceGroups) {
    const members = group.members.filter(id => GAME_CONFIG.resources[id]);
    members.forEach(id => grouped.add(id));
    if (!isForPlayerFaction(group)) continue; // the undead have no food groups, nor its resources
    if (group.kinds) {
      // food, and what it's made of
      const resource = GAME_CONFIG.resources[members[0]];
      const row = line(resource.label, group.id);
      chip(row, resource.icon, resource.label, resourceHudId(resource.id), resource.id);
      for (const kind of Object.values(GAME_CONFIG[group.kinds])) chip(row, kind.icon, kind.label, `food-kind-${kind.id}-txt`);
      continue;
    }
    if (group.held) {
      const row = line(group.label, group.id);
      chip(row, group.icon, group.label, `group-${group.id}-txt`);
      for (const [category, id] of getHeldItems(group)) chip(row, GAME_CONFIG[category][id].icon, GAME_CONFIG[category][id].label, `held-${category}-${id}-txt`);
      continue;
    }
    if (members.length === 1) { singles.push(GAME_CONFIG.resources[members[0]]); continue; }
    const row = line(group.label, group.id);
    members.filter(id => isForPlayerFaction(GAME_CONFIG.resources[id])).forEach(id => chip(row, GAME_CONFIG.resources[id].icon, GAME_CONFIG.resources[id].label, resourceHudId(id), id));
    // (its total, as before, for whoever reads it)
    const total = document.createElement('b'); total.id = `group-${group.id}-txt`; total.hidden = true; row.appendChild(total);
  }
  singles.push(...Object.values(GAME_CONFIG.resources).filter(r => !grouped.has(r.id) && isForPlayerFaction(r)));
  if (singles.length) {
    const row = line('');
    resourcesHud.insertBefore(row, resourcesHud.children[1] || null);
    singles.forEach(r => chip(row, r.icon, r.label, resourceHudId(r.id), r.id));
  }
}

// ---- What the selected settler holds, a "take off" on each: its tool, its weapon, its gear (the buttons
// for that used to sit in the sheets and took it off whoever, #232)

let shownGear = '';
export function renderSelectedGear(s) {
  const box = document.getElementById('selected-gear');
  if (!box) return;
  /** @type {[string, string, string][]} */
  const items = [];
  if (s) {
    if (s.tool && s.tool !== 'none') items.push(['disarmSettler', 'tool', s.tool]);
    if (s.weapon && s.weapon !== 'fist') items.push(['disarmSettler', 'weapon', s.weapon]);
    for (const id of ['armor', 'leather_armor', 'shield', 'backpack', 'wateringCan', 'whistle', 'banner', 'flute']) if (hasGear(s, id)) items.push(['orderGearOff', id, id]);
  }
  const key = `${s ? s.id : ''}|${items.map(i => i[2]).join(',')}|${s && s.targetEquipment ? 1 : 0}`;
  if (key === shownGear) return;
  shownGear = key;
  box.hidden = !items.length;
  box.innerHTML = '';
  // each: its name, then into the store whole, or taken apart (#248)
  for (const [action, arg, id] of items) {
    const def = getDefinition('tools', id) || getDefinition('weapons', id) || GAME_CONFIG.gear[id] || {};
    const chip = document.createElement('span');
    chip.className = 'gear-chip';
    setRichText(chip, `[[${def.icon || 'tools'}]] ${def.label || id}`);
    for (const keep of [true, false]) {
      const button = document.createElement('button');
      button.className = `btn btn-disarm ${keep ? 'btn-store' : 'btn-apart'}`;
      button.dataset.action = action;
      button.dataset.arg = arg;
      button.title = t(keep ? 'gearOff.store' : 'gearOff.take', { name: def.label || id });
      setRichText(button, keep ? '[[warehouse]]' : '[[no]]');
      // (made after the page's buttons were wired: its own listener)
      button.addEventListener('click', () => { if (action === 'disarmSettler') disarmSettler(arg, keep); else orderGearOff(arg, keep); shownGear = ''; });
      chip.appendChild(button);
    }
    box.appendChild(chip);
  }
}
