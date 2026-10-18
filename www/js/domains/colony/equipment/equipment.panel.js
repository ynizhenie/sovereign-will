// The Craft tab (#248, #261): Tools, Weapons and Gear as sub-tabs, each in sections by where it's made (by
// hand at the town hall, at a workshop, at a smithy), a compact tile each: its icon, name and cost, how many
// wait in the armory. Tapping the tile makes one (into the armory); under a tile with some stored, a button
// to hand one out and one to take one apart. Arrows are with the weapons.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { iconHtml, makeTile, renderSheetStock } from '../../../ui/index.js';
import { onTap, t } from '../../../engine/platform/index.js';
import { game } from '../../../engine/world/index.js';
import { stock } from '../storage/index.js';
import { isForPlayerFaction } from '../../factions/index.js';
import { craftArrows, giveStored, makeToStore, takeApartStored } from './equipment.rules.js';
import { craftPlace } from './equipment.crafting.js';

export const CRAFT_KINDS = ['tools', 'weapons', 'gear'];
const PLACES = ['hand', 'workshop', 'smithy'];

// What a sub-tab shows: [category, item] the player's faction makes
/** @returns {[string, any][]} */
function itemsOfKind(kind) {
  if (kind === 'tools') return Object.values(GAME_CONFIG.tools).filter(isForPlayerFaction).map(i => ['tools', i]);
  if (kind === 'gear') return Object.values(GAME_CONFIG.gear).filter(isForPlayerFaction).map(i => ['gear', i]);
  return [
    ...Object.values(GAME_CONFIG.weapons).filter(w => w.id !== 'fist' && !w.hidden).map(i => /** @type {[string, any]} */ (['weapons', i])),
    ['recipes', GAME_CONFIG.recipes.arrows]
  ];
}

// A small square button with an icon, its name in its tooltip
function iconButton(icon, title, className, action) {
  const b = document.createElement('button');
  b.className = `btn tile-act ${className}`;
  b.title = title;
  b.innerHTML = iconHtml(icon);
  onTap(b, action);
  return b;
}

/** @type {{ key: string, count: HTMLElement, acts: HTMLElement | null, give: HTMLButtonElement | null, apart: HTMLButtonElement | null, recipe: boolean }[]} */
let tiles = [];

// One sub-tab's sections into its pane
function renderKind(kind) {
  const pane = document.getElementById(`craft-${kind}`);
  if (!pane) return;
  pane.innerHTML = '';
  const items = itemsOfKind(kind);
  for (const place of PLACES) {
    const here = items.filter(([category, item]) => craftPlace(category, item.id) === place);
    if (!here.length) continue;
    const heading = document.createElement('div');
    heading.className = 'panel-heading';
    heading.textContent = t(`craft.place.${place}`);
    const grid = document.createElement('div');
    grid.className = 'tile-grid';
    for (const [category, item] of here) {
      const key = `${category}:${item.id}`, recipe = category === 'recipes';
      const wrap = document.createElement('div');
      wrap.className = 'tile-wrap';
      wrap.dataset.item = key;
      const tile = makeTile(item, recipe ? ` → ${item.produces.arrows}` : '');
      tile.dataset.info = key;
      tile.id = `btn-${item.id}`; // (as the old buttons were)
      onTap(tile, () => (recipe ? craftArrows() : makeToStore(category, item.id)));
      const count = document.createElement('span');
      count.className = 'tile-count';
      tile.appendChild(count);
      wrap.appendChild(tile);
      let acts = null, give = null, apart = null;
      if (!recipe) {
        acts = document.createElement('div');
        acts.className = 'tile-acts';
        give = iconButton('ok', t('craft.give'), 'row-give', () => giveStored(category, item.id));
        apart = iconButton('no', t('craft.takeApart'), 'row-apart', () => takeApartStored(category, item.id));
        acts.append(give, apart);
        wrap.appendChild(acts);
      }
      grid.appendChild(wrap);
      tiles.push({ key, count, acts, give, apart, recipe });
    }
    pane.append(heading, grid);
  }
}

export function renderCraftLists() {
  tiles = [];
  for (const kind of CRAFT_KINDS) renderKind(kind);
  showCraftKind(shownKind);
  updateCraftLists(true);
}

// The sub-tab showing (Tools, Weapons or Gear)
let shownKind = 'tools';
export function showCraftKind(kind) {
  shownKind = kind;
  for (const k of CRAFT_KINDS) {
    const pane = document.getElementById(`craft-${k}`);
    if (pane) pane.hidden = k !== kind;
    const button = document.getElementById(`craft-tab-${k}`);
    if (button) button.classList.toggle('on', k === kind); // (not 'active': setMode takes that off every button)
  }
  renderSheetStock('tab-craft'); // (what this sub-tab's prices ask for)
}

// Each frame (updateUI): how many wait in the armory, and whether there's one to hand out or take apart
let shown = '';
export function updateCraftLists(force = false) {
  const key = JSON.stringify(game.armory) + '|' + (stock.arrows || 0);
  if (!force && key === shown) return;
  shown = key;
  for (const r of tiles) {
    const stored = r.recipe ? Math.floor(stock.arrows || 0) : game.armory[r.key] || 0;
    r.count.textContent = stored > 0 ? `×${stored}` : '';
    r.count.title = t('craft.stored', { n: stored });
    if (r.acts) r.acts.hidden = stored <= 0;
  }
}
