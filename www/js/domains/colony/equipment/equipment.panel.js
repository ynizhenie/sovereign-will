// The Tools and Weapons tabs: a button for each tool and weapon the faction makes, and the labels of the
// craft and gear buttons (index.html) from the config

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { createConfigButton, escapeHtml, iconHtml, labelButton } from '../../../ui/index.js';
import { t } from '../../../engine/platform/index.js';
import { game } from '../../../engine/world/index.js';
import { formatCost } from '../storage/index.js';
import { isForPlayerFaction, sides } from '../../factions/index.js';
import { assignTool, craftWeapon } from './equipment.rules.js';

export function renderToolsTab() {
  const toolActions = document.getElementById('tool-actions');
  Object.values(GAME_CONFIG.tools).filter(isForPlayerFaction).forEach(item => {
    if (toolActions) toolActions.appendChild(createConfigButton(item, assignTool, 'tools'));
  });
}

export function renderGearLabels() {
  const recipes = GAME_CONFIG.recipes;
  const arrows = document.getElementById('btn-craft-arrows');
  if (arrows) arrows.dataset.info = 'recipes:arrows';
  labelButton('btn-craft-arrows', `[[${recipes.arrows.icon}]] ${recipes.arrows.label} (${formatCost(recipes.arrows.cost)} → ${recipes.arrows.produces.arrows})`);
  for (const item of Object.values(GAME_CONFIG.gear)) {
    labelButton(`btn-${item.id}`, `[[${item.icon}]] ${item.label} (${formatCost(item.cost)})`);
    // gear a faction doesn't have: neither its button nor taking it apart (#200)
    const buttons = [document.getElementById(`btn-${item.id}`), document.querySelector(`[data-action="orderGearOff"][data-arg="${item.id}"]`)];
    for (const button of buttons) if (button) button.hidden = !isForPlayerFaction(item);
    if (buttons[0]) buttons[0].dataset.info = `gear:${item.id}`;
  }
}

// ---- Quotas (#210): under the tools and the weapons, how many of each to keep held (− n +), and how many
// wait in the armory; redrawn only when something changed

let shownQuotas = '';
export function renderQuotas(force = false) {
  const key = JSON.stringify([game.quotas, game.armory, sides.player.faction]);
  if (!force && key === shownQuotas) return;
  shownQuotas = key;
  const lists = {
    tools: Object.values(GAME_CONFIG.tools).filter(isForPlayerFaction),
    weapons: Object.values(GAME_CONFIG.weapons).filter(w => w.id !== 'fist' && !w.hidden)
  };
  for (const [category, items] of Object.entries(lists)) {
    const box = document.getElementById(`quotas-${category}`);
    if (!box) continue;
    box.innerHTML = `<div class="panel-heading">${escapeHtml(t('quota.title'))}</div>`;
    const row = document.createElement('div');
    row.className = 'reserves-row';
    for (const item of items) {
      const quotaKey = `${category}:${item.id}`;
      const cell = document.createElement('span');
      cell.className = 'reserve';
      cell.dataset.quota = quotaKey;
      cell.title = item.label;
      const step = delta => () => { game.quotas[quotaKey] = Math.max(0, (game.quotas[quotaKey] || 0) + delta); renderQuotas(true); };
      const button = (label, delta) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.addEventListener('click', step(delta)); return b; };
      const value = document.createElement('b');
      value.textContent = String(game.quotas[quotaKey] || 0);
      const icon = document.createElement('span');
      icon.innerHTML = iconHtml(item.icon);
      cell.append(icon, button('−', -1), value, button('+', 1));
      const stored = game.armory[quotaKey] || 0;
      if (stored > 0) { const s = document.createElement('small'); s.textContent = t('quota.stored', { n: stored }); cell.append(s); }
      row.appendChild(cell);
    }
    box.appendChild(row);
  }
}

export function renderWeaponsTab() {
  const weaponActions = document.getElementById('weapon-actions');
  Object.values(GAME_CONFIG.weapons).forEach(item => {
    if (item.id !== 'fist' && !item.hidden && weaponActions) {
      weaponActions.appendChild(createConfigButton(item, craftWeapon, 'weapons'));
    }
  });
}
