window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); togglePause(); return; }
  if (e.code === 'Escape') { unpossess(); return; }
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Tab') { e.preventDefault(); switchPossession(); }
});

window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// The joystick for the possessed settler: drag the knob, how far from the centre sets the speed
const JOYSTICK_REACH = 45;
(function bindJoystick() {
  const base = document.getElementById('mobile-joystick');
  const knob = base.querySelector('.joystick-knob');
  let pointerId = null;
  const moveKnob = (clientX, clientY) => {
    const rect = base.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2), dy = clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_REACH) { dx *= JOYSTICK_REACH / dist; dy *= JOYSTICK_REACH / dist; }
    joystick.x = dx / JOYSTICK_REACH;
    joystick.y = dy / JOYSTICK_REACH;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const release = e => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    joystick.x = joystick.y = 0;
    knob.style.transform = '';
  };
  base.addEventListener('pointerdown', e => {
    e.preventDefault();
    pointerId = e.pointerId;
    base.setPointerCapture(e.pointerId);
    moveKnob(e.clientX, e.clientY);
  });
  base.addEventListener('pointermove', e => { if (e.pointerId === pointerId) moveKnob(e.clientX, e.clientY); });
  base.addEventListener('pointerup', release);
  base.addEventListener('pointercancel', release);
})();

function getCanvasScreenCoords(clientX, clientY) {
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

// zoomed in at most this far, or until a world unit is MAX_CSS_SCALE CSS pixels, whichever is closer:
// on a big map the base scale is small, so a fixed factor didn't get close enough on a phone (#182)
const MAX_ZOOM = 2.4;
const MAX_CSS_SCALE = 3;
function getMaxZoom() {
  return Math.max(MAX_ZOOM, MAX_CSS_SCALE * screenPixelRatio / getBaseScale());
}

// zoomed out this far, the whole world fits on the screen
function getMinZoom() {
  return Math.min(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT) / getBaseScale();
}

function setZoom(zoom) {
  camera.zoom = Math.max(getMinZoom(), Math.min(getMaxZoom(), zoom));
}

window.addEventListener('resize', fitCanvasToScreen);

function updateInputPos(clientX, clientY) {
  const { screenX, screenY } = getCanvasScreenCoords(clientX, clientY);
  // screen coords are for UI drawn over the canvas without the camera
  mouse.screenX = screenX;
  mouse.screenY = screenY;
  mouse.x = camera.x + (screenX - canvas.width / 2) / getViewScale();
  mouse.y = camera.y + (screenY - canvas.height / 2) / getViewScale();
}

function clampCamera() {
  // the camera's centre stays on the map, at any zoom: the view goes up to half of it past the map's
  // edge, and zoomed all the way out it isn't pulled back to the middle (#182, #189)
  camera.x = Math.max(0, Math.min(WORLD_WIDTH, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT, camera.y));
}

canvas.addEventListener('mousemove', e => {
  if (cameraDragging && !isCameraLocked()) {
    const { renderWidth, renderHeight } = getCanvasScreenCoords(e.clientX, e.clientY);
    camera.x -= (e.clientX - cameraDragPoint.x) * canvas.width / renderWidth / getViewScale();
    camera.y -= (e.clientY - cameraDragPoint.y) * canvas.height / renderHeight / getViewScale();
    cameraDragPoint = { x: e.clientX, y: e.clientY };
    clampCamera();
  }
  updateInputPos(e.clientX, e.clientY);
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (isCameraLocked()) return;
  const { screenX, screenY } = getCanvasScreenCoords(e.clientX, e.clientY);
  const worldBeforeZoom = {
    x: camera.x + (screenX - canvas.width / 2) / getViewScale(),
    y: camera.y + (screenY - canvas.height / 2) / getViewScale()
  };

  setZoom(camera.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
  camera.x = worldBeforeZoom.x - (screenX - canvas.width / 2) / getViewScale();
  camera.y = worldBeforeZoom.y - (screenY - canvas.height / 2) / getViewScale();
  clampCamera();
  updateInputPos(e.clientX, e.clientY);
}, { passive: false });

canvas.addEventListener('mousedown', e => {
  if (e.button === 1 || e.button === 2) {
    cameraDragging = true;
    cameraDragPoint = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }
});

window.addEventListener('mouseup', e => {
  if (e.button === 1 || e.button === 2) cameraDragging = false;
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

let touchStartDist = 0;
let touchStartZoom = 1;
let touchDragPoint = { x: 0, y: 0 };
let touchStartPos = { x: 0, y: 0 };
let isTouchDragging = false;
let isTap = false;

canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    if (typeof getPossessed === 'function' && getPossessed()) {
      isTouchDragging = false;
      return;
    }

    const touch = e.touches[0];
    isTouchDragging = true;
    isTap = true;
    touchDragPoint = { x: touch.clientX, y: touch.clientY };
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    updateInputPos(touch.clientX, touch.clientY);
  } else if (e.touches.length === 2) {
    isTouchDragging = false;
    isTap = false;
    touchStartDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    touchStartZoom = camera.zoom;
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (isCameraLocked()) return;

  if (e.touches.length === 1 && isTouchDragging) {
    const touch = e.touches[0];
    const distMoved = Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y);
    if (distMoved > 8) isTap = false;

    const { renderWidth, renderHeight } = getCanvasScreenCoords(touch.clientX, touch.clientY);
    camera.x -= (touch.clientX - touchDragPoint.x) * canvas.width / renderWidth / getViewScale();
    camera.y -= (touch.clientY - touchDragPoint.y) * canvas.height / renderHeight / getViewScale();
    touchDragPoint = { x: touch.clientX, y: touch.clientY };

    clampCamera();
    updateInputPos(touch.clientX, touch.clientY);
  } else if (e.touches.length === 2) {
    isTap = false;
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );

    if (touchStartDist > 0) {
      const factor = dist / touchStartDist;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const { screenX, screenY } = getCanvasScreenCoords(midX, midY);

      const worldBeforeZoom = {
        x: camera.x + (screenX - canvas.width / 2) / getViewScale(),
        y: camera.y + (screenY - canvas.height / 2) / getViewScale()
      };

      setZoom(touchStartZoom * factor);
      camera.x = worldBeforeZoom.x - (screenX - canvas.width / 2) / getViewScale();
      camera.y = worldBeforeZoom.y - (screenY - canvas.height / 2) / getViewScale();
      clampCamera();
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (e.touches.length === 0) {
    isTouchDragging = false;
  }
});


window.addEventListener('dblclick', function(e) {
  e.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function(e) {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

document.addEventListener("touchstart", function() {}, true);

window.addEventListener('DOMContentLoaded', () => {
  const uiElements = ['top-bar', 'bottom-panel', 'btn-interact', 'mobile-joystick'];
  
  uiElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      el.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
      el.addEventListener('mousedown', (e) => e.stopPropagation());
    }
  });
});
