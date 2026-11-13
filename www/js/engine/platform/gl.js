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
// What's on the card's canvas, from the bottom up: band 0 (the ground, the shadows), the small things kept there, band 1
// (the tufts of grass), the trees kept there, band 2. A band holds a frame's pictures, said again each frame in the order they
// lie (sprites used again frame after frame); what's kept is said once and stays till it's dropped (glKeep, glDrop): the
// card draws it each frame with nothing asked of the game but where the camera is (glCamera)
const BANDS = 3;
/** @type {any[][]} */
const pools = [[], [], []];
const usedIn = [0, 0, 0], shownIn = [0, 0, 0];
/** @type {any[]} */
let bands = [];
/** @type {any[]} */
let keptLayers = [];
/** @type {Map<object, any>[]} */
const keptSprites = [new Map(), new Map()];
let band = 0;

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
    for (let i = 0; i < BANDS; i++) {
      bands.push(new PIXI.Container());
      app.stage.addChild(bands[i]);
      if (i === 0) { wavesLayer = new PIXI.Container({ isRenderGroup: true }); app.stage.addChild(wavesLayer); }
      if (i === 1) { swayLayer = new PIXI.Container({ isRenderGroup: true }); app.stage.addChild(swayLayer); }
      if (i < 2) { keptLayers.push(new PIXI.Container({ isRenderGroup: true, sortableChildren: true })); app.stage.addChild(keptLayers[i]); }
    }
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
  usedIn.fill(0);
  band = 0;
  frames++;
}
// The pictures said from here on in this frame go to that band (see above)
/** @param {number} n */
export function glBand(n) { band = n; }
// Where the world is on the screen this frame: canvas px to a world unit, and where the world's corner lands
/** @param {number} scale @param {number} x @param {number} y */
export function glCamera(scale, x, y) {
  for (const layer of keptLayers) { layer.scale.set(scale); layer.position.set(x, y); }
  swayLayer.scale.set(scale); swayLayer.position.set(x, y);
  wavesLayer.scale.set(scale); wavesLayer.position.set(x, y);
  cullGroups(scale, x, y);
}
// A thing's picture kept on the card (layer 0: the small things, 1: the trees), with its top left at (x, y) in the world,
// w by h world units; among its layer's, those with a greater z lie over those with a lesser. Said again: changed
/** @param {number} layer @param {object} thing @param {HTMLCanvasElement} picture @param {number} x @param {number} y @param {number} w @param {number} h @param {number} z */
export function glKeep(layer, thing, picture, x, y, w, h, z) {
  let sprite = keptSprites[layer].get(thing);
  if (!sprite) { sprite = new PIXI.Sprite(); keptSprites[layer].set(thing, sprite); keptLayers[layer].addChild(sprite); }
  sprite.texture = sheetTexture(picture);
  sprite.position.set(x, y);
  sprite.scale.set(w / picture.width, h / picture.height);
  sprite.zIndex = z;
}
/** @param {number} layer @param {object} thing */
export function glDrop(layer, thing) {
  const sprite = keptSprites[layer].get(thing);
  if (!sprite) return;
  keptSprites[layer].delete(thing);
  sprite.destroy();
}
// how many groups of tufts and of wavelets are kept (for the tests)
export const glGroups = () => ({ sway: swayGroups.size, waves: waveGroups.size });
// how many things are kept in a layer (for the tests)
/** @param {number} layer */
export const glKept = layer => keptSprites[layer].size;
export function glDropAll() {
  for (let layer = 0; layer < keptSprites.length; layer++) { for (const sprite of keptSprites[layer].values()) sprite.destroy(); keptSprites[layer].clear(); }
}
// which frame this is (for what's worked out once a frame by those who draw here)
let frames = 0;
export const glFrame = () => frames;

