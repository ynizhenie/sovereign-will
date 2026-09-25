renderConfigHud();

let lastTime = performance.now();
function gameLoop(now) {
  let dt = (now - lastTime) / 1000;
  if (dt > 0.1) dt = 0.1;
  lastTime = now;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

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
