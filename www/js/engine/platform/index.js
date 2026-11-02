// The door of engine/platform/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { audio, initAudio, midi, noise, setMusicOn, setSoundOn, startAudio, tone } from './audio.js';
export { camera, clampCamera, getMaxZoom, getViewRect, setZoom, updateInputPos } from './camera.js';
export { VSYNC, canvas, canvasCssSize, ctx, drawProgressBar, fitCanvasToScreen, getBaseScale, getViewScale, initCanvas, screenPixelRatio, setFont } from './canvas.js';
export { onTap } from './dom.js';
export { applyPageTexts, currentLanguage, initI18n, setLanguage, statLabel, t } from './i18n.js';
export { initInput, isTap, isTouchScreen, keys, mouse, painted, setDragPainter, shiftDown } from './input.js';
export { loadData, loadSetting, saveData, saveSetting } from './storage.js';
