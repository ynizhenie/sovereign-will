// The start: texts and panel made, the canvas fitted, and the loop: the game in fixed steps of 1/60 s,
// drawn as often as the frame rate setting allows

// The game runs in fixed steps of 1/60 s whatever the frame rate, so it plays at the same speed on a
// 30 Hz phone and a 144 Hz monitor (much of the movement is per step). Frames are drawn as often as the
// frame-rate setting allows: 30, 60, or every screen refresh (a browser can't show more than that).
const STEP = 1 / 60;

const MAX_STEPS_PER_FRAME = 6; // after a long hitch, catch up at most this much instead of freezing

let lastTime = performance.now();

let stepTime = 0;

let lastDrawn = 0;

let frameRateSetting = loadSetting('fps', 'display');

// One step of the game, unless it's lost: then the world stops and no more waves come (#169)
function stepGame(dt) {
  updateDefeat(dt);
  if (isDefeated()) return;
  update(dt);
}

function gameLoop(now) {
  if (typeof syncMenuWorld === 'function') syncMenuWorld(); // the world behind the main menu (#193)
  if (typeof updateMusic === 'function') updateMusic(); // (#174)
  stepTime += Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  let steps = 0;
  while (stepTime >= STEP && steps < MAX_STEPS_PER_FRAME) {
    stepGame(STEP);
    stepTime -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) stepTime = 0;

  const limit = Number(frameRateSetting);
  if (!limit || now - lastDrawn >= 1000 / limit - 2) {
    lastDrawn = now;
    fitCanvasToScreen(); // cheap unless the game area changed size (rotation, panels)
    render();
    countFrame(now);
  }
  requestAnimationFrame(gameLoop);
}

// ---- FPS counter (Settings): frames drawn over the last second
const fpsCounter = document.getElementById('fps-counter');

let framesThisSecond = 0, secondStart = 0;

function countFrame(now) {
  framesThisSecond++;
  if (now - secondStart >= 1000) {
    if (!fpsCounter.hidden) fpsCounter.textContent = `${Math.round(framesThisSecond * 1000 / (now - secondStart))} FPS`;
    framesThisSecond = 0;
    secondStart = now;
  }
}

// What this file sets up as the game starts (called by app/boot.js)
function initMain() {
  applyPageTexts();
  renderConfigHud();
  if (frameRateSetting === 'unlimited') frameRateSetting = 'display'; // the old "no limit" (see #123)
  fitCanvasToScreen();
  requestAnimationFrame(gameLoop);
}
