// Map generator settings (#326, 27.10, 18: the continent's alone, every map is one): the sea round the land, how much
// of it is mountain, desert, forest and lake, what grows on each biome, and the ore and regrowth (GAME_CONFIG.map's
// that a continent uses), a Standard preset and the player's own presets, saved on the device. The values go
// straight into GAME_CONFIG.continent and GAME_CONFIG.map, which the next new game (resetGame -> generateMap) reads.
// The screen opens from Endless and from the editor (19), and goes back there.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { loadData, onTap, saveData, t } from '../../engine/platform/index.js';
import { renderItemList } from '../../ui/index.js';
import { showMenuScreen } from '../menu/index.js';

// The settings as the game ships them: the Standard preset
export const STANDARD_MAP_SETTINGS = JSON.parse(JSON.stringify(GAME_CONFIG.map));
// (#326) the continent's settings that can be changed (what else is in GAME_CONFIG.continent is the generator's own)
export const CONTINENT_SHARES = { margin: 0.2, mountains: 0.6, desert: 0.6, forest: 0.8, lakes: 0.2 }; // key: its most (a share of the map or of the land)
export const CONTINENT_BIOMES = ['grassland', 'forest', 'desert', 'foothills', 'beach'];
const continentSettings = () => ({ ...Object.fromEntries(Object.keys(CONTINENT_SHARES).map(k => [k, GAME_CONFIG.continent[k]])), startCoast: GAME_CONFIG.continent.startCoast, grow: GAME_CONFIG.continent.grow });
export const STANDARD_CONTINENT_SETTINGS = JSON.parse(JSON.stringify(continentSettings()));
// GAME_CONFIG.map's a continent uses, in groups (the rest were the small maps' own, 27.10, 18)
/** @type {[string, string[]][]} */
export const GENERATOR_GROUPS = [
  ['ore', ['ironSpawners', 'coalSpawners', 'orePerSpawner', 'oreSpawnerRadius']],
  ['regrowth', ['respawnDelay', 'oreRespawnDelay']]
];

// A typed-in number, kept sensible: never negative, a whole number
export function cleanValue(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

export function renderGeneratorFields() {
  const container = document.getElementById('generator-fields');
  container.innerHTML = '';
  renderContinentFields(container);
  for (const [group, keys] of GENERATOR_GROUPS) {
    // each group: a heading, then its fields two to a row
    const heading = document.createElement('h3');
    heading.textContent = t(`gen.group.${group}`);
    const grid = document.createElement('div');
    grid.className = 'generator-grid';
    for (const key of keys.filter(k => k in GAME_CONFIG.map)) grid.appendChild(generatorField(key));
    container.append(heading, grid);
  }
}

// (#326) The continent's: the sea round the land and the base's distance from it, the biomes' shares of the land, and what
// grows on each biome (as a share of its tiles), each a percent
function renderContinentFields(container) {
  const C = GAME_CONFIG.continent;
  const grid = (title, fields) => {
    const heading = document.createElement('h3'); heading.textContent = title;
    const box = document.createElement('div'); box.className = 'generator-grid';
    fields.forEach(f => box.appendChild(f));
    container.append(heading, box);
  };
  grid(t('gen.group.cland'), [
    percentField(t('gen.c.margin'), () => C.margin, v => { C.margin = v; }, CONTINENT_SHARES.margin),
    numberField(t('gen.c.startCoast'), () => C.startCoast, v => { C.startCoast = v; }, 40)
  ]);
  grid(t('gen.group.cbiomes'), ['mountains', 'desert', 'forest', 'lakes'].map(k => percentField(t(`gen.c.${k}`), () => C[k], v => { C[k] = v; }, CONTINENT_SHARES[k])));
  for (const biome of CONTINENT_BIOMES) {
    const table = C.grow[biome];
    grid(t(`gen.group.grow.${biome}`), Object.keys(table).map(kind => percentField(t(`gen.res.${kind}`), () => table[kind], v => {
      // (a tile grows one thing: the chances of a biome can't add up to more than all its tiles)
      const others = Object.entries(table).filter(([k]) => k !== kind).reduce((a, [, c]) => a + c, 0);
      table[kind] = Math.min(v, Math.max(0, 1 - others));
    }, 0.5, 0.1)));
  }
}

// A field of a share, shown and typed as a percent (the value kept as a share, 0..max)
function percentField(label, get, set, max, step = 1) {
  return labelledNumber(label, Math.round(get() * 1000) / 10, raw => { const n = Number(raw); if (!Number.isFinite(n)) return; set(Math.max(0, Math.min(max, n / 100))); rememberSettings(); renderGeneratorFields(); }, 0, Math.round(max * 100), step, '%');
}

// A field of a whole number
function numberField(label, get, set, max) {
  return labelledNumber(label, get(), raw => { const n = Number(raw); if (!Number.isFinite(n)) return; set(Math.max(0, Math.min(max, Math.round(n)))); rememberSettings(); renderGeneratorFields(); }, 0, max, 1, '');
}

function labelledNumber(label, value, onChange, min, max, step, unit) {
  const row = document.createElement('label');
  row.className = 'generator-field';
  const name = document.createElement('span'); name.textContent = label;
  const boxes = document.createElement('span');
  const input = document.createElement('input');
  input.type = 'number'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
  input.addEventListener('change', () => onChange(input.value));
  boxes.appendChild(input);
  if (unit) boxes.appendChild(document.createTextNode(` ${unit}`));
  row.append(name, boxes);
  return row;
}

// One labelled field: "from - to" for a range, a single box for a number
export function generatorField(key) {
  const row = document.createElement('label');
  row.className = 'generator-field';
  const name = document.createElement('span');
  name.textContent = t(`gen.${key}`);
  row.appendChild(name);
  const value = GAME_CONFIG.map[key];
  const boxes = document.createElement('span');
  const box = (current, onChange) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.value = current;
    input.dataset.key = key;
    input.addEventListener('change', () => {
      const clean = cleanValue(input.value);
      if (clean === null) { input.value = current; return; }
      onChange(clean);
      rememberSettings();
      renderGeneratorFields(); // shows the value as kept (e.g. min raised to max)
    });
    return input;
  };
  if (typeof value === 'object') {
    boxes.appendChild(box(value.min, v => { value.min = v; if (value.max < v) value.max = v; }));
    boxes.appendChild(document.createTextNode(' – '));
    boxes.appendChild(box(value.max, v => { value.max = v; if (value.min > v) value.min = v; }));
  } else {
    boxes.appendChild(box(value, v => { GAME_CONFIG.map[key] = v; }));
  }
  row.appendChild(boxes);
  return row;
}

