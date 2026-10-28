// How far a resource is worked through

import { TILE_SIZE, forEachInRect, game, listStamp } from '../../../engine/world/index.js';
import { paintOn, drawBoulderArt, drawBushArt, drawCactusArt, drawGrassArt, drawLogArt, drawPebblesArt, drawSaplingArt, drawStickArt, drawStumpArt, drawTreeArt } from './gathering.art.js';
import { ctx, drawProgressBar, getViewRect, getViewScale } from '../../../engine/platform/index.js';
import { getMapResourceDef, getMapResourceKind } from './gathering.rules.js';
import { CHUNK, drawChunks, drawOreVeins, getSun, isGroundCached } from '../../world/index.js';

export function getHarvestMaxHp(resource) {
  if (resource.maxHp) return resource.maxHp;
  const def = getMapResourceDef(getMapResourceKind(resource));
  return (def && def.hp) || 1;
}

export function drawHarvestProgress(resource, width = 24) {
  let maxHp = getHarvestMaxHp(resource);
  drawProgressBar(resource.x, resource.y, (maxHp - Math.max(0, resource.hp)) / maxHp, width);
}

// (#299) only what's on the screen (with room for a tree's crown over the edge): a big map has thousands
const onScreen = (list, fn) => { const v = getViewRect(2 * TILE_SIZE); forEachInRect(list, v.x0, v.y0, v.x1, v.y1, fn); };

// Sticks and pebbles, and minable ore
export function drawSticksPebblesOre() {
  // (the look: gathering.art.js, #251)
  onScreen(game.sticks, drawStickArt);
  onScreen(game.pebbles, drawPebblesArt);
  onScreen(game.logs, drawLogArt); // (#298)

  // minable ore: the spawner's veined rock on a full tile, like natural rock (the spawner adds a frame and crystal)
  // (zoomed out: in the ground's pictures, #299)
  const pictured = isGroundCached();
  onScreen(game.ironOres, ore => {
    if (!pictured) drawOreVeins(ore.x, ore.y, 'iron', 14);
    drawHarvestProgress(ore);
  });

  onScreen(game.coalOres, ore => {
    if (!pictured) drawOreVeins(ore.x, ore.y, 'coal', 14);
    drawHarvestProgress(ore);
  });
}

// ---- Nature in pictures (#322)
//
// Trees, cacti, boulders and berry bushes (and the stumps) stand still: drawn one by one each frame, a forest on
// the screen was most of what a zoomed out frame cost (the number on the screen grows with the square of the
// zoom out). Zoomed out they're drawn once into the ground's kind of pictures (see drawChunks) and laid down;
// a piece is painted again when something in or round it comes, goes or changes, or the sun's moved enough
// for the shadows. What changes meanwhile (a sapling, a falling tree, a bar of work done, apples being picked)
// is drawn over them as before. Zoomed in the few on the screen are drawn as ever.
const MARGIN = 40; // (world px of a tree's crown and its shadow past its foot)
const REFRESH_TICKS = 3;
const pictured = () => typeof document !== 'undefined' && getViewScale() < 1;
// as fine as the screen shows (a power of two), never finer than a world unit
const natureRes = () => Math.min(1, 2 ** Math.ceil(Math.log2(Math.max(getViewScale(), 0.0625))));
const standing = o => !o.isGrowing && !o.fallen;
const sunKey = () => { const s = getSun(); return `${Math.round(s.dx * 10)},${Math.round(s.dy * 10)},${Math.round(s.alpha * 50)}`; };
const natureLists = () => [game.stumps, game.trees, game.cacti, game.boulders, game.berryBushes];

// the things of a list in and round a rectangle, in rows of tiles (the same order whichever piece paints them)
/** @param {any[]} list @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {((o: any) => boolean) | null} [keep] */
function around(list, x0, y0, x1, y1, keep = null) {
  /** @type {any[]} */
  const found = [];
  forEachInRect(list, x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN, o => { if (!keep || keep(o)) found.push(o); });
  return found.sort((a, b) => Math.floor(a.y / TILE_SIZE) - Math.floor(b.y / TILE_SIZE) || Math.floor(a.x / TILE_SIZE) - Math.floor(b.x / TILE_SIZE));
}

// What a piece's nature is like: the things in it with how they look (grown, felled, apples ripe), looked at again every
// few ticks or when a list changed, not every frame
/** @type {{ lists: any[], tick: number, stamps: Map<string, string> }} */
let stamps = { lists: [], tick: -Infinity, stamps: new Map() };
/** @param {number} cx @param {number} cy */
function natureStamp(cx, cy) {
  const lists = /** @type {any[]} */ (natureLists().flatMap(listStamp));
  if (game.pathTick - stamps.tick >= REFRESH_TICKS || game.pathTick < stamps.tick || lists.length !== stamps.lists.length || lists.some((v, i) => v !== stamps.lists[i])) {
    stamps = { lists, tick: game.pathTick, stamps: new Map() };
  }
  const key = `${cx},${cy}`;
  let stamp = stamps.stamps.get(key);
  if (stamp === undefined) {
    const size = CHUNK * TILE_SIZE, x0 = cx * size, y0 = cy * size;
    let h = 0;
    natureLists().forEach((list, n) => forEachInRect(list, x0 - MARGIN, y0 - MARGIN, x0 + size + MARGIN, y0 + size + MARGIN, o => {
      h = (h * 31 + o.x * 7919 + o.y * 31 + n + (standing(o) ? 1 : 0) + (o.applesReady ? 2 : 0) + (o.apple ? 4 : 0)) | 0;
    }));
    stamps.stamps.set(key, (stamp = `${h}|${sunKey()}`));
  }
  return stamp;
}

