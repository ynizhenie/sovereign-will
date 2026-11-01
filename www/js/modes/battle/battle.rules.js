// The fight: started, called off, and over when a side has nobody left

import { t } from '../../engine/platform/index.js';
import { game, rand } from '../../engine/world/index.js';
import { showNotification } from '../../ui/index.js';
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
  for (const unit of [...game.settlers, ...game.enemies]) unit.battleAttackSpeed = 0.9 + rand() * 0.2;
  battle.phase = 'fight';
  renderBattlePanel();
}

function activeBattleUnits(units) {
  return units.filter(unit => unit.hp > 0 && !(unit.ghostly && unit.ghostGone > 0));
}

// Called every update in battle mode: the fight ends when a side has nobody left
export function updateBattle(dt) {
  updateBattleTop();
  if (battle.phase === 'fight') {
    const settlers = activeBattleUnits(game.settlers), enemies = activeBattleUnits(game.enemies);
    if (settlers.length === 0 || enemies.length === 0) {
      battle.winner = settlers.length > 0 ? 'green' : enemies.length > 0 ? 'red' : 'draw';
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
