// An Endless game is lost when the town hall falls or the last settler dies: the defeat screen, the camera
// flying to the base

import { openTab, setMode, updateUI } from '../../ui/index.js';
import { camera, getBaseScale, getMaxZoom, onTap, screenPixelRatio, t } from '../../engine/platform/index.js';
import { game, townHall } from '../../engine/world/index.js';
import { unpossess } from '../../domains/colony/settlers/index.js';
import { exitToMainMenu, playSound, resetGame } from '../../app/index.js';

// Endless is lost once the town hall falls or the last settler dies: the defeat screen shows
export function isDefeated() {
  return game.gameStarted && game.gameMode === 'endless' && (townHall.hp <= 0 || game.settlers.length === 0);
}

// ---- Defeat: the bottom panel and possession go dead, the camera flies to the base, zooms in and
// stays there; the screen offers to start again or to go back to the main menu
export const DEFEAT_FLY_SECONDS = 1.2;

export const DEFEAT_CSS_SCALE = 1.5; // how close the camera comes: CSS pixels per world unit

export let defeatView = null;      // { from: { x, y, zoom }, to: { x, y, zoom }, t } while the defeat shows

export function updateDefeat(dt) {
  const lost = isDefeated();
  document.body.classList.toggle('defeated', lost);
  const overlay = document.getElementById('defeat-overlay');
  if (overlay.hidden === lost) overlay.hidden = !lost;
  if (!lost) { defeatView = null; return; }
  if (!defeatView) {
    unpossess();
    game.selectedSettler = null;
    setMode('interact');
    updateUI(); // the HUD as it ended (the hall at 0): nothing updates it after this
    playSound('defeat');
    document.getElementById('defeat-survived').textContent = t('defeat.survived', { waves: game.waveNum - 1 });
    const zoom = Math.max(1, Math.min(getMaxZoom(), DEFEAT_CSS_SCALE * screenPixelRatio / getBaseScale()));
    defeatView = { from: { x: camera.x, y: camera.y, zoom: camera.zoom }, to: { x: townHall.x, y: townHall.y, zoom }, t: 0 };
  }
  if (defeatView.t >= 1) return;
  defeatView.t = Math.min(1, defeatView.t + dt / DEFEAT_FLY_SECONDS);
  const k = 1 - Math.pow(1 - defeatView.t, 3); // eases out
  const { from, to } = defeatView;
  camera.x = from.x + (to.x - from.x) * k;
  camera.y = from.y + (to.y - from.y) * k;
  camera.zoom = from.zoom + (to.zoom - from.zoom) * k;
}

// the camera doesn't move by hand while the defeat shows
export function isCameraLocked() {
  return isDefeated();
}

// What this file sets up as the game starts (called by app/boot.js)
export function initEndlessRules() {
  onTap(document.getElementById('defeat-restart'), () => { resetGame(); openTab('tab-build'); });
  onTap(document.getElementById('defeat-exit'), () => exitToMainMenu());
}
