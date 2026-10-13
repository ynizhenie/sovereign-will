// The Tools and Weapons tabs: a button for each tool and weapon the faction makes, and the labels of the
// craft and gear buttons (index.html) from the config

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { createConfigButton, labelButton } from '../../../ui/index.js';
import { formatCost } from '../storage/index.js';
import { isForPlayerFaction } from '../../factions/index.js';
import { assignTool, craftWeapon } from './equipment.rules.js';

export function renderToolsTab() {
  const toolActions = document.getElementById('tool-actions');
  Object.values(GAME_CONFIG.tools).filter(isForPlayerFaction).forEach(item => {
    if (toolActions) toolActions.appendChild(createConfigButton(item, assignTool));
  });
}

export function renderGearLabels() {
  const recipes = GAME_CONFIG.recipes;
  labelButton('btn-craft-arrows', `[[${recipes.arrows.icon}]] ${recipes.arrows.label} (${formatCost(recipes.arrows.cost)} → ${recipes.arrows.produces.arrows})`);
  for (const item of Object.values(GAME_CONFIG.gear)) {
    labelButton(`btn-${item.id}`, `[[${item.icon}]] ${item.label} (${formatCost(item.cost)})`);
    const button = document.getElementById(`btn-${item.id}`);
    if (button) button.hidden = !isForPlayerFaction(item);
  }
}

export function renderWeaponsTab() {
  const weaponActions = document.getElementById('weapon-actions');
  Object.values(GAME_CONFIG.weapons).forEach(item => {
    if (item.id !== 'fist' && !item.hidden && weaponActions) {
      weaponActions.appendChild(createConfigButton(item, craftWeapon));
    }
  });
}