function next() {
  const pool = pools[band];
  let sprite = pool[usedIn[band]];
  if (!sprite) { sprite = pool[usedIn[band]] = new PIXI.Sprite(); bands[band].addChild(sprite); }
  usedIn[band]++;
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
    if (old) retire(old);
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
// A texture goes. A sprite of the pool that showed it last (hidden now, or about to be given another) lets go of it first:
// the card's batch of sprites, put together in an earlier frame, could still reach for it and stop the frame
function retire(texture) {
  for (const pool of pools) for (const sprite of pool) if (sprite.texture === texture) sprite.texture = PIXI.Texture.EMPTY;
  texture.destroy(true);
}
// A piece's picture is dropped (drawChunks keeps only so many)
/** @param {{ canvas: HTMLCanvasElement }} chunk */
export function glForgetChunk(chunk) {
  const texture = canvasTextures.get(chunk.canvas);
  if (texture) { retire(texture); canvasTextures.delete(chunk.canvas); }
}

// ---- A small picture (a tuft, a stone, a bush): all of them on a few big sheets, so the card draws them in one go
const SHEET = 2048, GAP = 4;
/** @type {{ canvas: HTMLCanvasElement, g: CanvasRenderingContext2D, source: any, x: number, y: number, row: number, dirty: boolean }[]} */
const sheets = [];
/** @type {WeakMap<HTMLCanvasElement, any>} */
const sheetTextures = new WeakMap();
function sheetTexture(picture) {
  let texture = sheetTextures.get(picture);
  if (texture) return texture;
  const w = picture.width, h = picture.height;
  let sheet = sheets[sheets.length - 1];
  if (sheet && sheet.x + w + GAP > SHEET) { sheet.x = 0; sheet.y += sheet.row + GAP; sheet.row = 0; }
  if (!sheet || sheet.y + h + GAP > SHEET) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = SHEET;
    sheet = { canvas, g: /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')), source: new PIXI.CanvasSource({ resource: canvas, scaleMode: 'linear', autoGenerateMipmaps: true }), x: 0, y: 0, row: 0, dirty: false };
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

// the box round a shape's corners (x, y pairs), with room for its pictures to lean or drift out of it
/** @param {Float32Array} positions */
function boxOf(positions) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < positions.length; i += 2) { const x = positions[i], y = positions[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0 - 30, y0 - 30, x1 + 30, y1 + 30];
}
// A group off the screen isn't drawn (each is a command of its own to the card: a big map has thousands)
function cullGroups(scale, x, y) {
  const x0 = -x / scale, y0 = -y / scale, x1 = x0 + app.renderer.width / scale, y1 = y0 + app.renderer.height / scale;
  const seen = mesh => { const b = mesh.__box; mesh.visible = b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1; };
  for (const meshes of swayGroups.values()) for (const mesh of meshes) seen(mesh);
  for (const mesh of waveGroups.values()) seen(mesh);
}

// ---- Things that sway in the wind (the tufts of grass), kept on the card in groups: each group one shape of all its pictures,
// and the card leans every picture round its foot by the wind as it is now (the game says only the time and the wind,
// glWind). What a tuft's lean is: world.weather.js's windSway, the same sum here
/** @type {any} */
let swayLayer = null;
/** @type {Map<string, any[]>} */
const swayGroups = new Map();
/** @type {Map<any, any>} */
const swayShaders = new Map(); // (one for each sheet of pictures)
const swayUniforms = { uTime: { value: 0, type: 'f32' }, uWind: { value: 0, type: 'f32' }, uLean: { value: 0, type: 'f32' } };
const SWAY_VERTEX = `
in vec2 aPosition;
in vec2 aUV;
in vec2 aFoot;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uTime;
uniform float uWind;
uniform float uLean;
void main() {
  float gust = 0.6 + 0.4 * sin(uTime * 0.7 + aFoot.x * 0.004);
  float s = uWind * gust * (sin(uTime * 2.4 + aFoot.x * 0.05 + aFoot.y * 0.03) * 0.5 + 0.7);
  vec2 at = vec2(aPosition.x + uLean * s * 0.35 * (aFoot.y + 7.0 - aPosition.y), aPosition.y);
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(at, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;
const SWAY_FRAGMENT = `
in vec2 vUV;
uniform sampler2D uTexture;
void main() { gl_FragColor = texture2D(uTexture, vUV); }`;
// A group's tufts (said again: changed; none: the group gone). Each: its picture, where its top left is in the world,
// its size there, and its foot (the thing's own place)
/** @param {string} key @param {{ picture: HTMLCanvasElement, x: number, y: number, w: number, h: number, fx: number, fy: number }[]} tufts */
export function glSway(key, tufts) {
  for (const mesh of swayGroups.get(key) || []) mesh.destroy();
  swayGroups.delete(key);
  if (!tufts.length) return;
  // (a shape for each sheet its pictures are on)
  /** @type {Map<any, typeof tufts>} */
  const bySheet = new Map();
  for (const tuft of tufts) { const source = sheetTexture(tuft.picture).source; const list = bySheet.get(source); if (list) list.push(tuft); else bySheet.set(source, [tuft]); }
  const meshes = [];
  for (const [source, list] of bySheet) {
    const n = list.length, positions = new Float32Array(n * 8), uvs = new Float32Array(n * 8), feet = new Float32Array(n * 8), indices = new Uint32Array(n * 6);
    list.forEach((tuft, i) => {
      const frame = sheetTexture(tuft.picture).frame, u0 = frame.x / SHEET, v0 = frame.y / SHEET, u1 = (frame.x + frame.width) / SHEET, v1 = (frame.y + frame.height) / SHEET;
      positions.set([tuft.x, tuft.y, tuft.x + tuft.w, tuft.y, tuft.x + tuft.w, tuft.y + tuft.h, tuft.x, tuft.y + tuft.h], i * 8);
      uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      for (let k = 0; k < 4; k++) { feet[i * 8 + k * 2] = tuft.fx; feet[i * 8 + k * 2 + 1] = tuft.fy; }
      indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    let shader = swayShaders.get(source);
    if (!shader) {
      shader = PIXI.Shader.from({ gl: { vertex: SWAY_VERTEX, fragment: SWAY_FRAGMENT }, resources: { uTexture: source, sway: swayUniforms } });
      swayShaders.set(source, shader);
    }
    const geometry = new PIXI.Geometry({ attributes: { aPosition: { buffer: positions, format: 'float32x2' }, aUV: { buffer: uvs, format: 'float32x2' }, aFoot: { buffer: feet, format: 'float32x2' } }, indexBuffer: indices });
    const mesh = new PIXI.Mesh({ geometry, shader });
    mesh.__box = boxOf(positions);
    swayLayer.addChild(mesh);
    meshes.push(mesh);
  }
  swayGroups.set(key, meshes);
}
export function glSwayDropAll() {
  for (const meshes of swayGroups.values()) for (const mesh of meshes) mesh.destroy();
  swayGroups.clear();
}
// The wind now: the time (seconds), how strong it blows, and which way it leans things (-1..1)
/** @param {number} time @param {number} wind @param {number} lean */
export function glWind(time, wind, lean) {
  for (const shader of swayShaders.values()) { const u = shader.resources.sway.uniforms; u.uTime = time; u.uWind = wind; u.uLean = lean; }
}

// ---- The water's wavelets, kept on the card in groups: each a little white stroke that drifts across its tile and fades in
// and out by itself (the card moves it by the time; the game says the time and how many to show, glWaves)
/** @type {any} */
let wavesLayer = null;
/** @type {Map<string, any>} */
const waveGroups = new Map();
/** @type {any} */
let waveShader = null;
const waveUniforms = { uTime: { value: 0, type: 'f32' }, uHalf: { value: 0, type: 'f32' } };
const WAVE_VERTEX = `
in vec2 aPosition;
in vec2 aUV;
in vec2 aPhase;
out vec2 vUV;
out float vAlpha;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uTime;
uniform float uHalf;
void main() {
  float p = fract(uTime * 0.25 + aPhase.x);
  vec2 at = vec2(aPosition.x + p * 20.0, aPosition.y);
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(at, 1.0)).xy, 0.0, 1.0);
  // (six steps of brightness as it fades in and out; every other one not shown when the view isn't close)
  vAlpha = 0.16 * (min(5.0, floor(sin(p * 3.14159265) * 6.0)) + 0.5) / 6.0 * (1.0 - uHalf * aPhase.y);
  vUV = aUV;
}`;
const WAVE_FRAGMENT = `
in vec2 vUV;
in float vAlpha;
uniform sampler2D uTexture;
void main() { gl_FragColor = texture2D(uTexture, vUV) * vAlpha; }`;
/** @type {HTMLCanvasElement | null} */
let wavePicture = null;
const WAVE_BOX = [-7, -4, 7, 2], WAVE_RES = 4; // (round the stroke's middle, world units; its picture's sharpness)
// A group's wavelets (none: the group gone): x, y where each one's stroke starts its drift (its middle), its phase 0..1,
// and whether it's one of those left out when the view isn't close (1) — four numbers each
/** @param {string} key @param {number[]} waves */
export function glWaveGroup(key, waves) {
  const old = waveGroups.get(key);
  if (old) { old.destroy(); waveGroups.delete(key); }
  const n = waves.length / 4;
  if (!n) return;
  if (!wavePicture) {
    const [x0, y0, x1, y1] = WAVE_BOX;
    wavePicture = document.createElement('canvas'); wavePicture.width = (x1 - x0) * WAVE_RES; wavePicture.height = (y1 - y0) * WAVE_RES;
    const g = /** @type {CanvasRenderingContext2D} */ (wavePicture.getContext('2d'));
    g.setTransform(WAVE_RES, 0, 0, WAVE_RES, -x0 * WAVE_RES, -y0 * WAVE_RES);
    g.strokeStyle = '#fff'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-5, 0); g.quadraticCurveTo(0, -2, 5, 0); g.stroke();
  }
  const texture = sheetTexture(wavePicture), frame = texture.frame;
  const u0 = frame.x / SHEET, v0 = frame.y / SHEET, u1 = (frame.x + frame.width) / SHEET, v1 = (frame.y + frame.height) / SHEET;
  const positions = new Float32Array(n * 8), uvs = new Float32Array(n * 8), phases = new Float32Array(n * 8), indices = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const x = waves[i * 4] + WAVE_BOX[0], y = waves[i * 4 + 1] + WAVE_BOX[1], w = WAVE_BOX[2] - WAVE_BOX[0], h = WAVE_BOX[3] - WAVE_BOX[1];
    positions.set([x, y, x + w, y, x + w, y + h, x, y + h], i * 8);
    uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    for (let k = 0; k < 4; k++) { phases[i * 8 + k * 2] = waves[i * 4 + 2]; phases[i * 8 + k * 2 + 1] = waves[i * 4 + 3]; }
    indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  if (!waveShader) waveShader = PIXI.Shader.from({ gl: { vertex: WAVE_VERTEX, fragment: WAVE_FRAGMENT }, resources: { uTexture: texture.source, waves: waveUniforms } });
  const geometry = new PIXI.Geometry({ attributes: { aPosition: { buffer: positions, format: 'float32x2' }, aUV: { buffer: uvs, format: 'float32x2' }, aPhase: { buffer: phases, format: 'float32x2' } }, indexBuffer: indices });
  const mesh = new PIXI.Mesh({ geometry, shader: waveShader });
  mesh.__box = boxOf(positions);
  wavesLayer.addChild(mesh);
  waveGroups.set(key, mesh);
}
export function glWaveDropAll() { for (const mesh of waveGroups.values()) mesh.destroy(); waveGroups.clear(); }
// The wavelets this frame: shown or not, the time (seconds), and whether only every other one shows
/** @param {boolean} shown @param {number} time @param {boolean} half */
export function glWaves(shown, time, half) {
  wavesLayer.visible = shown;
  if (waveShader) { const u = waveShader.resources.waves.uniforms; u.uTime = time; u.uHalf = half ? 1 : 0; }
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
  for (let b = 0; b < BANDS; b++) {
    for (let i = usedIn[b]; i < shownIn[b]; i++) pools[b][i].visible = false;
    shownIn[b] = usedIn[b];
  }
  for (const sheet of sheets) if (sheet.dirty) { sheet.source.update(); sheet.dirty = false; }
  app.render();
}
