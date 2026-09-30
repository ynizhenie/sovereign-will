applyPageTexts();
renderConfigHud();

// The game runs in fixed steps of 1/60 s whatever the frame rate, so it plays at the same speed on a
// 30 Hz phone and a 144 Hz monitor (much of the movement is per step). Frames are drawn as often as the
// frame-rate setting allows: 30, 60, every screen refresh, or as fast as the browser will go.
const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 6; // after a long hitch, catch up at most this much instead of freezing
let lastTime = performance.now();
let stepTime = 0;
let lastDrawn = 0;
let frameRateSetting = loadSetting('fps', 'display');

function loadSetting(name, fallback) {
  try { return localStorage.getItem(`sovereign-will-${name}`) || fallback; } catch (e) { return fallback; }
}

function saveSetting(name, value) {
  try { localStorage.setItem(`sovereign-will-${name}`, value); } catch (e) { /* not remembered */ }
}

function gameLoop(now) {
  stepTime += Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  let steps = 0;
  while (stepTime >= STEP && steps < MAX_STEPS_PER_FRAME) {
    update(STEP);
    stepTime -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) stepTime = 0;

  const limit = Number(frameRateSetting);
  if (!limit || now - lastDrawn >= 1000 / limit - 2) {
    lastDrawn = now;
    fitCanvasToScreen(); // cheap unless the game area changed size (rotation, panels)
    render();
  }
  scheduleFrame();
}

// every screen refresh, or (no limit) as soon as the browser can, via a message
const frameChannel = new MessageChannel();
frameChannel.port1.onmessage = () => gameLoop(performance.now());
function scheduleFrame() {
  if (frameRateSetting === 'unlimited') frameChannel.port2.postMessage(0);
  else requestAnimationFrame(gameLoop);
}

fitCanvasToScreen();
requestAnimationFrame(gameLoop);

const mainMenu = document.getElementById('main-menu');
const playButton = document.getElementById('play-button');
const waveOptions = document.querySelectorAll('.wave-option');

const waveCustom = document.getElementById('wave-custom');
const mapOptions = document.querySelectorAll('.map-option');
const mapCustom = document.querySelector('.map-custom');
const clampInput = (input, fallback) => {
    const value = Math.round(Number(input.value));
    return Number.isFinite(value) ? Math.max(Number(input.min), Math.min(Number(input.max), value)) : fallback;
};

// wave interval: a preset, or "custom" with its own number of seconds
const applyCustomWave = () => { waveInterval = clampInput(waveCustom, 90); waveTimer = waveInterval; };
waveOptions.forEach(button => {
    const selectWave = (e) => {
        e.preventDefault();
        const custom = button.dataset.waveInterval === 'custom';
        waveCustom.hidden = !custom;
        if (custom) applyCustomWave();
        else { waveInterval = Number(button.dataset.waveInterval); waveTimer = waveInterval; }

        waveOptions.forEach(btn => {
            btn.classList.remove('active');
        });

        button.classList.add('active');
    };

    button.addEventListener('click', selectWave);
    button.addEventListener('touchend', selectWave);
});
waveCustom.addEventListener('change', applyCustomWave);

// map size in tiles: a preset square, or "custom" width x height (used by the next resetGame)
const mapColsInput = document.getElementById('map-cols'), mapRowsInput = document.getElementById('map-rows');
const applyCustomMap = () => { mapSettings = { cols: clampInput(mapColsInput, 40), rows: clampInput(mapRowsInput, 40) }; };
mapOptions.forEach(button => {
    onTap(button, () => {
        const custom = button.dataset.mapSize === 'custom';
        mapCustom.hidden = !custom;
        if (custom) applyCustomMap();
        else { const size = Number(button.dataset.mapSize); mapSettings = { cols: size, rows: size }; }
        mapOptions.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
    });
});
mapColsInput.addEventListener('change', applyCustomMap);
mapRowsInput.addEventListener('change', applyCustomMap);

// ---- Main menu screens: home (modes), endless (setup), settings

function showMenuScreen(name) {
  document.querySelectorAll('#main-menu [data-screen]').forEach(screen => { screen.hidden = screen.dataset.screen !== name; });
}

onTap(document.getElementById('mode-endless'), () => showMenuScreen('endless'));
onTap(document.getElementById('open-settings'), () => showMenuScreen('settings'));
document.querySelectorAll('#main-menu [data-back]').forEach(button => onTap(button, () => showMenuScreen('home')));

// Exit closes the app on Android; a browser tab can't close itself, so there it isn't shown
const nativeApp = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
  window.Capacitor.Plugins && window.Capacitor.Plugins.App;
const exitButton = document.getElementById('exit-app');
exitButton.hidden = !nativeApp;
onTap(exitButton, () => { if (nativeApp) nativeApp.exitApp(); });

// difficulty (Endless)
const difficultyOptions = document.querySelectorAll('.difficulty-option');
difficultyOptions.forEach(button => onTap(button, () => {
  gameDifficulty = button.dataset.difficulty;
  difficultyOptions.forEach(b => b.classList.toggle('active', b === button));
}));

// frame rate (Settings), remembered on the device
const fpsOptions = document.querySelectorAll('.fps-option');
const markFps = () => fpsOptions.forEach(b => b.classList.toggle('active', b.dataset.fps === frameRateSetting));
markFps();
fpsOptions.forEach(button => onTap(button, () => {
  frameRateSetting = button.dataset.fps;
  saveSetting('fps', frameRateSetting);
  markFps();
}));

const startGame = (e) => {
    if (e) e.preventDefault();
    applySeedFromUI();
    resetGame();
    gameStarted = true;
    mainMenu.style.display = 'none';
};

playButton.addEventListener('click', startGame);
playButton.addEventListener('touchend', startGame);

// like the play button: touchend too, since a second tap within 300ms never becomes a click (see input.js)
function onTap(element, action) {
  const handler = (e) => { e.preventDefault(); action(); };
  element.addEventListener('click', handler);
  element.addEventListener('touchend', handler);
}

onTap(document.getElementById('resume-button'), () => setPaused(false));
onTap(document.getElementById('exit-to-menu-button'), exitToMainMenu);

// the small button next to the seed: a new random seed
onTap(document.getElementById('seed-reroll'), () => {
  document.getElementById('seed-input').value = createDefaultSeed();
});

// language buttons in the main menu (see i18n.js)
const languageOptions = document.getElementById('language-options');
for (const [code, language] of Object.entries(LANGUAGES)) {
  const button = document.createElement('button');
  button.className = 'wave-option' + (code === currentLanguage ? ' active' : '');
  button.dataset.language = code;
  button.textContent = language.label;
  languageOptions.appendChild(button);
  onTap(button, () => {
    setLanguage(code);
    languageOptions.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.language === code));
  });
}