/** @param {CanvasRenderingContext2D} g @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
function paintNature(g, x0, y0, x1, y1) {
  paintOn(g);
  try {
    for (const st of around(game.stumps, x0, y0, x1, y1)) drawStumpArt(st);
    for (const t of around(game.trees, x0, y0, x1, y1, standing)) drawTreeArt(t);
    for (const o of around(game.cacti, x0, y0, x1, y1)) drawCactusArt(o);
    for (const o of around(game.boulders, x0, y0, x1, y1)) drawBoulderArt(o);
    for (const o of around(game.berryBushes, x0, y0, x1, y1)) drawBushArt(o);
  } finally { paintOn(null); }
}

// What's drawn over the pictures: the things on the screen that aren't just standing there (looked for every few ticks)
/** @type {{ tick: number, trees: any[], others: any[] }} */
const over = { tick: -Infinity, trees: [], others: [] };
function updateOver() {
  if (game.pathTick - over.tick < REFRESH_TICKS && game.pathTick >= over.tick) return;
  over.tick = game.pathTick;
  const v = getViewRect(10 * TILE_SIZE);
  over.trees = []; over.others = [];
  forEachInRect(game.trees, v.x0, v.y0, v.x1, v.y1, t => { if (!standing(t) || t.hp < t.maxHp || t.pickShare > 0) over.trees.push(t); });
  /** @type {[any[], number][]} */
  const kinds = [[game.cacti, 24], [game.boulders, 24], [game.berryBushes, 22]];
  for (const [list, width] of kinds) {
    forEachInRect(list, v.x0, v.y0, v.x1, v.y1, o => { if (o.hp < o.maxHp) over.others.push([o, width]); });
  }
}

function drawPicturedNature() {
  drawChunks('nature', natureRes(), natureStamp, paintNature);
  updateOver();
  for (const t of over.trees) drawTreeNear(t, true);
  for (const [o, width] of over.others) drawHarvestProgress(o, width);
}

// Trees: saplings growing, grown trees, apple trees with their apples (and the stumps of those felled)
export function drawTrees() {
  if (pictured()) return; // (with the others, in drawCactiBouldersGrassBushes)
  // (before the trees: a tree grown there covers its own stump, a felled one's log covers it)
  onScreen(game.stumps, drawStumpArt);
  onScreen(game.trees, t => drawTreeNear(t));
}

// A tree as it is close up (over its picture, standing: only what's changing, its bar)
function drawTreeNear(t, overPicture = false) {
  if (t.isGrowing) {
    drawSaplingArt(t);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(t.x - 10, t.y + 8, 20, 3);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(t.x - 10, t.y + 8, ((t.growProgress || 0) / 20) * 20, 3);
  } else {
    // apple trees: a lighter crown; red apples on it when ripe
    if (!overPicture || t.fallen) drawTreeArt(t);
    drawHarvestProgress(t);
    // apples being picked: pickShare is kept up only while someone is at it
    if (t.apple && t.pickShare > 0 && game.pathTick - t.pickTick < 3) drawProgressBar(t.x, t.y, t.pickShare);
  }
}

// Cacti, boulders, grass and berry bushes
export function drawCactiBouldersGrassBushes() {
  if (pictured()) {
    drawPicturedNature();
    onScreen(game.grassList, g => {
      drawGrassArt(g);
      drawHarvestProgress(g, 20);
    });
    return;
  }
  onScreen(game.cacti, c => {
    drawCactusArt(c);
    drawHarvestProgress(c);
  });

  onScreen(game.boulders, b => {
    drawBoulderArt(b); // (a loose, rounded stone, not the square rock that joins up)
    drawHarvestProgress(b);
  });

  onScreen(game.grassList, g => {
    drawGrassArt(g);
    drawHarvestProgress(g, 20);
  });

  onScreen(game.berryBushes, b => {
    drawBushArt(b); // (blue berries, as the Berries icon)
    drawHarvestProgress(b, 22);
  });
}

// The player's marks on resources: a square around it and a pointer over it, "here" (#232)
// (#322) Which things are marked is looked for in all the lists only every few ticks (the player's marks change
// rarely: a thousand things on the screen were each looked at, list by list, every frame); the marked ones are
// then drawn where they are
const marks = { tick: -Infinity, list: /** @type {any[]} */ ([]) };
export function drawPriorityMarks() {
  if (game.pathTick - marks.tick >= 6 || game.pathTick < marks.tick) {
    marks.tick = game.pathTick;
    const lists = [game.trees, game.cacti, game.boulders, game.grassList, game.berryBushes, game.sticks, game.pebbles, game.logs, game.loot,
      game.ironOres, game.coalOres, game.naturalRocks, game.farmPlots];
    marks.list = [];
    for (const list of lists) for (const r of list) if (r.priority > 0 && !r.isGrowing && (list !== game.farmPlots || r.growth >= 100)) marks.list.push(r);
  }
  const v = getViewRect(2 * TILE_SIZE);
  const marked = marks.list.filter(r => r.x >= v.x0 && r.x <= v.x1 && r.y >= v.y0 && r.y <= v.y1);
  marked.push(...game.boars.filter(b => b.priority > 0));
  marked.forEach(r => {
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
    ctx.strokeRect(r.x - 15, r.y - 15, TILE_SIZE, TILE_SIZE);
    // a small arrow pointing down at it, above the tile (clear of the progress bar)
    ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r.x - 6, r.y - 27); ctx.lineTo(r.x + 6, r.y - 27); ctx.lineTo(r.x, r.y - 18); ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}
