// The fight: started, called off, and over when a side has nobody left

import { t } from '../../engine/platform/index.js';
import { game } from '../../engine/world/index.js';
import { showNotification } from '../../ui/index.js';
import { BATTLE_RESULT_SECONDS, battle, resetBattleUnits } from './battle.setup.js';
import { renderBattlePanel } from './battle.panel.js';

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
