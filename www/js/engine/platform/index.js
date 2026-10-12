// The door of engine/platform/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { audio, initAudio, midi, noise, setMusicOn, setSoundOn, startAudio, tone } from './audio.js';
export { camera, clampCamera, getMaxZoom, setZoom, updateInputPos } from './camera.js';
export { canvas, ctx, drawProgressBar, fitCanvasToScreen, getBaseScale, getViewScale, initCanvas, screenPixelRatio } from './canvas.js';
export { onTap } from './dom.js';
export { applyPageTexts, currentLanguage, initI18n, setLanguage, t } from './i18n.js';
export { initInput, isTap, isTouchScreen, joystick, keys, mouse, shiftDown } from './input.js';
export { loadData, loadSetting, saveData, saveSetting } from './storage.js';
