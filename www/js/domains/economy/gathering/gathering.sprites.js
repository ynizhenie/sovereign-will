// (#322) Nature drawn from pictures of it, close up too. A tree was eighteen circles and fills a frame, a pebble nine, a tuft
// of grass fifteen strokes: a few thousand canvas calls a frame, each one carried out by the browser's graphics process. Each
// kind is now painted once into a small picture, as one of a few dozen variants (by where it stands, as before), at about the
// screen's resolution, and laid down with one call; the shadows of all of a kind on the screen are filled as one shape. A tuft
// of grass is painted leaning a few ways, and laid down as the wind has it now.

import { ctx, getViewScale, glReady, glSprite } from '../../../engine/platform/index.js';
import { tileVariantHash, windSway } from '../../world/index.js';
import { game, thingAt } from '../../../engine/world/index.js';
import { drawBoulderArt, drawBushArt, drawCactusArt, drawGrassArt, drawPebblesArt, drawStickArt, drawStumpArt, drawTreeArt, paintOn, paintVariant } from './gathering.art.js';

// each kind: how many variants, the box round where it stands that its picture covers (x0, y0, x1, y1), how it's painted
/** @type {Record<string, { variants: number, box: number[], paint: (o: any) => void }>} */
const KINDS = {
  stump: { variants: 1, box: [-6, -5, 6, 5], paint: drawStumpArt },
  tree: { variants: 48, box: [-24, -27, 24, 16], paint: drawTreeArt },
  cactus: { variants: 2, box: [-17, -16, 17, 16], paint: drawCactusArt },
  boulder: { variants: 24, box: [-15, -14, 15, 14], paint: drawBoulderArt },
  bush: { variants: 10, box: [-15, -14, 15, 14], paint: drawBushArt },
  grass: { variants: 24, box: [-13, -19, 13, 10], paint: drawGrassArt },
  stick: { variants: 12, box: [-11, -11, 11, 11], paint: drawStickArt },
  pebbles: { variants: 12, box: [-8, -8, 8, 8], paint: drawPebblesArt }
};
const MAX_SPRITES = 1500;
const BIOME_SPRITES = new Set(['tree', 'bush', 'grass']);

/** @type {Map<string, HTMLCanvasElement>} */
const sprites = new Map();
// a variant's own hash: all its bits, as a real tile's (the art reads several of them)
const hashOf = (kind, v) => tileVariantHash(v * 7919 + kind.length, v * 104729 + 13);
export const spriteVariantOf = (kind, o) => tileVariantHash(Math.round(o.x), Math.round(o.y)) % (kind === 'cactus' ? 2 : KINDS[kind].variants);

// the picture's resolution: the screen's, to the next power of two (a little sharper than needed rather than blurred)
const resOf = () => Math.min(4, Math.max(0.25, 2 ** Math.ceil(Math.log2(Math.max(getViewScale(), 0.01)))));

// (#322) which picture a thing has, kept with the thing while it's the same one (the zoom's size, its apples, the savanna as it is):
// working that out for each of a thousand things a frame (a text key made, a tile looked up) cost as much as laying them down
/** @type {WeakMap<object, { c: HTMLCanvasElement, res: number, apple: number, savanna: any[], count: number, last: any, x: number, y: number }>} */
const spriteOfThing = new WeakMap();

