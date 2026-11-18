// Units as pictures: a unit's figure, what it wears and what it holds drawn into a small picture of its own
// POSES_PER_SECOND times a second (Lima's pick of the comparison: 12), and that picture laid down where the unit
// is every frame, so it moves smoothly and only its pose is held a few frames. Measured on a Mi Pad 4 the graphics
// card was most of a frame (86% busy) carrying out the dozens of shapes each unit is drawn with, every frame; a
// picture is one call. Painted again at once when what it looks like changes (the key: what it holds, wears,
// carries, which way it faces...) or the zoom does; units take their turns on different steps, not all at once.
// (#425) Buildings the same way, but painted again only when their key or the zoom changes (they don't move), and the
// shadows their drawing casts caught as it paints and cast again from where they fell, each frame.
// The drawing code isn't changed: drawingOn points it at the picture while it paints (engine/platform/canvas.js).

import { camera, canvas, ctx, drawingOn, getViewScale } from '../../../engine/platform/index.js';
import { game } from '../../../engine/world/index.js';
import { castCaught, catchShadows, caughtShadows } from '../../world/index.js';

export const POSES_PER_SECOND = 12;
// off: every unit and building drawn straight on the screen each frame, as before (the tests compare the two)
export const unitPictures = { on: true };
const STEPS_PER_POSE = Math.round(60 / POSES_PER_SECOND); // (the game's steps are 60 a second)

/** @typedef {{ canvas: HTMLCanvasElement, key: string, scale: number, pose: number, w: number, h: number, halfW: number, up: number, shadows: any[] }} Picture */
/** @type {WeakMap<object, Picture>} */
const pictures = new WeakMap();
/** @type {WeakMap<object, number>} (a unit with no id of its own, an enemy: a number for when its turn comes) */
const turns = new WeakMap();
let nextTurn = 0;

// (#425) At most POSE_BUDGET pictures painted a frame for a new pose (what one looks like changing, or the zoom, is
// painted at once regardless): in a big battle the rest hold their pose a little longer, but never more than
// POSE_STALE poses, instead of the frame going slow (a Mi Pad 4 with 70 units fighting: ~25 painted a frame, 20 ms)
const POSE_BUDGET = 8, POSE_STALE = 6;
let poseBudget = { frame: -1, left: POSE_BUDGET };
// a frame begins (render.js)
export function newPictureFrame() { poseBudget = { frame: poseBudget.frame + 1, left: POSE_BUDGET }; }

// How many pictures have been painted and laid down since the page opened (the tests, and the performance monitor)
export const unitPictureTotals = { painted: 0, laid: 0 };

// What's round a unit of radius r, in world units: its weapon held out, a spear or a banner over its head, a shield
/** @param {number} r */
const boxOf = r => ({ halfW: Math.max(36, r * 3.3), up: Math.max(50, r * 4.6), down: Math.max(20, r * 1.9) });
// (round a building: the biggest, the hall-sized dens, are two tiles; its shadow isn't in the picture)
const BUILDING_BOX = { halfW: 34, up: 40, down: 30 };

/** @param {any} owner @param {string} key @param {number} pose @param {{ halfW: number, up: number, down: number }} box @param {() => void} paint @param {boolean} catching */
function drawPicture(owner, key, pose, box, paint, catching) {
  const scale = getViewScale();
  let pic = pictures.get(owner);
  // (only a new pose waits for the frame's budget; a changed look, a new zoom or a first picture never waits)
  const posed = !!pic && pic.key === key && pic.scale === scale && pic.pose !== pose;
  const due = !pic || pic.key !== key || pic.scale !== scale || (posed && (poseBudget.left > 0 || pose - pic.pose >= POSE_STALE));
  if (posed && due) poseBudget.left--;
  if (due) {
    const { halfW, up, down } = box;
    const w = Math.max(1, Math.ceil(halfW * 2 * scale)), h = Math.max(1, Math.ceil((up + down) * scale));
    if (!pic) { pic = { canvas: document.createElement('canvas'), key, scale, pose, w, h, halfW, up, shadows: [] }; pictures.set(owner, pic); }
    const c = pic.canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalAlpha = 1;
    // the owner's place at the picture's (halfW, up), at the screen's scale
    const base = new DOMMatrix([scale, 0, 0, scale, halfW * scale - owner.x * scale, up * scale - owner.y * scale]);
    g.setTransform(base);
    if (catching) catchShadows(base.inverse());
    const was = drawingOn(g);
    try { paint(); } finally {
      drawingOn(was);
      if (catching) pic.shadows = caughtShadows();
    }
    Object.assign(pic, { key, scale, pose, w, h, halfW, up });
    unitPictureTotals.painted++;
  }
  if (!pic) return; // (made above when there was none)
  if (catching) castCaught(pic.shadows);
  // laid on whole screen pixels (a picture laid between two is blurred)
  const e = canvas.width / 2 - camera.x * scale, f = canvas.height / 2 - camera.y * scale;
  const x = (Math.round(e + (owner.x - pic.halfW) * scale) - e) / scale, y = (Math.round(f + (owner.y - pic.up) * scale) - f) / scale;
  ctx.drawImage(pic.canvas, x, y, pic.w / scale, pic.h / scale);
  unitPictureTotals.laid++;
}

// Draws the unit's picture where it is, painting it again first (paint(), the unit's own drawing at its place)
// when its turn has come, its key changed or the zoom did
/** @param {any} unit @param {string} key @param {() => void} paint */
export function drawUnitPicture(unit, key, paint) {
  if (!unitPictures.on) { paint(); return; }
  let turn = unit.id;
  if (turn === undefined) { turn = turns.get(unit); if (turn === undefined) turns.set(unit, (turn = nextTurn++)); }
  const pose = Math.floor((game.pathTick + turn * 3) / STEPS_PER_POSE);
  drawPicture(unit, key, pose, boxOf(unit.visualRadius || unit.radius || 11), paint, false);
}

// (#425) A building's picture where it stands, painted again only when its key or the zoom changes; the shadows it
// casts cast each frame from the picture's catch
/** @param {any} thing @param {string} key @param {() => void} paint */
export function drawThingPicture(thing, key, paint) {
  if (!unitPictures.on) { paint(); return; }
  drawPicture(thing, key, 0, BUILDING_BOX, paint, true);
}

// Which way a unit faces, in sixteenths of a turn (for a key: turning shows at once, not at its next pose)
/** @param {number} [facing] */
export const facingStep = facing => Math.round(((facing || 0) / (Math.PI * 2)) * 16) & 15;
