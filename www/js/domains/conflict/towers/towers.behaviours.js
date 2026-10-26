// Archers staying in their platforms (watchtowers)

import { isTowerDutyOn, releaseTowerGuard, updateTowerGuard } from './towers.rules.js';

// ---- Towers and repairs

// Archers assigned to a watchtower stay in it until the fight comes close to the town hall
export function guardTower(s, tick) {
  if (s.towerAssignment) {
    if (!isTowerDutyOn(s.towerAssignment)) {
      releaseTowerGuard(s);
    } else {
      updateTowerGuard(s, s.towerAssignment, tick.dt);
    }
    s.patrolTarget = null;
    if (s.towerAssignment) return true;
  }
  return false;
}