/** @param {string} kind @param {any} o @param {number} res */
function spriteOf(kind, o, res) {
  const apple = kind === 'tree' ? (o.apple ? (o.applesReady ? 2 : 1) : 0) : 0;
  const kept = spriteOfThing.get(o), biome = game.savannaTiles;
  if (kept && kept.res === res && kept.apple === apple && kept.savanna === biome && kept.count === biome.length && kept.last === biome[biome.length - 1] && kept.x === o.x && kept.y === o.y) return kept.c;
  const k = KINDS[kind], v = spriteVariantOf(kind, o);
  const savanna = BIOME_SPRITES.has(kind) && !!thingAt(game.savannaTiles, o.x, o.y);
  const key = `${kind}|${v}|${apple}|${savanna ? 1 : 0}|${res}`;
  let c = sprites.get(key);
  if (c) { sprites.delete(key); sprites.set(key, c); }
  else {
    const [x0, y0, x1, y1] = k.box;
    c = document.createElement('canvas');
    c.width = Math.ceil((x1 - x0) * res) + 2; c.height = Math.ceil((y1 - y0) * res) + 2;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.setTransform(res, 0, 0, res, 1 - x0 * res, 1 - y0 * res);
    paintOn(g);
    try { paintVariant(kind === 'cactus' ? v : hashOf(kind, v), false, kind === 'grass' ? 0 : null); k.paint({ x: 0, y: 0, apple: o.apple, applesReady: o.applesReady, savanna }); } finally { paintVariant(null); paintOn(null); }
    sprites.set(key, c);
    if (sprites.size > MAX_SPRITES) sprites.delete(/** @type {string} */ (sprites.keys().next().value));
  }
  spriteOfThing.set(o, { c, res, apple, savanna: biome, count: biome.length, last: biome[biome.length - 1], x: o.x, y: o.y });
  return c;
}

// A thing's picture at a size, and the box round where it stands that the picture covers (for what keeps pictures itself,
// see gathering.card.js)
/** @param {string} kind @param {any} o @param {number} res */
export const pictureOf = (kind, o, res) => spriteOf(kind, o, res);
/** @param {string} kind */
export const pictureBox = kind => KINDS[kind].box;

// The things of a kind given, each laid down from its picture
/** @param {string} kind @param {any[]} things */
export function drawSprites(kind, things) {
  if (!things.length) return;
  const res = resOf(), [x0, y0] = KINDS[kind].box;
  if (kind === 'grass') {
    // Reuse the still sprite and shear it around the base of the blades. The wind angle
    // stays continuous instead of jumping between a few cached lean images.
    // (#322: the shear set straight into the canvas's transform, one call a tuft instead of four round each picture)
    const windTime = performance.now() / 1000, m = ctx.getTransform();
    if (glReady()) {
      // (to the graphics card's canvas: the same picture, the same lean round the foot of the blades)
      for (const o of things) {
        const c = spriteOf(kind, o, res), lean = -windSway(o.x, o.y, 18, windTime) / 18;
        const left = o.x + x0 - 1 / res, top = o.y + y0 - 1 / res;
        glSprite(c, m.a * left + m.e, m.d * top + m.f, m.a * c.width / res, m.d * c.height / res, lean, m.d * (o.y + 7 - top));
      }
      return;
    }
    for (const o of things) {
      const c = spriteOf(kind, o, res), lean = -windSway(o.x, o.y, 18, windTime) / 18, bx = o.x, by = o.y + 7;
      ctx.setTransform(m.a, m.b, m.a * lean + m.c, m.b * lean + m.d, m.a * bx + m.c * by + m.e, m.b * bx + m.d * by + m.f);
      ctx.drawImage(c, x0 - 1 / res, y0 - 7 - 1 / res, c.width / res, c.height / res);
    }
    ctx.setTransform(m);
    return;
  }
  if (glReady()) {
    const m = ctx.getTransform();
    for (const o of things) { const c = spriteOf(kind, o, res); glSprite(c, m.a * (o.x + x0 - 1 / res) + m.e, m.d * (o.y + y0 - 1 / res) + m.f, m.a * c.width / res, m.d * c.height / res); }
    return;
  }
  for (const o of things) drawSprite(kind, o, res, x0, y0);
}

/** @param {string} kind @param {any} o */
function drawSprite(kind, o, res, x0, y0) {
  const c = spriteOf(kind, o, res);
  ctx.drawImage(c, o.x + x0 - 1 / res, o.y + y0 - 1 / res, c.width / res, c.height / res);
}

// One thing of a kind (not a tuft of grass), laid down from its picture
/** @param {string} kind @param {any} o */
export function drawOneSprite(kind, o) {
  const box = KINDS[kind].box;
  drawSprite(kind, o, resOf(), box[0], box[1]);
}
