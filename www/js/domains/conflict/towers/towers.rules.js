// Platforms (watchtowers): archers climb them while there's tower duty, shoot from them with their own arrows,
// come down (out of arrows too, to fetch more: #326, a platform keeps none)

import { TILE_SIZE, game, getGridPos, townHall } from '../../../engine/world/index.js';
import { getWeaponStats, isCrossbowWeapon, isRangedWeapon } from '../../colony/equipment/index.js';
import { getReachSteps, getSettlerReach, isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { hasLineOfFire, isDefenseAlert } from '../combat/index.js';
import { faceTowards, startSwing } from '../../colony/settlers/index.js';
import { playSound } from '../../../app/index.js';

// Archers climb the towers while there's tower duty (they stay up when enemies reach the base, that's
// when a tower is worth most), as long as they have arrows
export function assignTowerArchers() {
  // (#326) the player's own platforms: never one of the red side's (in a battle: its archers' to climb)
  const towers = /** @type {import('../../../engine/world/types.js').Watchtower[]} */ (game.buildings.filter(building => building.type === 'watchtower' && building.side !== 'red'));
  const towerSet = new Set(towers);
  towers.forEach(tower => {
    tower.guards = (tower.guards || []).filter(guard => game.settlers.includes(guard));
  });

  game.settlers.forEach(settler => {
    if (settler.towerAssignment && (!towerSet.has(settler.towerAssignment) ||
        !settler.towerAssignment.guards.includes(settler))) {
      if (towerSet.has(settler.towerAssignment)) {
        settler.towerAssignment.guards = settler.towerAssignment.guards.filter(guard => guard !== settler);
      }
      settler.towerAssignment = null;
    }
    const canGuard = !settler.isPossessed && settler.role === 'archer' &&
      isRangedWeapon(settler.weapon) && settler.quiver && !settler.carrying && !settler.targetEquipment;
    const hasArrows = (settler.arrows || 0) > 0;
    const towerDutyActive = settler.towerAssignment && isTowerDutyOn(settler.towerAssignment) && hasArrows;
    if ((!towerDutyActive || !canGuard) && settler.towerAssignment) {
      releaseTowerGuard(settler);
    }
    if (!canGuard || settler.towerAssignment || game.pathTick < (settler.towerRestUntil || 0)) return;

    const tower = hasArrows && towers.find(candidate => isTowerDutyOn(candidate) && candidate.guards.length < candidate.tower.capacity);
    if (tower) {
      tower.guards.push(settler);
      settler.towerAssignment = tower;
    }
  });
}

// A tower is manned when enough enemies are about, or from the warning until the wave is beaten; (#326) in a
// battle while there's any enemy at all
export function isTowerDutyOn(tower) {
  if (game.gameMode === 'battle') return game.enemies.length > 0;
  return game.enemies.length >= tower.tower.minEnemies || isDefenseAlert();
}

// Where a guard climbs down: the free tile next to the tower (then further out) that can be walked to from
// the town hall, nearest the side it faces, so it never lands inside a wall or in a sealed pocket
export function findTowerExit(tower, settler) {
  const start = getGridPos(tower.x, tower.y);
  const hallReach = getSettlerReach({ x: townHall.x, y: townHall.y });
  const facing = Math.atan2(settler.y - tower.y, settler.x - tower.x) || 0;
  for (let ring = 1; ring <= 4; ring++) {
    let best = null, bestScore = Infinity;
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const gx = start.gx + dx, gy = start.gy + dy;
        if (isTileBlockedForSettler(gx, gy) || getReachSteps(hallReach, gx, gy) === -1) continue;
        let turn = Math.abs(Math.atan2(dy, dx) - facing) % (Math.PI * 2);
        if (turn > Math.PI) turn = Math.PI * 2 - turn;
        const score = turn + (dx !== 0 && dy !== 0 ? 0.5 : 0); // straight sides before corners
        if (score < bestScore) { bestScore = score; best = { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 }; }
      }
    }
    if (best) return best;
  }
  // walled in from the town hall: any free tile next to it, rather than into a wall
  for (let ring = 1; ring <= 4; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring && !isTileBlockedForSettler(start.gx + dx, start.gy + dy)) {
          return { x: (start.gx + dx) * TILE_SIZE + 15, y: (start.gy + dy) * TILE_SIZE + 15 };
        }
      }
    }
  }
  return { x: tower.x, y: tower.y };
}

