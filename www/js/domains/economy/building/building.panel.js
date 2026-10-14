// The Building tab: its buildings in sections (defence, homes, economy), and the Farming tab's crops

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { createConfigButton, escapeHtml, setMode } from '../../../ui/index.js';
import { isForPlayerFaction } from '../../factions/index.js';

export function renderBuildTab() {
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
  Object.values(GAME_CONFIG.buildings).filter(isForPlayerFaction).forEach(item => {
    const actions = item.tab ? document.getElementById(`${item.tab}-actions`) : sectionFor(item.group || 'economy');
    if (actions) actions.appendChild(createConfigButton(item, setMode, 'buildings'));
  });
  for (const section of Object.values(buildSections)) section.parentNode.hidden = section.children.length === 0;
}
