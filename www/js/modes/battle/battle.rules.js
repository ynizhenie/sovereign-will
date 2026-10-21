// The fight: started, called off, and over when a side has nobody left

import { getDefinition } from '../../content/configs/index.js';
import { t } from '../../engine/platform/index.js';
import { game } from '../../engine/world/index.js';
import { showNotification } from '../../ui/index.js';
import { fightByOrders } from '../../domains/conflict/combat/index.js';
import { BATTLE_RESULT_SECONDS, battle, resetBattleUnits } from './battle.setup.js';
import { renderBattlePanel, updateBattleTop } from './battle.panel.js';

// Stop a fight and put the line-up back as it was placed
export function cancelBattleFight() {
  if (battle.phase !== 'fight') return;
  battle.phase = 'setup';
  game.settlers.forEach(s => { s.isPossessed = false; });
  resetBattleUnits();
  renderBattlePanel();
}

export function startBattleFight() {
  if (battle.phase !== 'setup' || game.settlers.length === 0 || game.enemies.length === 0) {
    showNotification(t('battle.needBoth'), true);
    return;
  }
  battle.phase = 'fight';
  renderBattlePanel();
}

// Called every update in battle mode: the fight ends when a side has nobody left
export function updateBattle(dt) {
  updateBattleTop();
  if (battle.phase === 'fight') {
    if (game.settlers.length === 0 || game.enemies.length === 0) {
      battle.winner = game.settlers.length > 0 ? 'green' : game.enemies.length > 0 ? 'red' : 'draw';
      battle.phase = 'result';
      battle.resultTimer = BATTLE_RESULT_SECONDS;
    }
  } else if (battle.phase === 'result') {
    battle.resultTimer -= dt;
    if (battle.resultTimer <= 0) {
      battle.phase = 'setup';
      battle.winner = null;
      resetBattleUnits();
      renderBattlePanel();
    }
  }
}

// Yours with the auto battle off (#255): they hold where they were placed and fight what they're told to (or
// whatever comes at them); a behaviour of every settler's, after the possessed
export function battleOrders(s, tick) {
  if (game.gameMode !== 'battle' || battle.phase !== 'fight' || battle.auto) return false;
  // (#306) a necromancer or a medic does its own work (raising, healing) as in Endless, unless it was told
  // to go for one: the orders took it over and it only fought
  const healer = (getDefinition('tools', s.tool) || {}).necromancer || s.tool === 'medbag';
  if (healer && !s.orderTarget && !s.orderSpot) return false;
  fightByOrders(s, tick.dt, false);
  return true;
}