// ---- Presets

export function loadPresets() {
  return loadData('map-presets', {});
}

export function savePresets(presets) {
  saveData('map-presets', presets);
}

// A preset is { map, continent } (#326); one saved before is GAME_CONFIG.map's alone
export function currentSettings() {
  return JSON.parse(JSON.stringify({ map: GAME_CONFIG.map, continent: continentSettings() }));
}

function rememberSettings() {
  saveData('generator-settings', currentSettings());
}

export function applyMapSettings(settings) {
  const isBoth = !!(settings && settings.map && settings.continent);
  const map = isBoth ? settings.map : settings, continent = isBoth ? settings.continent : null;
  for (const key of Object.keys(GAME_CONFIG.map)) delete GAME_CONFIG.map[key];
  Object.assign(GAME_CONFIG.map, JSON.parse(JSON.stringify(STANDARD_MAP_SETTINGS)), JSON.parse(JSON.stringify(map)));
  // the continent's: the Standard first, then the preset's (a preset from before keeps the continent as it is: Standard)
  const wanted = JSON.parse(JSON.stringify(continent || STANDARD_CONTINENT_SETTINGS));
  for (const key of Object.keys(CONTINENT_SHARES)) GAME_CONFIG.continent[key] = wanted[key] ?? STANDARD_CONTINENT_SETTINGS[key];
  GAME_CONFIG.continent.startCoast = wanted.startCoast ?? STANDARD_CONTINENT_SETTINGS.startCoast;
  for (const biome of CONTINENT_BIOMES) {
    for (const kind of Object.keys(GAME_CONFIG.continent.grow[biome])) delete GAME_CONFIG.continent.grow[biome][kind];
    Object.assign(GAME_CONFIG.continent.grow[biome], JSON.parse(JSON.stringify(STANDARD_CONTINENT_SETTINGS.grow[biome])), (wanted.grow || {})[biome] || {});
  }
  renderGeneratorFields();
}

export function renderPresetList() {
  renderItemList(document.getElementById('preset-list'), Object.keys(loadPresets()).map(name => ({ id: name, label: name })), {
    attr: 'preset',
    onPick: name => { applyMapSettings(loadPresets()[name]); rememberSettings(); },
    onDelete: name => { const presets = loadPresets(); delete presets[name]; savePresets(presets); renderPresetList(); }
  });
}

// The screen, from Endless or the editor (27.10, 19): Back goes back there
export function openGenerator(from) {
  /** @type {HTMLElement} */ (document.querySelector('[data-screen="generator"] [data-back-to]')).dataset.backTo = from;
  renderGeneratorFields(); renderPresetList(); showMenuScreen('generator');
}

// What this file sets up as the game starts (called by app/boot.js)
export function initEndlessGenerator() {
  const saved = loadData('generator-settings', null);
  if (saved && typeof saved === 'object' && saved.map && saved.continent) applyMapSettings(saved);
  onTap(document.getElementById('open-generator'), () => openGenerator('endless'));
  document.querySelectorAll('#main-menu [data-back-to]').forEach(button => onTap(button, () => showMenuScreen(button.dataset.backTo)));
  onTap(document.getElementById('preset-standard'), () => {
    applyMapSettings({ map: STANDARD_MAP_SETTINGS, continent: STANDARD_CONTINENT_SETTINGS });
    rememberSettings();
  });
  onTap(document.getElementById('preset-save'), () => {
    const input = document.getElementById('preset-name');
    const name = input.value.trim();
    if (!name) return;
    const presets = loadPresets();
    presets[name] = currentSettings();
    savePresets(presets);
    input.value = '';
    renderPresetList();
  });
}
