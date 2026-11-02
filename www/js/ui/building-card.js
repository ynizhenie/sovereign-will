// A building's card (#211): a tap on a building or the town hall opens it as a sheet: its name, how it
// stands, what's in it, and what can be done there. The town hall's has the hiring; a damaged one its
// repair; the demons' circle takes the selected settler in.

import { GAME_CONFIG, getDefinition } from '../content/configs/index.js';
import { t } from '../engine/platform/index.js';
import { game, townHall } from '../engine/world/index.js';
import { formatCost, storeCapacity, storeHome, storedTotal } from '../domains/colony/storage/index.js';
import { getHallRepairStep, getRepairStep, toggleBuildingRepair } from '../domains/economy/building/index.js';
import { getPlayerFaction } from '../domains/factions/index.js';
import { getSelectedSettler } from '../domains/colony/settlers/index.js';
import { craftPlace } from '../domains/colony/equipment/index.js';
import { isShelter } from '../domains/conflict/healing/index.js';
import { escapeHtml, getResourceIconName, iconHtml, setRichText } from './icons.js';
import { getOpenSheet, openSheet } from './sheets.js';
import { showNotification } from './toasts.js';
import { closeSelectedCard } from './selected-card-state.js';

/** @type {any} the town hall or a building */
let shown = null;
let shownKey = '';
let sacrificeVictim = null;

export function openBuildingCard(target) {
  const definition = target === townHall ? null : getDefinition('buildings', target.type);
  sacrificeVictim = definition && definition.sacrifice ? getSelectedSettler() : null;
  closeSelectedCard();
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
  const victim = getSelectedSettler() || sacrificeVictim;
  if (!victim) return;
  victim.sacrificeAt = circle;
  game.selectedSettler = null;
  sacrificeVictim = null;
  showNotification(t('sacrifice.going', { name: victim.name || GAME_CONFIG.settlerTypes[victim.type].label }), false);
}

// (#279) what lies in a storage, kind by kind, the most first; what lies by it in packs; and with more than
// one storage, what it keeps
function renderStoreContents(b, isStorage) {
  const el = document.getElementById('card-store');
  if (!el) return;
  el.hidden = !isStorage;
  if (!isStorage) { el.innerHTML = ''; return; }
  const chip = (id, n) => `<span class="res-chip">${iconHtml(getResourceIconName(id))} ${Math.floor(n)}</span>`;
  const inside = Object.entries(b.store || {}).filter(([, n]) => n >= 1).sort((a, c) => c[1] - a[1]);
  const by = packsBy(b);
  const keeps = Object.keys(GAME_CONFIG.resources).filter(id => storeHome(id) === b && GAME_CONFIG.resources[id] && !GAME_CONFIG.resources[id].intangible && (!GAME_CONFIG.resources[id].factions || GAME_CONFIG.resources[id].factions.includes(getPlayerFaction().id)));
  el.innerHTML = `<div class="card-store-line"><b>${escapeHtml(t('card.storeInside'))}</b> ${inside.length ? inside.map(([id, n]) => chip(id, n)).join(' ') : escapeHtml(t('card.storeEmpty'))}</div>` +
    (by.length ? `<div class="card-store-line"><b>${escapeHtml(t('card.storeBy'))}</b> ${by.map(([id, n, packs]) => `${chip(id, n)}<small>×${packs}</small>`).join(' ')}</div>` : '') +
    (keeps.length ? `<div class="card-store-line"><b>${escapeHtml(t('card.storeKeeps'))}</b> ${keeps.map(id => iconHtml(getResourceIconName(id))).join(' ')}</div>` : '');
}

// The packs lying by a storage, kind by kind: [id, how much, how many packs]
function packsBy(b) {
  const reach = (b === townHall ? townHall.radius : 15) + 50;
  /** @type {Object<string, [number, number]>} */
  const sums = {};
  for (const p of game.piles) {
    if (Math.max(Math.abs(p.x - b.x), Math.abs(p.y - b.y)) > reach) continue;
    const s = sums[p.type] = sums[p.type] || [0, 0];
    s[0] += p.amount; s[1]++;
  }
  return Object.entries(sums).filter(([, v]) => v[0] >= 1).sort((a, c) => c[1][0] - a[1][0]).map(([id, v]) => [id, v[0], v[1]]);
}

