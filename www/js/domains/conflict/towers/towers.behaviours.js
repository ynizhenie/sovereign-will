// Keeping towers stocked with arrows, and archers staying in theirs

import { game } from '../../../engine/world/index.js';
import { fetchFromStorage, getSpareStock, takeStock } from '../../colony/storage/index.js';
import { findTowerForArrows, isTowerDutyOn, releaseTowerGuard, updateTowerArrowLoader, updateTowerGuard } from './towers.rules.js';

// Idle unarmed workers keep watchtowers stocked with arrows, fetched from a storage
export function loadTowerArrows(s, tick) {
  if (s.isPossessed || s.role !== 'worker' || s.weapon !== 'fist' || s.tool !== 'none' || s.targetEquipment) return false;
  const load = s.carrying && s.carrying.forTower;
  if (s.carrying && !load) return false;
  if (load && !game.buildings.includes(load)) { delete s.carrying.forTower; return false; } // tower gone: back to storage
  const tower = load || findTowerForArrows(s);
  if (!tower) return false;
  s.patrolTarget = null;
  if (!s.carrying) {
    return fetchFromStorage(s, 'arrows', tick.dt, () => {
      s.carrying = { type: 'arrows', amount: takeStock('arrows', Math.min(tower.tower.arrowCapacity - tower.arrows, Math.floor(getSpareStock('arrows')))), forTower: tower };
    });
  }
  updateTowerArrowLoader(s, tower, tick.dt);
  return true;
}

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
