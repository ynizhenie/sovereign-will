// The Endless menu before a game: wave interval, map (random or saved, its size), difficulty, factions and
// colours, the seed, and Play

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
const applyCustomWave = () => { game.waveInterval = clampInput(waveCustom, 90); game.waveTimer = game.waveInterval; };

waveOptions.forEach(button => {
    const selectWave = (e) => {
        e.preventDefault();
        const custom = button.dataset.waveInterval === 'custom';
        waveCustom.hidden = !custom;
        if (custom) applyCustomWave();
        else { game.waveInterval = Number(button.dataset.waveInterval); game.waveTimer = game.waveInterval; }

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

const applyCustomMap = () => { game.mapSettings = { cols: clampInput(mapColsInput, 40), rows: clampInput(mapRowsInput, 40) }; };

mapOptions.forEach(button => {
    onTap(button, () => {
        const custom = button.dataset.mapSize === 'custom';
        mapCustom.hidden = !custom;
        if (custom) applyCustomMap();
        else { const size = Number(button.dataset.mapSize); game.mapSettings = { cols: size, rows: size }; }
        mapOptions.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
    });
});

mapColsInput.addEventListener('change', applyCustomMap);

mapRowsInput.addEventListener('change', applyCustomMap);

// difficulty (Endless)
const difficultyOptions = document.querySelectorAll('.difficulty-option');

difficultyOptions.forEach(button => onTap(button, () => {
  game.gameDifficulty = button.dataset.difficulty;
  difficultyOptions.forEach(b => b.classList.toggle('active', b === button));
}));

const startGame = (e) => {
    if (e) e.preventDefault();
    applySeedFromUI();
    resetGame();
    openTab('tab-build'); // a new game starts on the Building tab (#188)
    game.gameStarted = true;
    mainMenu.style.display = 'none';
};

playButton.addEventListener('click', startGame);

playButton.addEventListener('touchend', startGame);

// the small button next to the seed: a new random seed
onTap(document.getElementById('seed-reroll'), () => {
  document.getElementById('seed-input').value = createDefaultSeed();
});

// Endless: random (generated) map, or one of the saved maps
let mapSource = 'random';

function renderCustomMapList() {
  const maps = loadSavedMaps();
  // the chosen map may have been deleted or changed in the editor since
  if (game.customMap) game.customMap = maps[game.customMap.name] || null;
  if (mapSource === 'custom' && !game.customMap) game.customMap = Object.values(maps)[0] || null;
  // a custom map is played as the faction it was made for (#170)
  if (mapSource === 'custom' && game.customMap && game.customMap.faction && sides.player.faction !== game.customMap.faction) setSideFaction('player', game.customMap.faction);
  renderFactionPicker();
  renderSavedMapList(document.getElementById('custom-map-list'), {
    selected: game.customMap && game.customMap.name,
    open: map => { game.customMap = map; renderCustomMapList(); }
  });
}

function setMapSource(source) {
  mapSource = source;
  document.querySelectorAll('[data-map-source]').forEach(b => b.classList.toggle('active', b.dataset.mapSource === source));
  document.getElementById('main-menu').classList.toggle('custom-map', source === 'custom');
  if (source === 'random') game.customMap = null;
  renderCustomMapList();
}

document.querySelectorAll('[data-map-source]').forEach(button => onTap(button, () => setMapSource(button.dataset.mapSource)));
onTap(document.getElementById('mode-endless'), renderCustomMapList); // maps may have changed in the editor

// The Endless menu's faction rows: a button per faction (the unready ones say "soon") and the colours
function renderFactionPicker() {
  for (const side of ['player', 'enemy']) {
    const row = document.getElementById(`faction-${side}`);
    row.innerHTML = '';
    for (const faction of Object.values(GAME_CONFIG.factions)) {
      const button = document.createElement('button');
      button.className = 'faction-option' + (sides[side].faction === faction.id ? ' active' : '');
      button.dataset.faction = faction.id;
      const locked = side === 'player' && getLockedPlayerFaction();
      button.disabled = !faction.ready || (!!locked && faction.id !== locked);
      button.textContent = faction.ready ? faction.label : `${faction.label} · ${t('menu.soon')}`;
      onTap(button, () => setSideFaction(side, faction.id));
      row.appendChild(button);
    }
    const colors = document.getElementById(`colors-${side}`);
    colors.innerHTML = '';
    const other = side === 'player' ? sides.enemy.color : sides.player.color;
    for (const color of GAME_CONFIG.factionColors) {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch' + (sides[side].color === color ? ' active' : '');
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.disabled = color === other;
      swatch.setAttribute('aria-label', color);
      onTap(swatch, () => setSideColor(side, color));
      colors.appendChild(swatch);
    }
  }
}

loadSides();
renderFactionPicker();
onTap(document.getElementById('mode-endless'), renderFactionPicker); // in the current language
