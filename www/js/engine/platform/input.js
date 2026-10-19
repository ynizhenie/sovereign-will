// Keyboard, mouse, touch and the on-screen joystick: what the player presses, turned into the game's
// commands (pause, possession, camera drag and zoom, taps on the map)

import { canvas, getViewScale } from './canvas.js';
import { camera, clampCamera, getCanvasScreenCoords, setZoom, updateInputPos } from './camera.js';
import { getPossessed, switchPossession, unpossess } from '../../domains/colony/settlers/index.js';
import { togglePause } from '../../app/index.js';
import { isCameraLocked } from '../../modes/endless/index.js';

export const keys = {};

// the on-screen joystick for the possessed settler: x, y in -1..1 (bindJoystick, below)
export const joystick = { x: 0, y: 0 };

export let mouse = { x: 0, y: 0 };

// Shift held: a building placed keeps the build mode on, to place another (see handleCanvasClick)
export let shiftDown = false;

// a touch screen: the possession joystick shows there only (a keyboard steers on a computer)
export const isTouchScreen = () => (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;

// The joystick for the possessed settler: drag the knob, how far from the centre sets the speed
export const JOYSTICK_REACH = 45;

export let touchStartDist = 0;

export let touchStartZoom = 1;

export let touchDragPoint = { x: 0, y: 0 };

export let touchStartPos = { x: 0, y: 0 };

export let isTouchDragging = false;

export let isTap = false;

export let lastTouchEnd = 0;

// A painter for drags on the map (the editor's brush, #255): painter(phase, x, y), phase 'start' as a press
// begins, 'move' as it drags (true: it paints, the camera stays), 'end' as it's let go; x, y in the world
/** @type {((phase: string, x: number, y: number) => boolean) | null} */
let dragPainter = null;
export function setDragPainter(painter) { dragPainter = painter; }
// the press being let go painted: its release isn't a tap
export let painted = false;
const paint = (phase, clientX, clientY) => {
  if (!dragPainter) return false;
  updateInputPos(clientX, clientY);
  return dragPainter(phase, mouse.x, mouse.y);
};

// What this file sets up as the game starts (called by app/boot.js)
export function initInput() {
  bindKeyboard();
  bindJoystick();
  bindMouse();
  bindTouch();
  keepPageStill();
}

// Keys: Shift held (to keep a build mode), Space or P to pause, Escape out of possession, Tab to the
// next settler, the rest held down for steering
function bindKeyboard() {
  window.addEventListener('keydown', e => {
    if (e.key === 'Shift') shiftDown = true;
    if (e.code === 'Space' || (e.code === 'KeyP' && !e.repeat && document.activeElement?.tagName !== 'INPUT')) { e.preventDefault(); togglePause(); return; }
    if (e.code === 'Escape') { unpossess(); return; }
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'Tab') { e.preventDefault(); switchPossession(); }
  });
  window.addEventListener('keyup', e => { if (e.key === 'Shift') shiftDown = false; keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { shiftDown = false; });
}

// The joystick for the possessed settler: drag the knob, how far from the centre sets the speed
function bindJoystick() {
  const base = document.getElementById('mobile-joystick');
  const knob = /** @type {HTMLElement} */ (base.querySelector('.joystick-knob'));
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
}

// The mouse on the map: the pointer, the camera dragged with the middle or right button, the wheel to zoom
function bindMouse() {
  canvas.addEventListener('mousemove', e => {
    if ((e.buttons & 1) && paint('move', e.clientX, e.clientY)) painted = true;
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
    if (e.button === 0) { painted = false; paint('start', e.clientX, e.clientY); }
    if (e.button === 1 || e.button === 2) {
      cameraDragging = true;
      cameraDragPoint = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) paint('end', e.clientX, e.clientY);
    if (e.button === 1 || e.button === 2) cameraDragging = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

// Touch on the map: one finger drags the camera (or taps), two pinch to zoom
function bindTouch() {
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      if (typeof getPossessed === 'function' && getPossessed()) {
        isTouchDragging = false;
        return;
      }

      const touch = e.touches[0];
      isTouchDragging = true;
      isTap = true;
      painted = false;
      paint('start', touch.clientX, touch.clientY);
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
      if (distMoved > 8 && paint('move', touch.clientX, touch.clientY)) { painted = true; return; } // (painting, not looking around)

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
      if (isTouchDragging && e.changedTouches[0]) paint('end', e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      isTouchDragging = false;
    }
  });
}

// The page itself doesn't zoom or scroll on double taps, and touches on the panels stay theirs
function keepPageStill() {
  window.addEventListener('dblclick', function(e) {
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener("touchstart", function() {}, true);
  window.addEventListener('DOMContentLoaded', () => {
    const uiElements = [...document.querySelectorAll('.hud-layer'), document.getElementById('mobile-joystick')];

    uiElements.forEach(el => {
      if (el) {
        el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        el.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
        el.addEventListener('mousedown', (e) => e.stopPropagation());
      }
    });
  });
}

export let cameraDragging = false;

export let cameraDragPoint = { x: 0, y: 0 };
