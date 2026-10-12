
// Spike traps: a unit stepping onto a spike tile takes its damage once per visit; each visit uses one
// of the trap's uses, and it breaks when they run out. Runs once a tick after movement.
function applySpikeTraps() {
  const tiles = getTileIndex();
  if (tiles.spikes.size === 0) return;
  const spikesAt = new Map(buildings.filter(b => b.type === 'spikes').map(b => [`${b.x},${b.y}`, b]));
  const step = (unit, hurt) => {
    const g = getGridPos(unit.x, unit.y);
    const key = `${g.gx * TILE_SIZE + 15},${g.gy * TILE_SIZE + 15}`;
    const trap = spikesAt.get(key);
    if (!trap) { unit.spikeTile = null; return; }
    if (unit.spikeTile === key || trap.usesLeft <= 0) return;
    unit.spikeTile = key;
    hurt(getDefinition('buildings', 'spikes').build.trap.damage);
    trap.usesLeft--;
    if (trap.usesLeft <= 0) {
      buildings.splice(buildings.indexOf(trap), 1);
      invalidateAllPaths();
    }
  };
  for (const s of settlers) if (!s.towerAssignment) step(s, damage => damageSettler(s, damage));
  for (const en of enemies) step(en, damage => { en.hp -= damage; bleed(en, null); });
}

// The demons' portals (#43): built in pairs, the 1st with the 2nd, the 3rd with the 4th...
function getPortalPairs() {
  const portals = buildings.filter(b => b.type === 'portal');
  const pairs = [];
  for (let i = 0; i + 1 < portals.length; i += 2) pairs.push([portals[i], portals[i + 1]], [portals[i + 1], portals[i]]);
  return pairs;
}

// A settler going somewhere a portal pair gets it to quicker: walks into the near portal and steps out of
// the far one (next to it). Returns where to walk to instead, or null to go straight; true once stepped through.
const PORTAL_SAVING = 90; // px the way through must save to be worth it

function takePortal(entity, targetX, targetY) {
  const direct = Math.hypot(targetX - entity.x, targetY - entity.y);
  for (const [near, far] of getPortalPairs()) {
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
