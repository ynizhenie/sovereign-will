// The canvas the game is drawn on: it covers the whole game area at the screen's resolution

import { game } from '../world/index.js';
import { camera, clampCamera, getMaxZoom, getMinZoom } from './camera.js';
import { loadSetting } from './storage.js';
import { GL, initGl } from './gl.js';

export const canvas = document.getElementById('gameCanvas');

// (#322) VSYNC (Settings, on by default): frames shown in step with the screen's refreshes, whatever its rate
// (60, 75, 120, 144 Hz...), no tearing. Off: drawn straight to the screen as soon as they're done (less delay,
// may tear). Set when the canvas is made: a change takes effect the next time the game starts
export const VSYNC = loadSetting('vsync', 'on') !== 'off';

const screenCtx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', {
  alpha: GL, // (clear where the ground shows through from the graphics card's canvas under it, see gl.js)
  desynchronized: !VSYNC,
  willReadFrequently: false
}));
// What everything draws on: the screen's canvas, or for a while another one (drawingOn: a unit's picture, see
// settlers.pictures.js), so the same drawing code paints either without a word changed
/** @type {CanvasRenderingContext2D} */
export let ctx = screenCtx;
/** @param {CanvasRenderingContext2D} g @returns {CanvasRenderingContext2D} what was drawn on till now */
export function drawingOn(g) { const was = ctx; ctx = g; return was; }

// How many canvas pixels to a CSS pixel at most: the sharpest picture (up to 2; a screen denser than that
// is capped, more pixels cost frame time). (#425) An Android device 1.5: a Mi Pad 4 went from 38-42 fps at 2 to 56
// at 1.5 (and 53 at 1), the picture still sharp
const QUALITY_RATIO = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '') ? 1.5 : 2;

// ---- Screen and camera
//
// The canvas covers the whole game area at the screen's resolution (fitCanvasToScreen). At zoom 1 the
// world covers the screen; zooming out to getMinZoom() shows all of it.
export let screenPixelRatio = 1;

// (#322) The canvas's size on the page is read again only when it has changed (a resize, a rotation, a panel): reading it every
// frame made the browser lay the page out every frame
let cssWidth = 0, cssHeight = 0, sizeStale = true, sizedFor = 0;
export const markCanvasSizeStale = () => { sizeStale = true; };
// the canvas's size on the page as last read (for the sounds' pan: a sound read it, and so laid the page out, each time)
export const canvasCssSize = () => ({ w: cssWidth || canvas.clientWidth, h: cssHeight || canvas.clientHeight });

export function fitCanvasToScreen() {
  screenPixelRatio = Math.min(QUALITY_RATIO, window.devicePixelRatio || 1); // capped: more pixels cost frame time on phones
  if (sizeStale || sizedFor !== screenPixelRatio) { cssWidth = canvas.clientWidth; cssHeight = canvas.clientHeight; sizeStale = false; sizedFor = screenPixelRatio; }
  const width = Math.max(1, Math.round(cssWidth * screenPixelRatio));
  const height = Math.max(1, Math.round(cssHeight * screenPixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  camera.zoom = Math.max(getMinZoom(), Math.min(getMaxZoom(), camera.zoom));
  clampCamera();
}

// canvas pixels per world unit at zoom 1: the world just covers the screen
export function getBaseScale() {
  return Math.max(canvas.width / game.WORLD_WIDTH, canvas.height / game.WORLD_HEIGHT);
}

// canvas pixels per world unit now
export function getViewScale() {
  return getBaseScale() * camera.zoom;
}

// (#322) The canvas's font set only when it differs: assigning ctx.font makes the browser work out the page's styles first, which
// when the page has just been changed means a whole style pass, each time (a quarter of a slow frame)
export function setFont(font) { if (ctx.font !== font) ctx.font = font; }

// A small yellow bar above a thing being worked on, share 0..1 done
export function drawProgressBar(cx, cy, share, width = 24) {
  const progress = Math.max(0, Math.min(1, share));
  if (progress <= 0) return;

  let x = cx - width / 2;
  let y = cy - 20;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, width, 4);
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(x + 1, y + 1, (width - 2) * progress, 2);
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, 4);
}

// What this file sets up as the game starts (called by app/boot.js)
export function initCanvas() {
  window.addEventListener('resize', () => { markCanvasSizeStale(); fitCanvasToScreen(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(markCanvasSizeStale).observe(canvas);
  if (GL) initGl(/** @type {HTMLCanvasElement} */ (canvas));
}
