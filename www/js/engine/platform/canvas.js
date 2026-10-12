// The canvas the game is drawn on: it covers the whole game area at the screen's resolution

const canvas = document.getElementById('gameCanvas');

const ctx = canvas.getContext('2d', {
  alpha: false,
  desynchronized: true,
  willReadFrequently: false
});

// ---- Screen and camera
//
// The canvas covers the whole game area at the screen's resolution (fitCanvasToScreen). At zoom 1 the
// world covers the screen; zooming out to getMinZoom() shows all of it.
let screenPixelRatio = 1;

function fitCanvasToScreen() {
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
function getBaseScale() {
  return Math.max(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT);
}

// canvas pixels per world unit now
function getViewScale() {
  return getBaseScale() * camera.zoom;
}

window.addEventListener('resize', fitCanvasToScreen);
