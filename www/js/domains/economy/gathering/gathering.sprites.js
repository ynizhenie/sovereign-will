// (#322) Nature drawn from pictures of it, close up too. A tree was eighteen circles and fills a frame, a pebble nine, a tuft
// of grass fifteen strokes: a few thousand canvas calls a frame, each one carried out by the browser's graphics process. Each
// kind is now painted once into a small picture, as one of a few dozen variants (by where it stands, as before), at about the
// screen's resolution, and laid down with one call; the shadows of all of a kind on the screen are filled as one shape. A tuft
// of grass is painted leaning a few ways, and laid down as the wind has it now.

import { ctx, getViewScale } from '../../../engine/platform/index.js';
import { getSun, tileVariantHash, windSway } from '../../world/index.js';
import { SHADOWS, drawBoulderArt, drawBushArt, drawCactusArt, drawGrassArt, drawPebblesArt, drawStickArt, drawStumpArt, drawTreeArt, paintOn, paintVariant } from './gathering.art.js';

// each kind: how many variants, the box round where it stands that its picture covers (x0, y0, x1, y1), how it's painted
/** @type {Record<string, { variants: number, box: number[], paint: (o: any) => void }>} */
const KINDS = {
  stump: { variants: 1, box: [-6, -5, 6, 5], paint: drawStumpArt },
  tree: { variants: 48, box: [-22, -22, 22, 16], paint: drawTreeArt },
  cactus: { variants: 4, box: [-17, -16, 17, 16], paint: drawCactusArt },
  boulder: { variants: 24, box: [-15, -14, 15, 14], paint: drawBoulderArt },
  bush: { variants: 10, box: [-15, -14, 15, 14], paint: drawBushArt },
  grass: { variants: 24, box: [-13, -19, 13, 10], paint: drawGrassArt },
  stick: { variants: 12, box: [-11, -11, 11, 11], paint: drawStickArt },
  pebbles: { variants: 12, box: [-8, -8, 8, 8], paint: drawPebblesArt }
};
const MAX_SPRITES = 1500;

/** @type {Map<string, HTMLCanvasElement>} */
const sprites = new Map();
// a variant's own hash: all its bits, as a real tile's (the art reads several of them)
const hashOf = (kind, v) => tileVariantHash(v * 7919 + kind.length, v * 104729 + 13);

// the picture's resolution: the screen's, to the next power of two (a little sharper than needed rather than blurred)
const resOf = () => Math.min(4, Math.max(0.25, 2 ** Math.ceil(Math.log2(Math.max(getViewScale(), 0.01)))));

/** @param {string} kind @param {any} o @param {number} res */
function spriteOf(kind, o, res) {
  const k = KINDS[kind], v = tileVariantHash(Math.round(o.x), Math.round(o.y)) % k.variants;
  const apple = kind === 'tree' ? (o.apple ? (o.applesReady ? 2 : 1) : 0) : 0;
  const key = `${kind}|${v}|${apple}|${res}`;
  let c = sprites.get(key);
  if (c) { sprites.delete(key); sprites.set(key, c); return c; }
  const [x0, y0, x1, y1] = k.box;
  c = document.createElement('canvas');
  c.width = Math.ceil((x1 - x0) * res) + 2; c.height = Math.ceil((y1 - y0) * res) + 2;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.setTransform(res, 0, 0, res, 1 - x0 * res, 1 - y0 * res);
  paintOn(g); paintVariant(hashOf(kind, v), false, kind === 'grass' ? 0 : null);
  try { k.paint({ x: 0, y: 0, apple: o.apple, applesReady: o.applesReady }); } finally { paintVariant(null); paintOn(null); }
  sprites.set(key, c);
  if (sprites.size > MAX_SPRITES) sprites.delete(/** @type {string} */ (sprites.keys().next().value));
  return c;
}

// The things of a kind given, each laid down from its picture, their shadows first as one shape
/** @param {string} kind @param {any[]} things */
export function drawSprites(kind, things) {
  if (!things.length) return;
  const res = resOf(), [x0, y0] = KINDS[kind].box, [dx, dy, rx, ry] = SHADOWS[kind];
  const windTime = performance.now() / 1000;
  const sun = getSun(), height = rx * 0.9, ox = sun.dx * height, oy = sun.dy * height;
  const ex = rx + Math.abs(ox) * 0.5, ey = ry + Math.abs(oy) * 0.25;
  const shadow = new Path2D();
  for (const o of things) {
    const cx = o.x + dx + ox * 0.5, cy = o.y + dy + 4 + oy * 0.5;
    shadow.moveTo(cx + ex, cy); shadow.ellipse(cx, cy, ex, ey, 0, 0, Math.PI * 2);
  }
  ctx.fillStyle = `rgba(0, 0, 0, ${sun.alpha})`;
  ctx.fill(shadow);
  for (const o of things) {
    const c = spriteOf(kind, o, res);
    if (kind === 'grass') {
      // Reuse the still sprite and shear it around the base of the blades. The wind angle
      // stays continuous instead of jumping between a few cached lean images.
      const sway = windSway(o.x, o.y, 18, windTime);
      ctx.save();
      ctx.translate(o.x, o.y + 7);
      ctx.transform(1, 0, -sway / 18, 1, 0, 0);
      ctx.drawImage(c, x0 - 1 / res, y0 - 7 - 1 / res, c.width / res, c.height / res);
      ctx.restore();
    } else {
      ctx.drawImage(c, o.x + x0 - 1 / res, o.y + y0 - 1 / res, c.width / res, c.height / res);
    }
  }
}
