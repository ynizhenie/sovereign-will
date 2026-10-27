// The canvas the game is drawn on: it covers the whole game area at the screen's resolution

import { game } from '../world/index.js';
import { camera, clampCamera, getMaxZoom, getMinZoom } from './camera.js';
import { loadSetting } from './storage.js';

export const canvas = document.getElementById('gameCanvas');

// (#322) VSYNC (Settings, on by default): frames shown in step with the screen's refreshes, whatever its rate
// (60, 75, 120, 144 Hz...), no tearing. Off: drawn straight to the screen as soon as they're done (less delay,
// may tear). Set when the canvas is made: a change takes effect the next time the game starts
export const VSYNC = loadSetting('vsync', 'on') !== 'off';

export const ctx = canvas.getContext('2d', {
  alpha: false,
  desynchronized: !VSYNC,
  willReadFrequently: false
});

// (#322) Quality (Settings): how many canvas pixels to a CSS pixel at most. High: up to 2 (sharp); medium:
// 1.5; low: 1 (a weak phone's GPU fills a third of the pixels). By default high, but medium on a phone with a
// very dense screen
export const QUALITY_RATIOS = { high: 2, medium: 1.5, low: 1 };
export function defaultQuality() {
  const touch = typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  return touch && (window.devicePixelRatio || 1) >= 2.5 ? 'medium' : 'high';
}
export const quality = { level: loadSetting('quality', '') || defaultQuality() };

// ---- Screen and camera
//
// The canvas covers the whole game area at the screen's resolution (fitCanvasToScreen). At zoom 1 the
// world covers the screen; zooming out to getMinZoom() shows all of it.
export let screenPixelRatio = 1;

// (#322) The canvas's size on the page is read again only when it has changed (a resize, a rotation, a panel): reading it every
// frame made the browser lay the page out every frame
let cssWidth = 0, cssHeight = 0, sizeStale = true, sizedFor = 0;
export const markCanvasSizeStale = () => { sizeStale = true; };

export function fitCanvasToScreen() {
  screenPixelRatio = Math.min(QUALITY_RATIOS[quality.level] || 2, window.devicePixelRatio || 1); // capped: more pixels cost frame time on phones
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
}
