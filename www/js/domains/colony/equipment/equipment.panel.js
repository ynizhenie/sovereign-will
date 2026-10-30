// The Craft tab (#248, #261; #279: no sub-tabs): Tools, Weapons and Gear one after the other, each headed, in sections by where it's made (by
// hand at the town hall, at a workshop, at a smithy), a compact tile each: its icon, name and cost, how many
// wait in the armory. Tapping the tile makes one (into the armory); under a tile with some stored, a button
// to hand one out and one to take one apart. Recipes (into the stock) by their kind: arrows with the
// weapons (#248) and supplies.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { iconHtml, makeTile, renderSheetStock, tileMark } from '../../../ui/index.js';
import { onTap, t } from '../../../engine/platform/index.js';
import { game } from '../../../engine/world/index.js';
import { stock } from '../storage/index.js';
import { isForPlayerFaction } from '../../factions/index.js';
import { craftRecipe, giveStored, makeToStore, takeApartRecipe, takeApartStored } from './equipment.rules.js';
import { craftPlace, findWorkplace, getCraftOrderCost } from './equipment.crafting.js';

export const CRAFT_KINDS = ['tools', 'weapons', 'gear', 'supplies'];
const PLACES = ['hand', 'workshop', 'smithy'];

// What a sub-tab shows: [category, item] the player's faction makes
/** @returns {[string, any][]} */
function itemsOfKind(kind) {
  /** @type {[string, any][]} */
  const recipes = Object.values(GAME_CONFIG.recipes).filter(r => r.kind === kind && isForPlayerFaction(r)).map(r => ['recipes', r]);
  if (kind === 'tools') return [...Object.values(GAME_CONFIG.tools).filter(isForPlayerFaction).map(i => /** @type {[string, any]} */ (['tools', i])), ...recipes];
  if (kind === 'gear') return [...Object.values(GAME_CONFIG.gear).filter(isForPlayerFaction).map(i => /** @type {[string, any]} */ (['gear', i])), ...recipes];
  if (kind === 'supplies') return recipes;
  return [...Object.values(GAME_CONFIG.weapons).filter(w => w.id !== 'fist' && !w.hidden).map(i => /** @type {[string, any]} */ (['weapons', i])), ...recipes];
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

/** @type {{ key: string, category: string, id: string, button: HTMLButtonElement, count: HTMLElement, acts: HTMLElement | null, give: HTMLButtonElement | null, apart: HTMLButtonElement | null, recipe: string | null }[]} */
let tiles = [];

// One sub-tab's sections into its pane
function renderKind(kind) {
  const pane = document.getElementById(`craft-${kind}`);
  if (!pane) return;
  pane.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'craft-kind';
  title.textContent = t(`craft.kind.${kind}`);
  pane.appendChild(title);
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
      const tile = makeTile(item, recipe ? ` [[to]] ${Object.values(item.produces)[0]}` : '');
      tile.dataset.info = key;
      tile.id = category === 'recipes' && item.id !== 'arrows' ? `btn-recipe-${item.id}` : `btn-${item.id}`; // (as the old buttons were)
      onTap(tile, () => (recipe ? craftRecipe(item.id) : makeToStore(category, item.id)));
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
      } else if (item.disassemble) {
        acts = document.createElement('div');
        acts.className = 'tile-acts';
        apart = iconButton('no', t('craft.takeApart'), 'row-apart', () => takeApartRecipe(item.id));
        acts.appendChild(apart);
        wrap.appendChild(acts);
      }
      grid.appendChild(wrap);
      tiles.push({ key, category, id: item.id, button: tile, count, acts, give, apart, recipe: recipe ? Object.keys(item.produces)[0] : null });
    }
    pane.append(heading, grid);
  }
}

export function renderCraftLists() {
  tiles = [];
  for (const kind of CRAFT_KINDS) renderKind(kind);
  renderSheetStock('tab-craft'); // (what its prices ask for)
  updateCraftLists(true);
}

// A kind's section brought into view (Tools, Weapons or Gear; there are no sub-tabs any more, #279)
export function showCraftKind(kind) {
  const pane = document.getElementById(`craft-${kind}`);
  if (pane && pane.scrollIntoView) pane.scrollIntoView({ block: 'start' });
}

// Each frame (updateUI): how many wait in the armory, and whether there's one to hand out or take apart; a
// lock on what's made at a workshop or a smithy not built yet (27.10, 20)
let shown = '';
export function updateCraftLists(force = false) {
  const built = Object.fromEntries(PLACES.map(place => [place, !!findWorkplace(place)]));
  const key = JSON.stringify(game.armory) + '|' + JSON.stringify(stock) + '|' + JSON.stringify(built);
  if (!force && key === shown) return;
  shown = key;
  for (const r of tiles) {
    const noPlace = !built[craftPlace(r.category, r.id)];
    r.button.classList.toggle('no-place', noPlace);
    tileMark(r.button, 'tile-lock', 'lock', noPlace);
    const cost = getCraftOrderCost(r.category, r.id);
    r.button.dataset.craftCost = JSON.stringify(cost);
    const stored = r.recipe ? Math.floor(stock[r.recipe] || 0) : game.armory[r.key] || 0; // (a recipe: what it makes, in the stock)
    r.count.textContent = stored > 0 ? `×${stored}` : '';
    r.count.title = t('craft.stored', { n: stored });
    if (r.acts) {
      const recipe = r.recipe ? GAME_CONFIG.recipes[r.key.slice('recipes:'.length)] : null;
      const minToApart = recipe && recipe.disassemble ? Object.values(recipe.produces)[0] / (recipe.batches || 1) : 1;
      r.acts.hidden = stored < minToApart;
    }
  }
}
