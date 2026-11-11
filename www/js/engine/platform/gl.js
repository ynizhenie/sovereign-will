// The world's ground and small nature drawn by the graphics card (a trial, off by default: Settings).
//
// A frame on the 2D canvas is a call to the canvas for every picture laid down, each carried out one by one: a thousand
// tufts, stones and bushes zoomed out is most of such a frame. Here the same pictures go to the graphics card together
// (PixiJS, WebGL): a second canvas under the game's, which is then clear where the ground shows. What's drawn this way
// says so each frame, in the order it's to lie (glChunk, glSprite), as it would have drawn itself; the rest of the frame
// is drawn on the game's canvas as ever, over it.

import { loadSetting } from './storage.js';

// (remembered, used from the next start: the game's canvas is made clear or solid with it)
export const GL = loadSetting('gl', 'off') === 'on';

/** @type {any} */
let PIXI = null;
/** @type {any} */
let app = null;
let ready = false, failed = false;
/** @type {HTMLCanvasElement | null} */
let glCanvas = null;
// the frame's pictures, in order: sprites kept and used again each frame
/** @type {any[]} */
const pool = [];
let used = 0, shown = 0;

export const glReady = () => ready;

// Made once the page is there (called at the start when the setting is on): the library is read only then
/** @param {HTMLCanvasElement} gameCanvas */
export async function initGl(gameCanvas) {
  if (!GL || app || failed || typeof document === 'undefined') return;
  try {
    const library = '../../../vendor/pixi.min.js'; // (by a name the type check doesn't follow: it's not ours to check)
    PIXI = await import(library);
    glCanvas = document.createElement('canvas');
    glCanvas.id = 'worldCanvas';
    const made = new PIXI.Application();
    await made.init({ canvas: glCanvas, width: Math.max(1, gameCanvas.width), height: Math.max(1, gameCanvas.height), resolution: 1, autoDensity: false,
      background: '#0b0f14', antialias: false, autoStart: false, preference: 'webgl', powerPreference: 'high-performance' });
    /** @type {HTMLElement} */ (gameCanvas.parentElement).insertBefore(glCanvas, gameCanvas);
    app = made;
    ready = true;
  } catch (e) {
    failed = true; // (no WebGL on this device: the game's canvas draws it all, as with the setting off)
    console.warn('WebGL is not available', e);
  }
}

// A frame begins: the card's canvas the size of the game's
/** @param {number} width @param {number} height */
export function glBeginFrame(width, height) {
  if (!ready) return;
  if (app.renderer.width !== width || app.renderer.height !== height) app.renderer.resize(width, height);
  used = 0;
  frames++;
}
// which frame this is (for what's worked out once a frame by those who draw here)
let frames = 0;
export const glFrame = () => frames;

function next() {
  let sprite = pool[used];
  if (!sprite) { sprite = pool[used] = new PIXI.Sprite(); app.stage.addChild(sprite); }
  used++;
  sprite.visible = true;
  sprite.alpha = 1;
  return sprite;
}

// ---- A piece of the ground (see drawChunks): its picture is a texture made once, made again when the piece is painted again
/** @type {WeakMap<object, any>} */
const chunkTextures = new WeakMap();
/** @type {WeakMap<HTMLCanvasElement, any>} */
const canvasTextures = new WeakMap();
/** @param {{ canvas: HTMLCanvasElement, pad: number, pw: number, ph: number }} chunk @param {number} x @param {number} y @param {number} w @param {number} h (on the screen, canvas px) */
export function glChunk(chunk, x, y, w, h) {
  let texture = chunkTextures.get(chunk);
  if (!texture) {
    // (a piece painted again is a new record of the same canvas: its old texture goes)
    const old = canvasTextures.get(chunk.canvas);
    if (old) old.destroy(true);
    const source = new PIXI.CanvasSource({ resource: chunk.canvas, scaleMode: 'linear' });
    texture = new PIXI.Texture({ source, frame: new PIXI.Rectangle(chunk.pad, chunk.pad, chunk.pw, chunk.ph) });
    chunkTextures.set(chunk, texture); canvasTextures.set(chunk.canvas, texture);
  }
  const sprite = next();
  sprite.texture = texture;
  sprite.skew.set(0, 0);
  sprite.position.set(x, y);
  sprite.scale.set(w / chunk.pw, h / chunk.ph);
}
// A piece's picture is dropped (drawChunks keeps only so many)
/** @param {{ canvas: HTMLCanvasElement }} chunk */
export function glForgetChunk(chunk) {
  const texture = canvasTextures.get(chunk.canvas);
  if (texture) { texture.destroy(true); canvasTextures.delete(chunk.canvas); }
}

