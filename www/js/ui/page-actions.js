// The page's own buttons (index.html) say what they do: data-action="setMode" data-arg="demolish". A tap
// calls the action with its argument (switchTab also gets the button)

import { switchTab } from './bottom-panel.js';
import { openHallCard } from './building-card.js';
import { craftArrows, disarmSettler, orderGear, orderGearOff, showCraftKind } from '../domains/colony/equipment/index.js';
import { repairAllBuildings } from '../domains/economy/building/index.js';
import { deselectSettler, switchPossession, upgradeToBig } from '../domains/colony/settlers/index.js';
import { togglePause } from '../app/index.js';
import { setMode } from './map-input.js';
import { closeOverlays, reopenSheet, stopPlacing, toggleResources, toggleSheet } from './sheets.js';

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
  openHall: () => openHallCard(),
  // Point: back to selecting, nothing open and nobody selected (#232)
  pointMode: () => { setMode('interact'); closeOverlays(); deselectSettler(); },
  toggleSheet: name => toggleSheet(name),
  reopenSheet: () => reopenSheet(),
  stopPlacing: () => stopPlacing(),
  toggleResources: () => toggleResources()
};

// What this file sets up as the game starts (called by app/boot.js)
export function initPageActions() {
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', () => PAGE_ACTIONS[button.dataset.action](button.dataset.arg, button));
  });
}