export function releaseTowerGuard(settler) {
  const tower = settler.towerAssignment;
  if (!tower) return;
  tower.guards = tower.guards.filter(guard => guard !== settler);
  const spot = findTowerExit(tower, settler);
  settler.x = spot.x;
  settler.y = spot.y;
  settler.path = null;
  settler.towerAssignment = null;
}

export function updateTowerGuard(settler, tower, dt) {
  // up from a free tile beside it that can be walked to (not from the side a wall is on)
  const distanceToTower = Math.hypot(tower.x - settler.x, tower.y - settler.y);
  if (distanceToTower > 32) {
    if (!settler.towerEntry || settler.towerEntry.tower !== tower) settler.towerEntry = { tower, ...findTowerExit(tower, settler) };
    const entry = settler.towerEntry;
    if (Math.hypot(entry.x - settler.x, entry.y - settler.y) > 8) {
      moveEntityTowards(settler, entry.x, entry.y, settler.speed, false, dt);
      return;
    }
  }
  settler.towerEntry = null;

  settler.x = tower.x;
  settler.y = tower.y;

  if (settler.arrows <= 0) return;

  // (#326) it shoots with its own bow or crossbow, as on the ground (its damage, its rate, its arrows' speed), only farther:
  // the platform adds a share to its reach, nothing else
  const stats = getWeaponStats(settler, 'combat'), reach = tower.tower.reach || 1;
  const range = stats.approach * reach;
  const target = game.enemies
    .filter(enemy => Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= range &&
      hasLineOfFire(tower.x, tower.y, enemy.x, enemy.y, true))
    .sort((a, b) => Math.hypot(a.x - tower.x, a.y - tower.y) - Math.hypot(b.x - tower.x, b.y - tower.y))[0];
  // in a battle, nothing in reach for a while (an archer on the other side's platform out of reach, say): down, and back to
  // the fight on foot, not up again for a while (in Endless it waits up there for the wave, as before)
  if (!target) {
    if (game.gameMode !== 'battle') return;
    settler.towerIdle = (settler.towerIdle || 0) + dt;
    if (settler.towerIdle > (tower.tower.idleSeconds || 4)) { settler.towerIdle = 0; settler.towerRestUntil = game.pathTick + (tower.tower.restSeconds || 10) * 60; releaseTowerGuard(settler); }
    return;
  }
  settler.towerIdle = 0;
  if ((settler.towerAttackCooldown || 0) > 0) return;

  const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
  faceTowards(settler, target.x, target.y);
  // (#326) the guard's own weapon shows: a crossbowman looses a bolt with its heavy thunk, an archer an arrow;
  // and the shot is drawn, as from the ground (its next one cocked while it waits, #306)
  const bolt = isCrossbowWeapon(settler.weapon);
  playSound(bolt ? 'crossbow' : 'bow', settler);
  game.projectiles.push({
    x: tower.x,
    y: tower.y,
    vx: Math.cos(angle) * stats.projectileSpeed,
    vy: Math.sin(angle) * stats.projectileSpeed,
    damage: stats.damage * stats.multiplier,
    life: stats.projectileLife * reach,
    fromEnemy: false,
    owner: settler,
    fromTower: true,
    bolt
  });
  startSwing(settler, 0.3);
  settler.shotAt = game.pathTick; settler.shotLen = stats.cooldown;
  if (game.gameMode !== 'battle') settler.arrows--;
  settler.towerAttackCooldown = stats.cooldown;
}
