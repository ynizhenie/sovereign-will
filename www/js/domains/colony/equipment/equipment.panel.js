// The Workshop and Smithy tabs (#248): a list of what's made there, a row each, scrolling: the thing in a tile
// (icon, name, cost, how many wait in the armory) and on its right a button for its description, one to make
// it, one to hand a stored one out, one to take a stored one apart. Everything without iron in it is made
// at a workshop, everything with at a smithy (craftPlace).

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { escapeHtml, iconHtml, richText } from '../../../ui/index.js';
import { onTap, t } from '../../../engine/platform/index.js';
import { game } from '../../../engine/world/index.js';
import { formatCost, stock } from '../storage/index.js';
import { isForPlayerFaction } from '../../factions/index.js';
import { craftArrows, giveStored, makeToStore, takeApartStored } from './equipment.rules.js';
import { craftPlace } from './equipment.crafting.js';

// What each list shows: [category, item] the player's faction makes there
/** @returns {[string, any][]} */
function itemsMadeAt(place) {
  /** @type {[string, any][]} */
  const all = [];
  const add = (category, items) => { for (const item of items) all.push([category, item]); };
  add('tools', Object.values(GAME_CONFIG.tools).filter(isForPlayerFaction));
  add('weapons', Object.values(GAME_CONFIG.weapons).filter(w => w.id !== 'fist' && !w.hidden));
  add('gear', Object.values(GAME_CONFIG.gear).filter(isForPlayerFaction));
  add('recipes', [GAME_CONFIG.recipes.arrows]);
  return all.filter(([category, item]) => craftPlace(category, item.id) === place);
}

// A small square button with an icon, its name in its tooltip
function iconButton(icon, title, className, action) {
  const b = document.createElement('button');
  b.className = `btn row-btn ${className}`;
  b.title = title;
  b.innerHTML = iconHtml(icon);
  onTap(b, action);
  return b;
}

/** @type {{ row: HTMLElement, key: string, count: HTMLElement, give: HTMLButtonElement | null, apart: HTMLButtonElement | null, recipe: boolean }[]} */
let rows = [];

// One list (place: 'workshop' or 'smithy') into its tab
function renderCraftList(place, listId) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';
  list.classList.add('craft-list');
  for (const [category, item] of itemsMadeAt(place)) {
    const key = `${category}:${item.id}`, recipe = category === 'recipes';
    const row = document.createElement('div');
    row.className = 'craft-row';
    row.dataset.item = key;
    const tile = document.createElement('div');
    tile.className = 'craft-tile';
    tile.dataset.info = key;
    const made = recipe ? ` → ${item.produces.arrows}` : '';
    tile.innerHTML = `${item.icon ? iconHtml(item.icon) : ''} <b>${escapeHtml(item.label)}</b> <span class="craft-cost">${richText(formatCost(item.cost || {}) + made)}</span>`;
    const count = document.createElement('span');
    count.className = 'craft-count';
    tile.appendChild(count);
    const info = iconButton('hint', t('craft.info'), 'row-info', () => {});
    info.dataset.info = key;
    const make = iconButton('hammer', t('craft.make'), 'row-make', () => (recipe ? craftArrows() : makeToStore(category, item.id)));
    make.id = `btn-${item.id}`; // (as the old buttons were)
    const give = recipe ? null : iconButton('ok', t('craft.give'), 'row-give', () => giveStored(category, item.id));
    const apart = recipe ? null : iconButton('no', t('craft.takeApart'), 'row-apart', () => takeApartStored(category, item.id));
    row.append(tile, info, make, ...(give ? [give] : []), ...(apart ? [apart] : []));
    list.appendChild(row);
    rows.push({ row, key, count, give, apart, recipe });
  }
}

export function renderCraftLists() {
  rows = [];
  renderCraftList('workshop', 'workshop-list');
  renderCraftList('smithy', 'smithy-list');
  updateCraftLists(true);
}

// Each frame (updateUI): how many wait in the armory, and whether there's one to hand out or take apart
let shown = '';
export function updateCraftLists(force = false) {
  const key = JSON.stringify(game.armory) + '|' + (stock.arrows || 0);
  if (!force && key === shown) return;
  shown = key;
  for (const r of rows) {
    const stored = r.recipe ? Math.floor(stock.arrows || 0) : game.armory[r.key] || 0;
    r.count.textContent = stored > 0 ? t('craft.stored', { n: stored }) : '';
    if (r.give) r.give.disabled = stored <= 0;
    if (r.apart) r.apart.disabled = stored <= 0;
  }
}
