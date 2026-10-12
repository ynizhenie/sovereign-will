
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
