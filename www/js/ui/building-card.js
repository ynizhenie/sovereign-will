// A building's card (#211): a tap on a building or the town hall opens it as a sheet: its name, how it
// stands, what's in it, and what can be done there. The town hall's has the hiring; a damaged one its
// repair; the demons' circle takes the selected settler in.

import { GAME_CONFIG, getDefinition } from '../content/configs/index.js';
import { t } from '../engine/platform/index.js';
import { game, townHall } from '../engine/world/index.js';
import { formatCost } from '../domains/colony/storage/index.js';
import { getRepairStep, toggleBuildingRepair } from '../domains/economy/building/index.js';
import { getPlayerFaction } from '../domains/factions/index.js';
import { getSelectedSettler } from '../domains/colony/settlers/index.js';
import { isShelter } from '../domains/conflict/healing/index.js';
import { escapeHtml, iconHtml, setRichText } from './icons.js';
import { getOpenSheet, openSheet } from './sheets.js';
import { showNotification } from './toasts.js';

/** @type {any} the town hall or a building */
let shown = null;
let shownKey = '';

export function openBuildingCard(target) {
  shown = target;
  shownKey = '';
  openSheet('building', target === townHall ? 'hall' : `${target.type}@${target.x},${target.y}`);
  renderBuildingCard();
}

export function openHallCard() {
  openBuildingCard(townHall);
}

function hallName() {
  const hall = getPlayerFaction().hall || 'hall';
  return { name: t(`hall.${hall}`), icon: hall === 'hall' ? 'hall' : hall };
}

// The circle's card: the selected settler goes into it (and dies there, healing everyone)
export function sacrificeSelected(circle) {
  const victim = getSelectedSettler();
  if (!victim) return;
  victim.sacrificeAt = circle;
  game.selectedSettler = null;
  showNotification(t('sacrifice.going', { name: GAME_CONFIG.settlerTypes[victim.type].label }), false);
}

// Redrawn as it changes (each frame from updateUI while it's open)
export function renderBuildingCard() {
  if (getOpenSheet() !== 'building' || !shown) return;
  const b = shown, isHall = b === townHall;
  if (!isHall && !game.buildings.includes(b)) return; // gone: what was there stays till it's closed
  const def = isHall ? null : getDefinition('buildings', b.type);
  const selected = getSelectedSettler();
  const key = [isHall, b.type, Math.ceil(b.hp), b.repairRequested, b.arrows, b.fuelLeft, b.oreLoaded, b.coalLoaded, b.ironProduced, selected && selected.id].join('|');
  if (key === shownKey) return;
  shownKey = key;
  const { name, icon } = isHall ? hallName() : { name: def ? def.label : b.type, icon: def ? def.icon : 'build' };
  document.getElementById('card-title').innerHTML = `${iconHtml(icon)} ${escapeHtml(name)}`;
  const info = [t('card.hp', { hp: Math.max(0, Math.ceil(b.hp)), max: b.maxHp })];
  if (b.tower) info.push(t('card.arrows', { n: b.arrows || 0, max: b.tower.arrowCapacity }));
  if (b.type === 'campfire') info.push(t('card.fuel', { n: Math.round(b.fuelLeft || 0) }));
  if (b.type === 'smelter') info.push(t('card.smelter', { ore: b.oreLoaded || 0, coal: b.coalLoaded || 0, iron: b.ironProduced || 0 }));
  if (def && def.desc) info.push(def.desc);
  setRichText(document.getElementById('card-info'), info.join(' · '));
  document.getElementById('card-hall').hidden = !isHall;
  // actions
  const actions = document.getElementById('card-actions');
  actions.innerHTML = '';
  const add = (html, run, className = 'btn') => {
    const button = document.createElement('button');
    button.className = className;
    setRichText(button, html);
    button.addEventListener('click', () => { run(); shownKey = ''; renderBuildingCard(); });
    actions.appendChild(button);
  };
  if (b.hp < b.maxHp && !(def && isShelter(b))) {
    const cost = isHall ? GAME_CONFIG.repairs.townHall.cost : getRepairStep(b).cost;
    add(b.repairRequested ? t('card.repairCancel') : t('card.repair', { cost: formatCost(cost) }), () => {
      if (isHall) townHall.repairRequested = !townHall.repairRequested;
      else toggleBuildingRepair(b);
    });
  }
  if (def && def.sacrifice) {
    if (selected) {
      add(t('card.sacrifice', { name: GAME_CONFIG.settlerTypes[selected.type].label }), () => sacrificeSelected(b), 'btn btn-demolish');
    } else {
      actions.insertAdjacentHTML('beforeend', `<span class="card-hint">${escapeHtml(t('sacrifice.pick'))}</span>`);
    }
  }
}
