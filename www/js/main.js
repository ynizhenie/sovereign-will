applyPageTexts();
renderConfigHud();

// The game runs in fixed steps of 1/60 s whatever the frame rate, so it plays at the same speed on a
// 30 Hz phone and a 144 Hz monitor (much of the movement is per step). Frames are drawn as often as the
// frame-rate setting allows: 30, 60, or every screen refresh (a browser can't show more than that).
const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 6; // after a long hitch, catch up at most this much instead of freezing
let lastTime = performance.now();
let stepTime = 0;
let lastDrawn = 0;
let frameRateSetting = loadSetting('fps', 'display');
if (frameRateSetting === 'unlimited') frameRateSetting = 'display'; // the old "no limit" (see #123)

function loadSetting(name, fallback) {
  try { return localStorage.getItem(`sovereign-will-${name}`) || fallback; } catch (e) { return fallback; }
}

function saveSetting(name, value) {
  try { localStorage.setItem(`sovereign-will-${name}`, value); } catch (e) { /* not remembered */ }
}

// Endless is lost once the town hall falls or the last settler dies: the defeat screen shows
function isDefeated() {
  return gameStarted && gameMode === 'endless' && (townHall.hp <= 0 || settlers.length === 0);
}

// One step of the game, unless it's lost: then the world stops and no more waves come (#169)
function stepGame(dt) {
  updateDefeat(dt);
  if (isDefeated()) return;
  update(dt);
}

// ---- Defeat (#191): the bottom panel and possession go dead, the camera flies to the base, zooms in and
// stays there; the screen offers to start again or to go back to the main menu
const DEFEAT_FLY_SECONDS = 1.2;
const DEFEAT_CSS_SCALE = 1.5; // how close the camera comes: CSS pixels per world unit
let defeatView = null;      // { from: { x, y, zoom }, to: { x, y, zoom }, t } while the defeat shows

function updateDefeat(dt) {
  const lost = isDefeated();
  document.body.classList.toggle('defeated', lost);
  const overlay = document.getElementById('defeat-overlay');
  if (overlay.hidden === lost) overlay.hidden = !lost;
  if (!lost) { defeatView = null; return; }
  if (!defeatView) {
    unpossess();
    selectedSettler = null;
    setMode('interact');
    updateUI(); // the HUD as it ended (the hall at 0): nothing updates it after this
    playSound('defeat');
    document.getElementById('defeat-survived').textContent = t('defeat.survived', { waves: waveNum - 1 });
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
function isCameraLocked() {
  return isDefeated();
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
const fpsOptions = document.querySelectorAll('.fps-option[data-fps]');
const markFps = () => fpsOptions.forEach(b => b.classList.toggle('active', b.dataset.fps === frameRateSetting));
markFps();
fpsOptions.forEach(button => button.dataset.fps && onTap(button, () => {
  frameRateSetting = button.dataset.fps;
  saveSetting('fps', frameRateSetting);
  markFps();
}));

// FPS counter on / off (Settings), remembered on the device
const showFpsOptions = document.querySelectorAll('[data-show-fps]');
const applyShowFps = value => {
  fpsCounter.hidden = value !== 'on';
  showFpsOptions.forEach(b => b.classList.toggle('active', b.dataset.showFps === value));
};
applyShowFps(loadSetting('showFps', 'off'));
showFpsOptions.forEach(button => onTap(button, () => {
  saveSetting('showFps', button.dataset.showFps);
  applyShowFps(button.dataset.showFps);
}));

const startGame = (e) => {
    if (e) e.preventDefault();
    applySeedFromUI();
    resetGame();
    openTab('tab-build'); // a new game starts on the Building tab (#188)
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

// A list of saved things (maps, generator presets), one per row (#143): tap a name to pick it; its delete
// button asks right there whether to delete it. items: [{ id, label }]; attr names the data attributes the
// rows carry (data-<attr>, data-delete-<attr>).
function renderItemList(list, items, { attr, selected, onPick, onDelete, emptyText }) {
  list.innerHTML = '';
  list.classList.add('item-list');
  if (items.length === 0 && emptyText) {
    const empty = document.createElement('div');
    empty.className = 'item-list-empty';
    empty.textContent = emptyText;
    list.appendChild(empty);
    return;
  }
  const button = (className, html, dataName, id, action) => {
    const b = document.createElement('button');
    b.className = className;
    b.innerHTML = html;
    if (dataName) b.dataset[dataName] = id;
    onTap(b, action);
    return b;
  };
  for (const { id, label } of items) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const showItem = () => {
      row.innerHTML = '';
      row.append(
        button('item-name' + (selected === id ? ' active' : ''), escapeHtml(label), attr, id, () => onPick(id)),
        button('item-delete', iconHtml('close'), 'delete' + attr[0].toUpperCase() + attr.slice(1), id, askToDelete)
      );
    };
    const askToDelete = () => {
      row.innerHTML = '';
      const question = document.createElement('span');
      question.className = 'item-question';
      question.textContent = t('list.deleteQuestion', { name: label });
      row.append(question,
        button('item-confirm', escapeHtml(t('list.yes')), 'confirmDelete', id, () => onDelete(id)),
        button('item-cancel', escapeHtml(t('list.no')), 'cancelDelete', id, showItem));
    };
    showItem();
    list.appendChild(row);
  }
}

onTap(document.getElementById('resume-button'), () => setPaused(false));
onTap(document.getElementById('defeat-restart'), () => { resetGame(); openTab('tab-build'); });
onTap(document.getElementById('defeat-exit'), () => exitToMainMenu());
// out of the pause menu: each mode leaves its own way (#145)
onTap(document.getElementById('exit-to-menu-button'), () => {
  if (gameMode === 'battle') leaveBattleMode();
  else if (gameMode === 'editor') leaveEditor();
  else exitToMainMenu();
});

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
