renderConfigHud();

let lastTime = performance.now();
function gameLoop(now) {
  let dt = (now - lastTime) / 1000;
  if (dt > 0.1) dt = 0.1;
  lastTime = now;

  update(dt);
  fitCanvasToScreen(); // cheap unless the game area changed size (rotation, panels)
  render();

  requestAnimationFrame(gameLoop);
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