// Redrawn as it changes (each frame from updateUI while it's open)
export function renderBuildingCard() {
  if (getOpenSheet() !== 'building' || !shown) return;
  const b = shown, isHall = b === townHall;
  if (!isHall && !game.buildings.includes(b)) return; // gone: what was there stays till it's closed
  const def = isHall ? null : getDefinition('buildings', b.type);
  const selected = getSelectedSettler() || sacrificeVictim;
  // what's being made here (#211): the town hall's, or a smithy's
  const place = isHall ? 'hand' : def && def.crafts;
  const queue = place ? game.craftOrders.filter(o => craftPlace(o.category, o.id) === place) : [];
  const queueText = queue.map(o => `${GAME_CONFIG[o.category][o.id].label} ${o.stage === 'work' ? `${Math.floor(o.progress * 100)}%` : t('card.waiting')}`).join(', ');
  const storeKey = isHall || b.type === 'warehouse' ? JSON.stringify(b.store || {}) + packsBy(b).map(p => p.join(':')).join(',') : '';
  const key = [queueText, storeKey, isHall, b.type, b.baitLeft, b.bait, Math.floor(storedTotal(b)), Math.ceil(b.hp), b.repairRequested, b.arrows, b.fuelLeft, b.oreLoaded, b.coalLoaded, b.ironProduced, selected && selected.id].join('|');
  if (key === shownKey) return;
  shownKey = key;
  const { name, icon } = isHall ? hallName() : { name: def ? def.label : b.type, icon: def ? def.icon : 'build' };
  document.getElementById('card-title').innerHTML = `${iconHtml(icon)} ${escapeHtml(name)}`;
  const info = [t('card.hp', { hp: Math.max(0, Math.ceil(b.hp)), max: b.maxHp })];
  if (b.type === 'fish_trap') info.push(t('card.fish', { n: b.fish || 0, max: GAME_CONFIG.buildings.fish_trap.fishTrap.holds })); // (#199)
  // its bait (#248): a fish trap's catches left on it, an iron trap's food
  if (b.type === 'fish_trap' || b.type === 'iron_trap') {
    const bait = b.type === 'fish_trap' ? b.baitLeft || 0 : b.bait || 0;
    info.push(bait > 0 ? t('card.bait', { n: bait }) : t('card.noBait'));
  }
  if (b.type === 'dung_heap') info.push(t('card.dung', { n: b.dung || 0, max: GAME_CONFIG.buildings.dung_heap.dungCapacity })); // (#232)
  if (b.type === 'campfire') info.push(t('card.fuel', { n: Math.round(b.fuelLeft || 0) }));
  if (isHall || b.type === 'warehouse') info.push(t('card.stored', { n: Math.floor(storedTotal(b)), max: storeCapacity(b) })); // (#248)
  if (b.type === 'smelter') info.push(t('card.smelter', { ore: b.oreLoaded || 0, coal: b.coalLoaded || 0, iron: b.ironProduced || 0 }));
  if (def && def.desc) info.push(def.desc);
  if (queueText) info.push(t('card.queue', { list: queueText }));
  setRichText(document.getElementById('card-info'), info.join(' · '));
  renderStoreContents(b, isHall || b.type === 'warehouse');
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
    const cost = isHall ? getHallRepairStep().left : getRepairStep(b).cost; // (#326: the hall's, all that's left)
    add(b.repairRequested ? t('card.repairCancel') : t('card.repair', { cost: formatCost(cost) }), () => {
      if (isHall) townHall.repairRequested = !townHall.repairRequested;
      else toggleBuildingRepair(b);
    });
  }
  if (def && def.sacrifice) {
    if (selected) {
      add(t('card.sacrifice', { name: selected.name || GAME_CONFIG.settlerTypes[selected.type].label }), () => sacrificeSelected(b), 'btn btn-demolish');
    } else {
      actions.insertAdjacentHTML('beforeend', `<span class="card-hint">${escapeHtml(t('sacrifice.pick'))}</span>`);
    }
  }
}
