// The Units tab (#326, 27.10, 7): every one of the colony's settlers and pets, a row each: what it is and holds,
// its hp, what it's doing, when it eats. A tap on a row picks it (its card, as a tap on it on the map) and the
// camera goes to it; the picked one's row opens: what it holds, each to take off, and what in the armory it
// can be given

import { GAME_CONFIG, getDefinition } from '../content/configs/index.js';
import { camera, clampCamera, onTap, t } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';
import { getHungerSeconds, getSelectedSettler, roleTitle } from '../domains/colony/settlers/index.js';
import { givableTo } from '../domains/colony/equipment/index.js';
import { getPlayerFaction } from '../domains/factions/index.js';
import { setRichText } from './icons.js';
import { fillGearChips, fillGiveList, heldGear } from './hud.js';

// soldiers and archers first, then the workers, then the pets
const ORDER = { soldier: 0, archer: 1, worker: 2, pet: 3 };

// One line about it: what it's doing, when it eats (if its faction eats), a temporary one's time left
function stateOf(s) {
  const key = `activity.${s.activity || 'patrol'}`;
  const parts = [t(key) === key ? t('activity.patrol') : t(key)];
  if (s.role !== 'pet' && getPlayerFaction().eats) parts.push(t('info.hungry', { seconds: Math.max(0, Math.ceil(getHungerSeconds(s))) }));
  if (s.temporary !== undefined) parts.push(t('info.crumbles', { seconds: Math.ceil(s.temporary) }));
  if (s.panic) parts.push(t('info.panic'));
  return parts.join(' · ');
}

function pickUnit(s) {
  game.selectedSettler = game.selectedSettler === s ? null : s;
  game.selectedGroup = []; game.addingToGroup = false;
  if (game.selectedSettler) { camera.x = s.x; camera.y = s.y; clampCamera(); }
  shown = '';
  updateUnitsTab(true);
}

// Each frame while the tab is open (updateUI): the rows, made again only when something on them changed
let shown = '';
export function updateUnitsTab(force = false) {
  const pane = document.getElementById('tab-units');
  if (!pane || (!force && !pane.classList.contains('active'))) return;
  const units = [...game.settlers].sort((a, b) => (ORDER[a.role] ?? 2) - (ORDER[b.role] ?? 2) || a.id - b.id);
  const picked = getSelectedSettler();
  const key = units.map(s => `${s.id}:${s.type}:${s.role}:${s.tool}:${s.weapon}:${Math.ceil(s.hp / 5)}:${stateOf(s)}:${heldGear(s).map(g => g[2]).join(',')}:${s.targetEquipment ? 1 : 0}`).join('|') +
    `#${picked ? picked.id : ''}#${picked ? givableTo(picked).map(i => i.join(':')).join(',') : ''}`;
  if (!force && key === shown) return;
  shown = key;
  pane.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'panel-heading';
  heading.textContent = t('units.count', { n: units.length });
  pane.appendChild(heading);
  if (!units.length) return;
  const list = document.createElement('div');
  list.className = 'units-list';
  for (const s of units) {
    const kind = GAME_CONFIG.settlerTypes[s.type] || GAME_CONFIG.settlerTypes.normal;
    const row = document.createElement('div');
    row.className = 'unit-row' + (s === picked ? ' picked' : '');
    row.dataset.unit = String(s.id);
    const head = document.createElement('button');
    head.className = 'btn unit-head';
    const holds = heldGear(s).map(([, , id]) => (getDefinition('tools', id) || getDefinition('weapons', id) || GAME_CONFIG.gear[id] || {}).icon).filter(Boolean);
    const title = kind.pet ? kind.label : `${kind.label} · ${roleTitle(s)}`;
    const name = document.createElement('span');
    name.className = 'unit-name';
    setRichText(name, `[[${kind.icon}]] ${title} ${holds.map(i => `[[${i}]]`).join('')}`);
    head.appendChild(name);
    const hp = document.createElement('span');
    hp.className = 'unit-hp';
    const bar = document.createElement('span');
    bar.style.width = `${Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100))}%`;
    hp.appendChild(bar);
    const state = document.createElement('span');
    state.className = 'unit-state';
    setRichText(state, stateOf(s));
    head.append(hp, state);
    onTap(head, () => pickUnit(s));
    row.appendChild(head);
    // the picked one: what it holds (each to take off) and what it can be given
    if (s === picked) {
      const gear = document.createElement('div');
      gear.className = 'selected-gear unit-gear';
      const items = heldGear(s);
      if (items.length) fillGearChips(gear, s, items, () => updateUnitsTab(true));
      else gear.textContent = t('units.holdsNothing');
      row.appendChild(gear);
      if (s.role !== 'pet' && !s.temporary && game.gameMode === 'endless') {
        const give = document.createElement('div');
        give.className = 'give-list unit-give';
        fillGiveList(give, s, givableTo(s), () => updateUnitsTab(true));
        row.appendChild(give);
      }
    }
    list.appendChild(row);
  }
  pane.appendChild(list);
}
