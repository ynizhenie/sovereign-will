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

waveOptions.forEach(button => {
    const selectWave = (e) => {
        e.preventDefault();
        waveInterval = Number(button.dataset.waveInterval);
        waveTimer = waveInterval;

        waveOptions.forEach(btn => {
            btn.classList.remove('active');
        });

        button.classList.add('active');
    };

    button.addEventListener('click', selectWave);
    button.addEventListener('touchend', selectWave);
});

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
