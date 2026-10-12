// The page's own buttons (index.html) say what they do: data-action="setMode" data-arg="demolish". A tap
// calls the action with its argument (switchTab also gets the button)

const PAGE_ACTIONS = {
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
function initPageActions() {
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', () => PAGE_ACTIONS[button.dataset.action](button.dataset.arg, button));
  });
}
