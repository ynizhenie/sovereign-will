// The demons: portals in pairs, and the enemy's portals a wave comes through

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { getFrontierTiles } from '../../world/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, rand, townHall } from '../../../engine/world/index.js';
import { isTileOccupied } from '../../economy/building/index.js';
import { getEnemyFaction } from '../index.js';
import { getReachSteps, getSettlerReach, isTileBlockedForEnemyStrict, isTileBlockedForSettler } from '../../../engine/movement/index.js';
import { getBaseRadius } from '../../conflict/combat/index.js';

// The demons' portals: built in pairs, the 1st with the 2nd, the 3rd with the 4th... (#326) each side its own:
// the red side's (b.side 'red') or the player's
export function getPortalPairs(side = 'green') {
  const portals = game.buildings.filter(b => b.type === 'portal' && !b.raidPortal && (b.side === 'red') === (side === 'red'));
  const pairs = [];
  for (let i = 0; i + 1 < portals.length; i += 2) pairs.push([portals[i], portals[i + 1]], [portals[i + 1], portals[i]]);
  return pairs;
}

// A settler going somewhere a portal pair gets it to quicker: walks into the near portal and steps out of
// the far one (next to it). Returns where to walk to instead, or null to go straight; true once stepped through.
export const PORTAL_SAVING = 90; // px the way through must save to be worth it

export function takePortal(entity, targetX, targetY, side = 'green') {
  const direct = Math.hypot(targetX - entity.x, targetY - entity.y);
  for (const [near, far] of getPortalPairs(side)) {
    const toNear = Math.hypot(near.x - entity.x, near.y - entity.y);
    if (toNear + Math.hypot(targetX - far.x, targetY - far.y) + PORTAL_SAVING >= direct) continue;
    if (toNear > 30) return near;
    // through: out onto a free tile beside the far portal, on the side of where it's going
    const g = getGridPos(far.x, far.y);
    const exits = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]
      .filter(([dx, dy]) => !isTileBlockedForSettler(g.gx + dx, g.gy + dy))
      .sort((a, b) => Math.hypot(targetX - (far.x + a[0] * TILE_SIZE), targetY - (far.y + a[1] * TILE_SIZE)) -
        Math.hypot(targetX - (far.x + b[0] * TILE_SIZE), targetY - (far.y + b[1] * TILE_SIZE)));
    if (!exits.length) continue;
    entity.x = far.x + exits[0][0] * TILE_SIZE;
    entity.y = far.y + exits[0][1] * TILE_SIZE;
    entity.path = null;
    entity.pathTarget = null;
    return true;
  }
  return null;
}

/** @param {number} x @param {number} y @param {{ id: number } | null} [camp] */
function addDemonPortal(x, y, camp = null) {
  const g = getGridPos(x, y);
  if (isTileBlockedForEnemyStrict(g.gx, g.gy) || isTileOccupied(x, y) ||
      getReachSteps(getSettlerReach({ x: townHall.x, y: townHall.y }), g.gx, g.gy) < 0 ||
      game.enemyTents.some(t => Math.hypot(t.x - x, t.y - y) < (camp ? 1.5 : 4) * TILE_SIZE)) return null;
  const tents = GAME_CONFIG.enemyTents;
  const portal = {
    x, y, hp: tents.hp, maxHp: tents.hp, summonTimer: 0,
    summonsLeft: tents.summonsPerWave, portal: true
  };
  if (camp) Object.assign(portal, { campStructure: true, campId: camp.id, wavePortal: true });
  game.enemyTents.push(portal);
  return portal;
}

// A portal for a demon wave opens in its camp, or exactly where that wave will emerge.
/** @param {number} x @param {number} y @param {{ id: number } | null} [camp] */
export function openDemonPortalAt(x, y, camp = null) {
  return addDemonPortal(x, y, camp);
}

// A demon's wave portal: in the camp when preparing, otherwise anywhere but near the town hall.
/** @param {{ id: number, x: number, y: number, radius: number } | null} [camp] */
export function openDemonPortal(camp = null) {
  const reach = getSettlerReach({ x: townHall.x, y: townHall.y });
  const minDist = Math.max(getEnemyFaction().minPortalTiles * TILE_SIZE, getBaseRadius() + GAME_CONFIG.portalWave.awayTiles * TILE_SIZE);
  const f = getFrontierTiles(); // (#299: within the frontier, a default map's whole)
  if (camp) {
    const centre = getGridPos(camp.x, camp.y), radius = Math.max(1, (camp.radius || 0) - 1);
    const candidates = [];
    for (let gy = centre.gy - radius; gy <= centre.gy + radius; gy++) {
      for (let gx = centre.gx - radius; gx <= centre.gx + radius; gx++) {
        if (Math.hypot(gx - centre.gx, gy - centre.gy) > radius) continue;
        const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
        if (Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + TILE_SIZE ||
            getReachSteps(reach, gx, gy) < 0 || isTileBlockedForEnemyStrict(gx, gy) ||
            isTileOccupied(x, y) || game.enemyTents.some(t => Math.hypot(t.x - x, t.y - y) < 1.5 * TILE_SIZE)) continue;
        candidates.push({ x, y, d: Math.hypot(x - camp.x, y - camp.y) });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const candidate of candidates) {
      const portal = addDemonPortal(candidate.x, candidate.y, camp);
      if (portal) return portal;
    }
    return null;
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const gx = f.gx0 + BORDER_MARGIN + Math.floor(rand() * (f.gx1 - f.gx0 + 1 - 2 * BORDER_MARGIN));
    const gy = f.gy0 + BORDER_MARGIN + Math.floor(rand() * (f.gy1 - f.gy0 + 1 - 2 * BORDER_MARGIN));
    const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
    if (Math.hypot(x - townHall.x, y - townHall.y) < minDist || isTileOccupied(x, y) || getReachSteps(reach, gx, gy) < 0) continue;
    if (game.enemyTents.some(t => Math.hypot(t.x - x, t.y - y) < 4 * TILE_SIZE)) continue;
    return addDemonPortal(x, y);
  }
  return null;
}
