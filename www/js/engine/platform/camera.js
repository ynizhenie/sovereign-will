// The camera over the world: where it looks, how close (zoom), and screen <-> world coordinates

import { game } from '../world/state.js';
import { canvas, getBaseScale, getViewScale, screenPixelRatio } from './canvas.js';
import { mouse } from './input.js';

export let camera = { x: game.WORLD_WIDTH / 2, y: game.WORLD_HEIGHT / 2, zoom: 1 };

export function getCanvasScreenCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const canvasAspect = canvas.width / canvas.height;
  const rectAspect = rect.width / rect.height;

  let renderWidth, renderHeight, offsetX, offsetY;

  if (rectAspect > canvasAspect) {
    renderHeight = rect.height;
    renderWidth = rect.height * canvasAspect;
    offsetX = (rect.width - renderWidth) / 2;
    offsetY = 0;
  } else {
    renderWidth = rect.width;
    renderHeight = rect.width / canvasAspect;
    offsetX = 0;
    offsetY = (rect.height - renderHeight) / 2;
  }

  const screenX = (clientX - rect.left - offsetX) * canvas.width / renderWidth;
  const screenY = (clientY - rect.top - offsetY) * canvas.height / renderHeight;

  return { screenX, screenY, renderWidth, renderHeight };
}

// zoomed in at most this far, or until a world unit is MAX_CSS_SCALE CSS pixels, whichever is closer:
// on a big map the base scale is small, so a fixed factor didn't get close enough on a phone (#182)
export const MAX_ZOOM = 2.4;

export const MAX_CSS_SCALE = 3;

export function getMaxZoom() {
  return Math.max(MAX_ZOOM, MAX_CSS_SCALE * screenPixelRatio / getBaseScale());
}

// zoomed out this far, the whole world fits on the screen
export function getMinZoom() {
  return Math.min(canvas.width / game.WORLD_WIDTH, canvas.height / game.WORLD_HEIGHT) / getBaseScale();
}

export function setZoom(zoom) {
  camera.zoom = Math.max(getMinZoom(), Math.min(getMaxZoom(), zoom));
}

export function updateInputPos(clientX, clientY) {
  const { screenX, screenY } = getCanvasScreenCoords(clientX, clientY);
  // screen coords are for UI drawn over the canvas without the camera
  mouse.screenX = screenX;
  mouse.screenY = screenY;
  mouse.x = camera.x + (screenX - canvas.width / 2) / getViewScale();
  mouse.y = camera.y + (screenY - canvas.height / 2) / getViewScale();
}

export function clampCamera() {
  // the camera's centre stays on the map, at any zoom: the view goes up to half of it past the map's
  // edge, and zoomed all the way out it isn't pulled back to the middle (#182, #189)
  camera.x = Math.max(0, Math.min(game.WORLD_WIDTH, camera.x));
  camera.y = Math.max(0, Math.min(game.WORLD_HEIGHT, camera.y));
}
