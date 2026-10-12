// The page's own buttons (index.html) say what they do: data-action="setMode" data-arg="demolish". A tap
// calls the action with its argument (switchTab also gets the button)

import { switchTab } from './bottom-panel.js';
import { craftArrows, disarmSettler, orderGear, orderGearOff } from '../domains/colony/equipment/equipment.rules.js';
import { repairAllBuildings } from '../domains/economy/building/building.rules.js';
import { deselectSettler, switchPossession, upgradeToBig } from '../domains/colony/settlers/settlers.rules.js';
import { togglePause } from '../app/session.js';
import { setMode } from './map-input.js';

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
  switchTab: (tabId, button) => switchTab(button, tabId)
};

// What this file sets up as the game starts (called by app/boot.js)
export function initPageActions() {
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', () => PAGE_ACTIONS[button.dataset.action](button.dataset.arg, button));
  });
}
