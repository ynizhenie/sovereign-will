// The page's own buttons (index.html) say what they do: data-action="setMode" data-arg="demolish". A tap
// calls the action with its argument (switchTab also gets the button)

import { switchTab } from './bottom-panel.js';
import { game } from '../engine/world/index.js';
import { openHallCard } from './building-card.js';
import { craftArrows, disarmSettler, orderGear, orderGearOff, showCraftKind } from '../domains/colony/equipment/index.js';
import { repairAllBuildings } from '../domains/economy/building/index.js';
import { deselectSettler, dismissSettler, getSelectedSettler, getSelection, selectAllSoldiers, switchPossession, upgradeToBig } from '../domains/colony/settlers/index.js';
import { clearOrders } from '../domains/conflict/combat/index.js';
import { toggleGiveList } from './hud.js';
import { t } from '../engine/platform/index.js';
import { setRichText } from './icons.js';
import { togglePause } from '../app/index.js';
import { setMode } from './map-input.js';
import { closeOverlays, reopenSheet, stopPlacing, toggleResources, toggleSheet } from './sheets.js';
import { openWorldMap } from './world-map.js';

export const PAGE_ACTIONS = {
  togglePause: () => togglePause(),
  switchPossession: () => switchPossession(),
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
  selectAllSoldiers: () => selectAllSoldiers(),
  toggleAddingToGroup: () => { game.addingToGroup = !game.addingToGroup; },
  freeSelection: () => { for (const s of getSelection()) clearOrders(s); }
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
}
