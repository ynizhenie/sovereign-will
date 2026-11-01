// The Endless menu before a game: wave interval, map (random or saved, its size), difficulty, factions and
// colours, the seed, and Play

import { openTab, runLoading } from '../../ui/index.js';
import { GAME_CONFIG } from '../../content/configs/index.js';
import { loadData, onTap, saveData, saveSetting, t } from '../../engine/platform/index.js';
import { applySeedFromUI, createDefaultSeed, game } from '../../engine/world/index.js';
import { getLockedPlayerFaction, loadSides, setSideColor, setSideFaction, sides } from '../../domains/factions/index.js';
import { resetGameSteps } from '../../app/index.js';
import { mainMenu } from '../menu/index.js';
import { loadSavedMaps, renderSavedMapList } from '../editor/index.js';

export const playButton = document.getElementById('play-button');

export const waveOptions = document.querySelectorAll('.wave-option');

export const waveCustom = document.getElementById('wave-custom');

export const mapOptions = document.querySelectorAll('.map-option');

export const mapCustom = /** @type {HTMLElement} */ (document.querySelector('.map-custom'));

export const clampInput = (input, fallback) => {
    const value = Math.round(Number(input.value));
    return Number.isFinite(value) ? Math.max(Number(input.min), Math.min(Number(input.max), value)) : fallback;
};

// wave interval: a preset, or "custom" with its own number of seconds
export const applyCustomWave = () => { game.waveInterval = clampInput(waveCustom, 300); game.waveTimer = game.waveInterval; };

// map size in tiles: a preset square, or "custom" width x height (used by the next resetGame)
export const mapColsInput = document.getElementById('map-cols'), mapRowsInput = document.getElementById('map-rows');

export const applyCustomMap = () => { game.mapSettings = { cols: clampInput(mapColsInput, 192), rows: clampInput(mapRowsInput, 192) }; };

// difficulty (Endless)
export const difficultyOptions = document.querySelectorAll('.difficulty-option');

let starting = false;
export const startGame = async (e) => {
    if (e) e.preventDefault();
    if (starting) return; // (a second tap while the world is made)
    starting = true;
    try {
      applySeedFromUI();
      // (#299) the size picked in the menu (its default one too, never tapped)
      const picked = /** @type {HTMLElement | null} */ (document.querySelector('.map-option.active'));
      if (picked) { if (picked.dataset.mapSize === 'custom') applyCustomMap(); else game.mapSettings = { cols: Number(picked.dataset.mapSize), rows: Number(picked.dataset.mapSize) }; }
      await runLoading('loading.world', resetGameSteps()); // (#326) the menu's scene stays, a bar over it
      openTab('tab-build'); // a new game starts on the Building tab, its sheet closed
      game.gameStarted = true;
      mainMenu.style.display = 'none';
    } finally { starting = false; }
};

// Endless: random (generated) map, or one of the saved maps
export let mapSource = 'random';

export function renderCustomMapList() {
  const maps = loadSavedMaps();
  const savedName = loadData('endlessChoices', {}).customMap;
  // the chosen map may have been deleted or changed in the editor since
  if (game.customMap) game.customMap = maps[game.customMap.name] || null;
  if (mapSource === 'custom' && !game.customMap) game.customMap = maps[savedName] || Object.values(maps)[0] || null;
  // a custom map is played as the faction it was made for
  if (mapSource === 'custom' && game.customMap && game.customMap.faction && sides.player.faction !== game.customMap.faction) setSideFaction('player', game.customMap.faction);
  renderFactionPicker();
  renderSavedMapList(document.getElementById('custom-map-list'), {
    selected: game.customMap && game.customMap.name,
    open: map => { game.customMap = map; renderCustomMapList(); }
  });
}

export function setMapSource(source) {
  mapSource = source;
  document.querySelectorAll('[data-map-source]').forEach(b => b.classList.toggle('active', b.dataset.mapSource === source));
  document.getElementById('main-menu').classList.toggle('custom-map', source === 'custom');
  if (source === 'random') game.customMap = null;
  renderCustomMapList();
}

// The Endless menu's faction rows: a button per faction (the unready ones say "soon") and the colours
export function renderFactionPicker() {
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

// What this file sets up as the game starts (called by app/boot.js)
export function initEndlessSetup() {
  waveOptions.forEach(button => {
      const selectWave = () => {
          const custom = button.dataset.waveInterval === 'custom';
          waveCustom.hidden = !custom;
          if (custom) applyCustomWave();
          else { game.waveInterval = Number(button.dataset.waveInterval); game.waveTimer = game.waveInterval; }

          waveOptions.forEach(btn => {
              btn.classList.remove('active');
          });

          button.classList.add('active');
      };

      onTap(button, selectWave); // (a scroll over it doesn't press it, #232)
  });
  waveCustom.addEventListener('change', applyCustomWave);
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
  difficultyOptions.forEach(button => onTap(button, () => {
    game.gameDifficulty = /** @type {string} */ (button.dataset.difficulty);
    difficultyOptions.forEach(b => b.classList.toggle('active', b === button));
  }));
  onTap(playButton, startGame);
  // the small button next to the seed: a new random seed
  onTap(document.getElementById('seed-reroll'), () => {
    document.getElementById('seed-input').value = createDefaultSeed();
    saveSetting('worldSeed', document.getElementById('seed-input').value);
  });
  document.querySelectorAll('[data-map-source]').forEach(button => onTap(button, () => setMapSource(button.dataset.mapSource)));
  onTap(document.getElementById('mode-endless'), renderCustomMapList); // maps may have changed in the editor
  loadSides();
  renderFactionPicker();
  onTap(document.getElementById('mode-endless'), renderFactionPicker); // in the current language
}

// (#326) What's picked on the Endless screen kept from one visit to the next: the difficulty, the cards, the waves' interval,
// the map's size and where it comes from, the custom numbers (the sides, factions and colours, are kept by factions/). Put
// back as if tapped, once every screen's buttons are set up (app/boot.js)
const CHOICES = ['difficulty', 'cards', 'waveInterval', 'mapSize', 'mapSource'];
const attrOf = name => `data-${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
export function restoreEndlessChoices() {
  const screen = document.querySelector('[data-screen="endless"]');
  if (!screen) return;
  const saved = loadData('endlessChoices', null);
  if (saved) {
    if (saved.waveCustom) waveCustom.value = saved.waveCustom;
    if (saved.mapCols) mapColsInput.value = saved.mapCols;
    if (saved.mapRows) mapRowsInput.value = saved.mapRows;
    for (const name of CHOICES) {
      const button = saved[name] && /** @type {HTMLElement | null} */ (screen.querySelector(`[${attrOf(name)}="${saved[name]}"]`));
      if (button && !button.classList.contains('active')) button.click();
    }
  }
  const remember = () => {
    /** @type {Record<string, string>} */
    const out = { waveCustom: waveCustom.value, mapCols: mapColsInput.value, mapRows: mapRowsInput.value, customMap: game.customMap && game.customMap.name };
    for (const name of CHOICES) { const active = screen.querySelector(`.active[${attrOf(name)}]`); if (active) out[name] = /** @type {string} */ (active.getAttribute(attrOf(name))); }
    saveData('endlessChoices', out);
  };
  // (after the button's own handler: the screen hears the tap once it's done)
  screen.addEventListener('click', () => setTimeout(remember, 0));
  screen.addEventListener('change', () => setTimeout(remember, 0));
}
