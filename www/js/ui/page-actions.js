// The page's own buttons (index.html) say what they do: data-action="setMode" data-arg="demolish". A tap
// calls the action with its argument (switchTab also gets the button)

import { switchTab } from './bottom-panel.js';
import { GAME_CONFIG } from '../content/configs/index.js';
import { game } from '../engine/world/index.js';
import { getPlayerFaction } from '../domains/factions/index.js';
import { openHallCard } from './building-card.js';
import { craftArrows, disarmSettler, orderGear, orderGearOff, showCraftKind } from '../domains/colony/equipment/index.js';
import { repairAllBuildings } from '../domains/economy/building/index.js';
import { deselectSettler, dismissSettler, ensureUnitName, generateUnitName, getSelectedSettler, getSelection, selectAllSoldiers, switchPossession, unpossess, upgradeToBig } from '../domains/colony/settlers/index.js';
import { clearOrders, holdPosition } from '../domains/conflict/combat/index.js';
import { toggleGiveList, updateUI } from './hud.js';
import { t } from '../engine/platform/index.js';
import { setRichText } from './icons.js';
import { togglePause } from '../app/index.js';
import { setMode } from './map-input.js';
import { closeOverlays, reopenSheet, stopPlacing, toggleResources, toggleSheet } from './sheets.js';
import { openWorldMap } from './world-map.js';
import { closeSelectedCard, openSelectedNameEditor } from './selected-card-state.js';

export const PAGE_ACTIONS = {
  togglePause: () => togglePause(),
  switchPossession: () => {
    const selected = getSelectedSettler();
    switchPossession();
    if (selected?.isPossessed) {
      closeSelectedCard();
      updateUI();
    }
  },
  unpossess: () => unpossess(), // (#326: from the button over the closed card)
  deselectSettler: () => deselectSettler(),
  upgradeToBig: () => upgradeToBig(),
  repairAllBuildings: () => repairAllBuildings(),
  craftArrows: () => craftArrows(),
  setMode: mode => setMode(mode),
  orderGear: id => orderGear(id),
  orderGearOff: id => orderGearOff(id),
  disarmSettler: what => disarmSettler(what),
  switchTab: (tabId, button) => switchTab(button, tabId),
  showCraftKind: kind => showCraftKind(kind),
  // the undead's blight spreading by itself (#253): on and off, till there's none left to blight
  toggleAutoBlight: () => { if (!game.autoBlightDone) game.autoBlight = !game.autoBlight; },
  openHall: () => openHallCard(),
  // Point: back to selecting, nothing open and nobody selected (#232)
  pointMode: () => { setMode('interact'); closeOverlays(); deselectSettler(); },
  toggleSheet: name => toggleSheet(name),
  reopenSheet: () => reopenSheet(),
  stopPlacing: () => stopPlacing(),
  toggleResources: () => toggleResources(),
  openWorldMap: () => openWorldMap(), // (#299)
  dismissSelected: (arg, button) => dismissSelected(button), // (#314)
  // (#326) the selected settler's card
  toggleGiveList: () => toggleGiveList(),
  openSelectedNameEditor: () => openSelectedNameEditor(getSelectedSettler()),
  generateSelectedName: () => {
    const selected = getSelectedSettler();
    if (selected) {
      const { pet } = GAME_CONFIG.settlerTypes[selected.type] || {};
      selected.name = generateUnitName(getPlayerFaction().id, !!selected.look?.female, game.settlers, pet || null);
      selected.nameGenerated = true;
    }
  },
  selectAllSoldiers: () => selectAllSoldiers(),
  toggleAddingToGroup: () => { game.addingToGroup = !game.addingToGroup; },
  freeSelection: () => { for (const s of getSelection()) clearOrders(s); },
  holdSelection: () => { for (const s of getSelection()) holdPosition(s); } // (#326)
};

// (#314) Letting the selected settler go: the first tap asks ("Let go?"), a second within 3 s does it
function dismissSelected(button) {
  const b = button || document.getElementById('btn-dismiss');
  if (!b.classList.contains('asking')) {
    b.classList.add('asking');
    setRichText(b, t('btn.dismissAsk'));
    setTimeout(() => { b.classList.remove('asking'); setRichText(b, t('btn.dismiss')); }, 3000);
    return;
  }
  b.classList.remove('asking');
  setRichText(b, t('btn.dismiss'));
  dismissSettler(getSelectedSettler());
}

// What this file sets up as the game starts (called by app/boot.js)
export function initPageActions() {
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', () => PAGE_ACTIONS[button.dataset.action](button.dataset.arg, button));
  });
  const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('selected-name'));
  nameInput.addEventListener('change', () => {
    const selected = getSelectedSettler();
    if (!selected) return;
    const name = nameInput.value.trim().slice(0, nameInput.maxLength);
    if (name) { selected.name = name; selected.nameGenerated = false; }
    nameInput.value = ensureUnitName(selected, getPlayerFaction().id, game.settlers);
  });
}
