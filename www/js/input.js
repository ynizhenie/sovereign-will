window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); togglePause(); return; }
  if (e.code === 'Escape') { unpossess(); return; }
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Tab') { e.preventDefault(); switchPossession(); }
});

window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function bindMobileTouchKey(btnId, keyName) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const press = (e) => { e.preventDefault(); keys[keyName] = true; };
  const release = (e) => { e.preventDefault(); keys[keyName] = false; };

  btn.addEventListener('touchstart', press, { passive: false });
  btn.addEventListener('touchend', release, { passive: false });
  btn.addEventListener('touchcancel', release, { passive: false });
}

bindMobileTouchKey('btn-w', 'w');
bindMobileTouchKey('btn-a', 'a');
bindMobileTouchKey('btn-s', 's');
bindMobileTouchKey('btn-d', 'd');

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

function updateInputPos(clientX, clientY) {
  const { screenX, screenY } = getCanvasScreenCoords(clientX, clientY);
  mouse.x = camera.x + (screenX - canvas.width / 2) / camera.zoom;
  mouse.y = camera.y + (screenY - canvas.height / 2) / camera.zoom;
}

function clampCamera() {
  const halfWidth = canvas.width / (2 * camera.zoom);
  const halfHeight = canvas.height / (2 * camera.zoom);
  camera.x = halfWidth >= canvas.width / 2
    ? canvas.width / 2
    : Math.max(halfWidth, Math.min(canvas.width - halfWidth, camera.x));
  camera.y = halfHeight >= canvas.height / 2
    ? canvas.height / 2
    : Math.max(halfHeight, Math.min(canvas.height - halfHeight, camera.y));
}

canvas.addEventListener('mousemove', e => {
  if (cameraDragging) {
    const { renderWidth, renderHeight } = getCanvasScreenCoords(e.clientX, e.clientY);
    camera.x -= (e.clientX - cameraDragPoint.x) * canvas.width / renderWidth / camera.zoom;
    camera.y -= (e.clientY - cameraDragPoint.y) * canvas.height / renderHeight / camera.zoom;
    cameraDragPoint = { x: e.clientX, y: e.clientY };
    clampCamera();
  }
  updateInputPos(e.clientX, e.clientY);
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const { screenX, screenY } = getCanvasScreenCoords(e.clientX, e.clientY);
  const worldBeforeZoom = {
    x: camera.x + (screenX - canvas.width / 2) / camera.zoom,
    y: camera.y + (screenY - canvas.height / 2) / camera.zoom
  };

  camera.zoom = Math.max(0.7, Math.min(2.4, camera.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
  camera.x = worldBeforeZoom.x - (screenX - canvas.width / 2) / camera.zoom;
  camera.y = worldBeforeZoom.y - (screenY - canvas.height / 2) / camera.zoom;
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

  if (e.touches.length === 1 && isTouchDragging) {
    const touch = e.touches[0];
    const distMoved = Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y);
    if (distMoved > 8) isTap = false;

    const { renderWidth, renderHeight } = getCanvasScreenCoords(touch.clientX, touch.clientY);
    camera.x -= (touch.clientX - touchDragPoint.x) * canvas.width / renderWidth / camera.zoom;
    camera.y -= (touch.clientY - touchDragPoint.y) * canvas.height / renderHeight / camera.zoom;
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
        x: camera.x + (screenX - canvas.width / 2) / camera.zoom,
        y: camera.y + (screenY - canvas.height / 2) / camera.zoom
      };

      camera.zoom = Math.max(0.7, Math.min(2.4, touchStartZoom * factor));
      camera.x = worldBeforeZoom.x - (screenX - canvas.width / 2) / camera.zoom;
      camera.y = worldBeforeZoom.y - (screenY - canvas.height / 2) / camera.zoom;
      clampCamera();
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (e.touches.length === 0) {
    isTouchDragging = false;
  }
});

function zoomIn() {
  camera.zoom = Math.min(2.4, camera.zoom * 1.2);
  clampCamera();
}

function zoomOut() {
  camera.zoom = Math.max(0.7, camera.zoom / 1.2);
  clampCamera();
}

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
  const uiElements = ['top-bar', 'zoom-controls', 'bottom-panel', 'btn-interact', 'mobile-dpad'];
  
  uiElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      el.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
      el.addEventListener('mousedown', (e) => e.stopPropagation());
    }
  });
});
