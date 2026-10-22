// (#299) The base's land, Endless only: settlers work and the player builds only on it. A square round the
// town hall as big as a default map (GAME_CONFIG.territory.startTiles: the start as it was), and round each
// building (but walls, doors, spikes, traps, torches and crops: `skip`) a circle of buildingTiles, so the base
// spreads as it's built out. Elsewhere (Battles, the editor, the menu's world) all the map is the base's.
//
// Kept as a tile mask, made again only when the buildings change, with the box round it (what's searched
// for work: a big map's resources far off aren't even looked at).

import { GAME_CONFIG } from '../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, listStamp, townHall } from '../../engine/world/index.js';
import { ctx, getViewRect } from '../../engine/platform/index.js';
import { setReachBounds } from '../../engine/movement/index.js';

const config = () => GAME_CONFIG.territory;

/** @type {{ stamp: any[], mask: Uint8Array, box: { x0: number, y0: number, x1: number, y1: number } } | null} */
let territory = null;

// Off while the settlers are in an enemy camp (a raid's: its own small map, #255)
let enabled = true;
export function setTerritoryEnabled(on) { enabled = on; }

// Whether there's a base's land at all (Endless, at home), or all the map counts
export const hasTerritory = () => enabled && game.gameMode === 'endless';

function counts(b) {
  return !config().skip.includes(b.type);
}

export function getTerritory() {
  const stamp = [game.COLS, game.ROWS, townHall.x, townHall.y, ...listStamp(game.buildings)];
  if (territory && territory.stamp.length === stamp.length && territory.stamp.every((v, i) => v === stamp[i])) return territory;
  const mask = new Uint8Array(game.COLS * game.ROWS);
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  const mark = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS) return;
    mask[gy * game.COLS + gx] = 1;
    gx0 = Math.min(gx0, gx); gy0 = Math.min(gy0, gy); gx1 = Math.max(gx1, gx); gy1 = Math.max(gy1, gy);
  };
  const hall = getGridPos(townHall.x, townHall.y), half = config().startTiles / 2;
  for (let gy = Math.ceil(hall.gy - half); gy < hall.gy + half; gy++) for (let gx = Math.ceil(hall.gx - half); gx < hall.gx + half; gx++) mark(gx, gy);
  const r = config().buildingTiles;
  for (const b of game.buildings) {
    if (!counts(b)) continue;
    const g = getGridPos(b.x, b.y);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) mark(g.gx + dx, g.gy + dy);
  }
  const box = { x0: gx0 * TILE_SIZE, y0: gy0 * TILE_SIZE, x1: (gx1 + 1) * TILE_SIZE, y1: (gy1 + 1) * TILE_SIZE };
  territory = { stamp, mask, box };
  return territory;
}

// Whether (x, y) is on the base's land (anywhere, out of Endless)
export function inTerritory(x, y) {
  if (!hasTerritory()) return true;
  const gx = Math.floor(x / TILE_SIZE), gy = Math.floor(y / TILE_SIZE);
  if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS) return false;
  return getTerritory().mask[gy * game.COLS + gx] === 1;
}

// The box round the base's land (all the map, out of Endless)
export function getTerritoryBox() {
  return hasTerritory() ? getTerritory().box : { x0: 0, y0: 0, x1: game.WORLD_WIDTH, y1: game.WORLD_HEIGHT };
}

// The frontier: the box round the base's land widened by waveTiles (and the border's width), within the map.
// What the map's edge was to waves, scouts, enemies running away, corpses carried out and raids: where they
// come in from and go off to. A default-sized map's is the whole map, as before. In tiles, both ends in it
/** @returns {{ gx0: number, gy0: number, gx1: number, gy1: number }} */
export function getFrontierTiles() {
  const all = { gx0: 0, gy0: 0, gx1: game.COLS - 1, gy1: game.ROWS - 1 };
  if (!hasTerritory()) return all;
  const box = getTerritory().box, d = config().waveTiles + BORDER_MARGIN;
  return {
    gx0: Math.max(0, box.x0 / TILE_SIZE - d), gy0: Math.max(0, box.y0 / TILE_SIZE - d),
    gx1: Math.min(game.COLS - 1, box.x1 / TILE_SIZE - 1 + d), gy1: Math.min(game.ROWS - 1, box.y1 / TILE_SIZE - 1 + d)
  };
}

// The same in world units: from the frontier's outer side to its outer side
export function getFrontier() {
  const f = getFrontierTiles();
  return { x0: f.gx0 * TILE_SIZE, y0: f.gy0 * TILE_SIZE, x1: (f.gx1 + 1) * TILE_SIZE, y1: (f.gy1 + 1) * TILE_SIZE };
}

// settlers' walking distances only as far as the frontier (#299: a big map's every tile was slow)
setReachBounds(() => (hasTerritory() ? getFrontierTiles() : null));

// A tile in the frontier's band (BORDER_MARGIN wide, inside its edge) or beyond it: on a default map, the
// map's border zone
export function isOutskirts(gx, gy) {
  const f = getFrontierTiles();
  return gx < f.gx0 + BORDER_MARGIN || gx > f.gx1 - BORDER_MARGIN || gy < f.gy0 + BORDER_MARGIN || gy > f.gy1 - BORDER_MARGIN;
}

// Its edge on the ground: a soft line along the tiles' sides where the land stops (only on the screen)
export function drawTerritory() {
  if (!hasTerritory()) return;
  const { mask } = getTerritory(), v = getViewRect(TILE_SIZE);
  const gx0 = Math.max(0, Math.floor(v.x0 / TILE_SIZE)), gx1 = Math.min(game.COLS - 1, Math.floor(v.x1 / TILE_SIZE));
  const gy0 = Math.max(0, Math.floor(v.y0 / TILE_SIZE)), gy1 = Math.min(game.ROWS - 1, Math.floor(v.y1 / TILE_SIZE));
  const at = (gx, gy) => gx >= 0 && gy >= 0 && gx < game.COLS && gy < game.ROWS && mask[gy * game.COLS + gx] === 1;
  ctx.save();
  ctx.strokeStyle = 'rgba(241, 196, 15, 0.35)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
  ctx.beginPath();
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      if (!at(gx, gy)) continue;
      const x = gx * TILE_SIZE, y = gy * TILE_SIZE;
      if (!at(gx, gy - 1)) { ctx.moveTo(x, y); ctx.lineTo(x + TILE_SIZE, y); }
      if (!at(gx, gy + 1)) { ctx.moveTo(x, y + TILE_SIZE); ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE); }
      if (!at(gx - 1, gy)) { ctx.moveTo(x, y); ctx.lineTo(x, y + TILE_SIZE); }
      if (!at(gx + 1, gy)) { ctx.moveTo(x + TILE_SIZE, y); ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE); }
    }
  }
  ctx.stroke();
  ctx.restore();
}