// ---- A small picture (a tuft, a stone, a bush): all of them on a few big sheets, so the card draws them in one go
const SHEET = 2048, GAP = 2, MAX_SHEETS = 6;
/** @type {{ canvas: HTMLCanvasElement, g: CanvasRenderingContext2D, source: any, x: number, y: number, row: number, dirty: boolean }[]} */
let sheets = [];
/** @type {WeakMap<HTMLCanvasElement, any>} */
let sheetTextures = new WeakMap();
function sheetTexture(picture) {
  let texture = sheetTextures.get(picture);
  if (texture) return texture;
  const w = picture.width, h = picture.height;
  let sheet = sheets[sheets.length - 1];
  if (sheet && sheet.x + w + GAP > SHEET) { sheet.x = 0; sheet.y += sheet.row + GAP; sheet.row = 0; }
  if (!sheet || sheet.y + h + GAP > SHEET) {
    // (too many sheets, after many changes of zoom: all let go, the pictures on the screen put on new ones as they come)
    if (sheets.length >= MAX_SHEETS) { for (const s of sheets) s.source.destroy(); sheets = []; sheetTextures = new WeakMap(); }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = SHEET;
    sheet = { canvas, g: /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')), source: new PIXI.CanvasSource({ resource: canvas, scaleMode: 'linear' }), x: 0, y: 0, row: 0, dirty: false };
    sheets.push(sheet);
  }
  sheet.g.drawImage(picture, sheet.x, sheet.y);
  texture = new PIXI.Texture({ source: sheet.source, frame: new PIXI.Rectangle(sheet.x, sheet.y, w, h) });
  sheet.x += w + GAP; sheet.row = Math.max(sheet.row, h); sheet.dirty = true;
  sheetTextures.set(picture, texture);
  return texture;
}
// The picture laid on the screen with its top left at (x, y), w by h canvas px; lean: sheared sideways by that much of its
// height, round the line `base` (px down it) — a tuft in the wind
/** @param {HTMLCanvasElement} picture @param {number} x @param {number} y @param {number} w @param {number} h */
export function glSprite(picture, x, y, w, h, lean = 0, base = 0) {
  const sprite = next(), sx = w / picture.width, sy = h / picture.height;
  sprite.texture = sheetTexture(picture);
  if (lean) {
    // (x' = x + lean * (y - base): a shear; PixiJS has it as a skew and a scale down the picture)
    sprite.skew.set(Math.atan(lean * sx / sy), 0);
    sprite.scale.set(sx, sy * Math.hypot(1, lean * sx / sy));
    sprite.position.set(x - lean * base, y);
  } else {
    sprite.skew.set(0, 0);
    sprite.scale.set(sx, sy);
    sprite.position.set(x, y);
  }
}

// ---- A whole layer painted on a canvas of its own each frame (the shadows): laid over what's on the card so far, see-through
/** @type {WeakMap<HTMLCanvasElement, any>} */
const layerTextures = new WeakMap();
/** @param {HTMLCanvasElement} layer @param {number} w @param {number} h (on the screen, canvas px) @param {number} alpha */
export function glLayer(layer, w, h, alpha) {
  let texture = layerTextures.get(layer);
  if (!texture || texture.source.width !== layer.width || texture.source.height !== layer.height) {
    if (texture) texture.destroy(true);
    texture = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: layer, scaleMode: 'linear' }) });
    layerTextures.set(layer, texture);
  } else texture.source.update();
  const sprite = next();
  sprite.texture = texture;
  sprite.alpha = alpha;
  sprite.skew.set(0, 0);
  sprite.position.set(0, 0);
  sprite.scale.set(w / layer.width, h / layer.height);
}

// The frame's pictures drawn
export function glEndFrame() {
  if (!ready) return;
  for (let i = used; i < shown; i++) pool[i].visible = false;
  shown = used;
  for (const sheet of sheets) if (sheet.dirty) { sheet.source.update(); sheet.dirty = false; }
  app.render();
}
