// What a thing in a sheet is and does (#213): a card over the open sheet with its name, a line about it
// (item.desc, from the language files) and its numbers from the config. With a mouse it shows while the
// pointer is over the thing's button; on a touch screen the first tap on a button shows it, the second
// presses the button. Buttons say what they are with data-info="<config category>:<id>".

import { GAME_CONFIG } from '../content/configs/index.js';
import { statLabel } from '../engine/platform/index.js';
import { TILE_SIZE } from '../engine/world/index.js';
import { escapeHtml, iconHtml } from './icons.js';
import { getFreeStock } from '../domains/colony/storage/index.js';
import { answerPressedButton, pressedAt, pressedButton } from './widgets.js';

const round = (n, digits = 1) => String(Math.round(n * 10 ** digits) / 10 ** digits);
const tiles = px => `${round(px / TILE_SIZE)} ${statLabel('tiles')}`;
const percent = share => `−${Math.round(share * 100)}%`;

// An item's numbers, [label key, value] each, by its config category
/** @returns {[string, string][]} */
export function getItemStats(category, item) {
  /** @type {[string, string | number | undefined][]} */
  let stats = [];
  if (category === 'settlerTypes') {
    stats = [['hp', item.hp], ['speed', item.speed], ['strength', `×${item.damageMultiplier}`], ['places', item.population], ['loads', item.carryLoads]];
  } else if (category === 'weapons' && item.combat) {
    stats = [['damage', item.combat.damage], ['hits', item.combat.cooldown ? round(1 / item.combat.cooldown) : undefined],
      ['reach', tiles(item.combat.range || item.combat.approach)]];
  } else if (category === 'tools') {
    stats = [['fight', item.combatDamage]];
  } else if (category === 'gear') {
    if (item.hpBonus) stats.push(['hp', `+${item.hpBonus}`]);
    if (item.damageReduction) stats.push(['cut', percent(item.damageReduction)]);
    if (item.extraLoads) stats.push(['loads', `+${item.extraLoads}`]);
    if (item.charges) stats.push(['charges', item.charges], ['growth', `×${item.growthFactor}`]);
  } else if (category === 'buildings') {
    const build = item.build || {};
    stats = [['durability', build.hp], ['housing', item.population && `+${item.population}`], ['heal', item.healPerSecond]];
    if (build.tower) stats.push(['archers', build.tower.capacity], ['reach', `+${Math.round((build.tower.reach - 1) * 100)}%`]);
    if (build.trap) stats.push(['damage', build.trap.damage], ['uses', build.trap.uses]);
  } else if (category === 'recipes') {
    stats = Object.entries(item.produces || {}).map(([id, n]) => ['makes', `${n}${GAME_CONFIG.resources[id] ? ` ${GAME_CONFIG.resources[id].label}` : ''}`]);
  }
  return /** @type {[string, string][]} */ (stats.filter(([, value]) => value !== undefined && value !== null && value !== 0 && value !== '').map(([key, value]) => [key, String(value)]));
}

// The card's HTML for data-info="<category>:<id>", or '' for nothing known
export function itemInfoHtml(info) {
  const [category, id] = String(info).split(':');
  const item = GAME_CONFIG[category] && GAME_CONFIG[category][id];
  if (!item) return '';
  const stats = getItemStats(category, item).map(([key, value]) => `<span class="info-stat">${escapeHtml(statLabel(key))}: <b>${escapeHtml(value)}</b></span>`).join('');
  return `<div class="info-title">${item.icon ? iconHtml(item.icon) : ''} ${escapeHtml(item.label || id)}</div>` +
    (item.desc ? `<div class="info-desc">${escapeHtml(item.desc)}</div>` : '') +
    (stats ? `<div class="info-stats">${stats}</div>` : '') + costHtml(category, item);
}

// What it costs against what the stock has (#232): "wood 10/10 · stone 5/7", then what's left after, or
// what's short (instead of a notice when its button can't be paid)
function costHtml(category, item) {
  const cost = Object.entries((category === 'settlerTypes' ? item.hireCost : item.cost) || {}).filter(([, n]) => n > 0);
  if (!cost.length) return '';
  const rows = cost.map(([id, need]) => ({ id, need, have: Math.floor(getFreeStock(id)) }));
  const short = rows.filter(r => r.have < r.need);
  const icon = id => iconHtml((GAME_CONFIG.resources[id] || {}).icon || id);
  const parts = rows.map(r => `<span class="info-cost${r.have < r.need ? ' short' : ''}">${icon(r.id)} <b>${r.have}/${r.need}</b></span>`).join('');
  const after = short.length
    ? `<span class="info-cost short">${escapeHtml(statLabel('short'))}: ${short.map(r => `${icon(r.id)} ${r.need - r.have}`).join(' ')}</span>`
    : `<span class="info-cost">${escapeHtml(statLabel('left'))}: ${rows.map(r => `${icon(r.id)} ${r.have - r.need}`).join(' ')}</span>`;
  return `<div class="info-stats info-costs"><span class="info-stat">${escapeHtml(statLabel('cost'))}:</span>${parts}</div><div class="info-stats">${after}</div>`;
}

// A button just pressed that couldn't be paid for: its card shows what's short, the button shakes; false
// when there's no such button (then a notice says it)
export function showCostOnButton() {
  const button = pressedButton;
  if (!button || performance.now() - pressedAt > 600 || !(button.dataset.info || button.closest('[data-item]'))) return false;
  if (!showInfo(button)) return false;
  answerPressedButton(false);
  return true;
}

function showInfo(button) {
  // (a row's own button: the row's thing, #248)
  const row = /** @type {HTMLElement | null} */ (button.closest('[data-item]'));
  const html = itemInfoHtml(button.dataset.info || (row && row.dataset.item) || '');
  const card = document.getElementById('info-card');
  if (!card || !html) return false;
  card.innerHTML = html;
  document.body.classList.add('info-open');
  return true;
}

export function hideInfo() {
  document.body.classList.remove('info-open');
}

// On a touch screen: the button whose card shows, waiting for a second tap to be pressed
/** @type {HTMLElement | null} */
let armed = null;

function arm(button) {
  if (armed) armed.classList.remove('armed');
  armed = button;
  if (button) button.classList.add('armed');
}

// What's picked and shown goes (the sheet closed or switched)
export function resetItemInfo() {
  arm(null);
  hideInfo();
}

// What this file sets up as the game starts (called by app/boot.js)
export function initItemInfo() {
  const area = document.getElementById('hud-bottom');
  const buttonAt = e => /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-info]'));
  // a mouse: the card while it's over a button; a click presses it at once
  area.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    // (anywhere on a list's row, its thing's card, #248)
    const button = buttonAt(e) || /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-item]'));
    if (button) showInfo(button); else hideInfo();
  });
  area.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideInfo(); });
  // a touch (the friend's playtest): the first tap on a button shows its card and doesn't press it; a
  // second tap on the same button presses it (and again, for another one); a tap elsewhere puts it away
  let swallow = false;
  area.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') swallow = false; });
  area.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse') return;
    const button = buttonAt(e);
    if (!button) { resetItemInfo(); return; }
    if (button === armed) return; // the second tap: pressed as usual
    if (showInfo(button)) { arm(button); swallow = true; }
  });
  // ahead of the buttons' own (onTap listens for touchend and click; data-action ones for click)
  for (const type of ['touchend', 'click']) {
    area.addEventListener(type, e => {
      if (!swallow) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }
}
