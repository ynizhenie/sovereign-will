// The door of modes/battle/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { drawBattleOverlay, drawBattleResult } from './battle.draw.js';
export { initBattlePanel } from './battle.panel.js';
export { battleOrders, updateBattle } from './battle.rules.js';
export { battle, battleTap, leaveBattleMode } from './battle.setup.js';
