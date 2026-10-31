// The Units tab is a roster: tap a tile to focus the camera, or use its buttons to give equipment or open its card.

import { GAME_CONFIG } from '../content/configs/index.js';
import { camera, clampCamera, onTap, t } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';
import { ensureUnitName, getSelectedSettler, roleTitle } from '../domains/colony/settlers/index.js';
import { givableTo } from '../domains/colony/equipment/index.js';
import { getPlayerFaction } from '../domains/factions/index.js';
import { iconHtml, setRichText } from './icons.js';
import { fillGiveList, updateUI } from './hud.js';
import { closeSheet } from './sheets.js';
import { openSelectedCard } from './selected-card-state.js';

const ORDER = { soldier: 0, archer: 1, worker: 2, pet: 3 };

function groupTitle(s) {
  return s.role === 'pet' ? t('role.pet') : roleTitle(s);
}

function canGive(s) {
  return game.gameMode === 'endless' && s.role !== 'pet' && !s.temporary;
}

// The activity and exceptional states only; hunger is intentionally omitted from the roster.
function stateOf(s) {
  const key = `activity.${s.activity || 'patrol'}`;
  const parts = [t(key) === key ? t('activity.patrol') : t(key)];
  if (s.temporary !== undefined) parts.push(t('info.crumbles', { seconds: Math.ceil(s.temporary) }));
  if (s.panic) parts.push(t('info.panic'));
  return parts.join(' · ');
}

function focusUnit(s) {
  camera.x = s.x; camera.y = s.y; clampCamera();
}

function openUnitCard(s) {
  openGiveId = null;
  closeSheet();
  game.selectedSettler = s;
  game.selectedGroup = []; game.addingToGroup = false;
  openSelectedCard(s);
  camera.x = s.x; camera.y = s.y; clampCamera();
  updateUI();
}

function toggleGive(s) {
  openGiveId = openGiveId === s.id ? null : s.id;
  shown = '';
  updateUnitsTab(true);
}

// Each frame while the tab is open (updateUI): the tiles, made again only when something on them changed
let shown = '', openGiveId = null;
export function updateUnitsTab(force = false) {
  const pane = document.getElementById('tab-units');
  if (!pane || (!force && !pane.classList.contains('active'))) return;
  const selected = getSelectedSettler();
  const units = [...game.settlers].sort((a, b) => (ORDER[a.role] ?? 2) - (ORDER[b.role] ?? 2) || a.id - b.id);
  if (openGiveId !== null && !units.some(s => s.id === openGiveId && canGive(s))) openGiveId = null;
  const key = units.map(s => {
    const giveItems = openGiveId === s.id ? givableTo(s).map(i => i.join(':')).join(',') : '';
    return `${s.id}:${s.name}:${s.type}:${s.role}:${s.tool}:${s.weapon}:${s.whistle ? 1 : 0}:${s.banner ? 1 : 0}:${s.petHunger || 0}:${Math.ceil(s.hp / 5)}:${stateOf(s)}:${s.targetEquipment ? 1 : 0}:${giveItems}`;
  }).join('|') + `#${openGiveId || ''}`;
  if (!force && key === shown) return;
  shown = key;
  pane.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'panel-heading';
  heading.textContent = t('units.count', { n: units.length });
  pane.appendChild(heading);
  if (!units.length) return;
  const groups = new Map();
  for (const s of units) {
    const title = groupTitle(s);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(s);
  }
  for (const [title, members] of groups) {
    const groupHeading = document.createElement('div');
    groupHeading.className = 'craft-kind units-kind';
    groupHeading.textContent = title;
    pane.appendChild(groupHeading);
    const list = document.createElement('div');
    list.className = 'tile-grid units-list';
    for (const s of members) {
      const kind = GAME_CONFIG.settlerTypes[s.type] || GAME_CONFIG.settlerTypes.normal;
      const wrap = document.createElement('div');
      wrap.className = 'tile-wrap unit-tile';
      wrap.dataset.unit = String(s.id);
      const head = document.createElement('button');
      head.className = 'btn tile unit-main';
      head.type = 'button';
      const name = document.createElement('span');
      name.className = 'tile-name';
      setRichText(name, `[[${kind.icon}]]`);
      const label = document.createElement('b');
      label.textContent = ensureUnitName(s, getPlayerFaction().id, game.settlers);
      name.appendChild(label);
      head.appendChild(name);
      const role = document.createElement('span');
      role.className = 'tile-cost';
      role.textContent = roleTitle(s);
      head.appendChild(role);
      const hp = document.createElement('span');
      hp.className = 'unit-hp';
      const bar = document.createElement('span');
      bar.style.width = `${Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100))}%`;
      hp.appendChild(bar);
      const state = document.createElement('span');
      state.className = 'unit-state';
      state.textContent = stateOf(s);
      head.append(hp, state);
      head.setAttribute('aria-label', `${t('units.focus')}: ${ensureUnitName(s, getPlayerFaction().id, game.settlers)}`);
      onTap(head, () => focusUnit(s));
      wrap.appendChild(head);

      const actions = document.createElement('div');
      actions.className = 'tile-acts';
      if (canGive(s)) {
        const giveButton = document.createElement('button');
        giveButton.className = 'btn tile-act';
        giveButton.type = 'button';
        giveButton.setAttribute('aria-label', t('units.give'));
        giveButton.innerHTML = iconHtml('backpack');
        onTap(giveButton, () => toggleGive(s));
        actions.appendChild(giveButton);
      }
      const cardButton = document.createElement('button');
      cardButton.className = 'btn tile-act';
      cardButton.type = 'button';
      cardButton.setAttribute('aria-label', t('units.openCard'));
      cardButton.innerHTML = iconHtml('card');
      onTap(cardButton, () => openUnitCard(s));
      actions.appendChild(cardButton);
      wrap.appendChild(actions);

      if (openGiveId === s.id && canGive(s)) {
        const giveList = document.createElement('div');
        giveList.className = 'give-list unit-give';
        fillGiveList(giveList, s, givableTo(s), () => { openGiveId = null; shown = ''; updateUnitsTab(true); });
        wrap.appendChild(giveList);
      }
      list.appendChild(wrap);
    }
    pane.appendChild(list);
  }
}
