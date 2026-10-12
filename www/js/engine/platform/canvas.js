// The canvas the game is drawn on: it covers the whole game area at the screen's resolution

import { game } from '../world/state.js';
import { camera, clampCamera, getMaxZoom, getMinZoom } from './camera.js';

export const canvas = document.getElementById('gameCanvas');

export const ctx = canvas.getContext('2d', {
  alpha: false,
  desynchronized: true,
  willReadFrequently: false
});

// ---- Screen and camera
//
// The canvas covers the whole game area at the screen's resolution (fitCanvasToScreen). At zoom 1 the
// world covers the screen; zooming out to getMinZoom() shows all of it.
export let screenPixelRatio = 1;

export function fitCanvasToScreen() {
  screenPixelRatio = Math.min(2, window.devicePixelRatio || 1); // capped: more pixels cost frame time on phones
  const width = Math.max(1, Math.round(canvas.clientWidth * screenPixelRatio));
  const height = Math.max(1, Math.round(canvas.clientHeight * screenPixelRatio));
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
  window.addEventListener('resize', fitCanvasToScreen);
}
