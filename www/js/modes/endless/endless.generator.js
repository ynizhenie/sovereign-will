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
const CONTINENT_SHARE_KEYS = ['margin', 'mountains', 'desert', 'savanna', 'forest', 'lakes'];
const MAX_CONTINENT_MARGIN = 0.3; // leave enough interior for the starting area
export const CONTINENT_BIOMES = ['grassland', 'forest', 'savanna', 'desert', 'foothills', 'beach'];
const continentSettings = () => ({ ...Object.fromEntries(CONTINENT_SHARE_KEYS.map(k => [k, GAME_CONFIG.continent[k]])), startCoast: GAME_CONFIG.continent.startCoast, grow: GAME_CONFIG.continent.grow });
export const STANDARD_CONTINENT_SETTINGS = JSON.parse(JSON.stringify(continentSettings()));
// GAME_CONFIG.map's a continent uses, in groups (the rest were the small maps' own, 27.10, 18)
/** @type {[string, string[]][]} */
export const GENERATOR_GROUPS = [
  ['ore', ['ironSpawners', 'coalSpawners', 'orePerSpawner', 'oreSpawnerRadius']],
  ['regrowth', ['respawnDelay', 'oreRespawnDelay']]
];

// The most each count may be: a typed number past it is set to it (any number went in, 1400000000000 too)
export const GENERATOR_MAX = { startCoast: 200, ironSpawners: 30, coalSpawners: 30, orePerSpawner: 50, oreSpawnerRadius: 20, respawnDelay: 3600, oreRespawnDelay: 3600 };

// A typed-in number, kept sensible: never negative, a whole number, no more than its key's top
export function cleanValue(raw, key = '') {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(GENERATOR_MAX[key] ?? Infinity, Math.max(0, Math.round(n))) : null;
}

// A group of fields as a card that folds (open, or shut, as it was left): its name the card's head
const cardsShut = new Set(['nature']);
/** @param {HTMLElement} container @param {string} id @param {string} title */
function card(container, id, title) {
  const box = document.createElement('details');
  box.className = 'gen-card';
  box.dataset.card = id;
  box.open = !cardsShut.has(id);
  box.addEventListener('toggle', () => { if (box.open) cardsShut.delete(id); else cardsShut.add(id); });
  const head = document.createElement('summary');
  head.className = 'gen-card-head';
  head.textContent = title;
  box.appendChild(head);
  container.appendChild(box);
  return box;
}
/** @param {HTMLElement} box @param {HTMLElement[]} fields @param {string} [title] */
function grid(box, fields, title) {
  if (title) { const heading = document.createElement('h3'); heading.textContent = title; box.appendChild(heading); }
  const g = document.createElement('div'); g.className = 'generator-grid';
  fields.forEach(f => g.appendChild(f));
  box.appendChild(g);
}

export function renderGeneratorFields() {
  const container = document.getElementById('generator-fields');
  container.innerHTML = '';
  renderContinentFields(container);
  for (const [group, keys] of GENERATOR_GROUPS) {
    grid(card(container, group, t(`gen.group.${group}`)), keys.filter(k => k in GAME_CONFIG.map).map(generatorField));
  }
  updatePresetSelection();
}

// (#326) The continent's: the sea round the land and the base's distance from it, the biomes' shares of the land, and what
// grows on each biome (as a share of its tiles), each a percent; what grows in one card, Nature, a heading a biome
function renderContinentFields(container) {
  const C = GAME_CONFIG.continent;
  grid(card(container, 'land', t('gen.group.cland')), [
    percentField(t('gen.c.margin'), () => C.margin, v => { C.margin = v; }, MAX_CONTINENT_MARGIN),
    numberField(t('gen.c.startCoast'), () => C.startCoast, v => { C.startCoast = v; }, GENERATOR_MAX.startCoast)
  ]);
  grid(card(container, 'biomes', t('gen.group.cbiomes')), ['mountains', 'desert', 'savanna', 'forest', 'lakes'].map(k =>
    percentField(t(`gen.c.${k}`), () => C[k], v => { C[k] = v; })));
  const nature = card(container, 'nature', t('gen.group.nature'));
  for (const biome of CONTINENT_BIOMES) {
    const table = C.grow[biome];
    grid(nature, Object.keys(table).map(kind => {
      const others = Object.entries(table).filter(([k]) => k !== kind).reduce((a, [, c]) => a + c, 0);
      const remaining = Math.max(0, 1 - others);
      return percentField(t(`gen.res.${kind}`), () => table[kind], v => { table[kind] = v; }, remaining, '0.1');
    }), t(`gen.group.grow.${biome}`));
  }
}

// A field of a share, shown and typed as a percent (the value kept as a share, 0..max)
function percentField(label, get, set, max = 1, step = 'any') {
  return labelledNumber(label, Math.round(get() * 1000) / 10, raw => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    set(Math.max(0, Math.min(max, n / 100)));
    rememberSettings();
    renderGeneratorFields();
  }, 0, Math.round(max * 100), step, '%');
}

// A field of a whole number, up to max
function numberField(label, get, set, max) {
  return labelledNumber(label, get(), raw => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    set(Math.min(max, Math.max(0, Math.round(n))));
    rememberSettings();
    renderGeneratorFields();
  }, 0, max, 1, '');
}

function labelledNumber(label, value, onChange, min, max, step, unit) {
  const row = document.createElement('label');
  row.className = 'generator-field';
  const name = document.createElement('span'); name.textContent = label;
  const boxes = document.createElement('span');
  const input = document.createElement('input');
  // (a share: a slider with its value beside it; a count of tiles or a time: a number to type, no top to it)
  input.type = unit === '%' && max !== null ? 'range' : 'number';
  if (min !== null) input.min = String(min);
  if (max !== null) input.max = String(max);
  input.step = String(step === 'any' ? 0.5 : step);
  input.value = String(value);
  input.addEventListener('change', () => onChange(input.value));
  boxes.appendChild(input);
  if (input.type === 'range') {
    const shown = document.createElement('i');
    shown.className = 'gen-value';
    const show = () => { shown.textContent = `${input.value}%`; input.style.setProperty('--fill', `${max ? (Number(input.value) / max) * 100 : 0}%`); };
    input.addEventListener('input', show);
    show();
    boxes.appendChild(shown);
  } else if (unit) boxes.appendChild(document.createTextNode(` ${unit}`));
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
    if (GENERATOR_MAX[key]) input.max = String(GENERATOR_MAX[key]);
    input.step = '1';
    input.value = current;
    input.dataset.key = key;
    input.addEventListener('change', () => {
      const clean = cleanValue(input.value, key);
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

function settingsMatch(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aKeys = Object.keys(a).sort(), bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length && aKeys.every((key, index) =>
    key === bKeys[index] && settingsMatch(a[key], b[key]));
}

function completePresetSettings(settings) {
  const value = settings && typeof settings === 'object' ? settings : {};
  if (value.map && value.continent) {
    return {
      map: { ...STANDARD_MAP_SETTINGS, ...value.map },
      continent: { ...STANDARD_CONTINENT_SETTINGS, ...value.continent }
    };
  }
  return {
    map: { ...STANDARD_MAP_SETTINGS, ...value },
    continent: STANDARD_CONTINENT_SETTINGS
  };
}

function currentPreset() {
  const current = currentSettings();
  if (settingsMatch(current, { map: STANDARD_MAP_SETTINGS, continent: STANDARD_CONTINENT_SETTINGS })) return { kind: 'standard' };
  const presets = loadPresets();
  const name = Object.keys(presets).find(key => settingsMatch(current, completePresetSettings(presets[key])));
  return name ? { kind: 'saved', name } : null;
}

function updatePresetSelection() {
  const selected = currentPreset();
  const standardButton = document.getElementById('preset-standard');
  const standardIsSelected = selected?.kind === 'standard';
  standardButton.classList.toggle('active', standardIsSelected);
  standardButton.setAttribute('aria-pressed', String(standardIsSelected));
  document.querySelectorAll('#preset-list [data-preset]').forEach(button => {
    const isSelected = selected?.kind === 'saved' && button.dataset.preset === selected.name;
    button.classList.toggle('active', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });
  // (on the button: the chosen one's name, or Custom when what's set is none of them)
  document.getElementById('preset-pick-name').textContent = !selected ? t('gen.custom') : selected.kind === 'standard' ? t('gen.standard') : selected.name;
  // (what's set is a preset already: nothing new to keep)
  /** @type {HTMLButtonElement} */ (document.getElementById('preset-save')).disabled = !!selected;
}

/** @param {boolean} open */
function setPresetMenu(open) {
  document.getElementById('preset-menu').hidden = !open;
  document.getElementById('preset-pick').setAttribute('aria-expanded', String(open));
}

export function applyMapSettings(settings) {
  const isBoth = !!(settings && settings.map && settings.continent);
  const map = isBoth ? settings.map : settings, continent = isBoth ? settings.continent : null;
  for (const key of Object.keys(GAME_CONFIG.map)) delete GAME_CONFIG.map[key];
  Object.assign(GAME_CONFIG.map, JSON.parse(JSON.stringify(STANDARD_MAP_SETTINGS)), JSON.parse(JSON.stringify(map)));
  // the continent's: the Standard first, then the preset's (a preset from before keeps the continent as it is: Standard)
  const wanted = JSON.parse(JSON.stringify(continent || STANDARD_CONTINENT_SETTINGS));
  for (const key of CONTINENT_SHARE_KEYS) GAME_CONFIG.continent[key] = wanted[key] ?? STANDARD_CONTINENT_SETTINGS[key];
  GAME_CONFIG.continent.startCoast = wanted.startCoast ?? STANDARD_CONTINENT_SETTINGS.startCoast;
  for (const biome of CONTINENT_BIOMES) {
    for (const kind of Object.keys(GAME_CONFIG.continent.grow[biome])) delete GAME_CONFIG.continent.grow[biome][kind];
    Object.assign(GAME_CONFIG.continent.grow[biome], JSON.parse(JSON.stringify(STANDARD_CONTINENT_SETTINGS.grow[biome])), (wanted.grow || {})[biome] || {});
  }
  renderGeneratorFields();
}

export function renderPresetList() {
  const selected = currentPreset();
  renderItemList(document.getElementById('preset-list'), Object.keys(loadPresets()).map(name => ({ id: name, label: name })), {
    attr: 'preset',
    selected: selected?.kind === 'saved' ? selected.name : undefined,
    onPick: name => {
      applyMapSettings(loadPresets()[name]);
      rememberSettings();
      renderPresetList();
      setPresetMenu(false);
    },
    onDelete: name => { const presets = loadPresets(); delete presets[name]; savePresets(presets); renderPresetList(); }
  });
  updatePresetSelection();
}

// The screen, from Endless or the editor (27.10, 19): Back goes back there
export function openGenerator(from) {
  /** @type {HTMLElement} */ (document.querySelector('[data-screen="generator"] [data-back-to]')).dataset.backTo = from;
  // (from the editor, where the switch is the Island's: the island's settings)
  const title = /** @type {HTMLElement} */ (document.querySelector('[data-screen="generator"] h1'));
  title.dataset.i18n = from === 'editor' ? 'gen.islandTitle' : 'menu.generator';
  title.textContent = t(title.dataset.i18n);
  setPresetMenu(false); renderGeneratorFields(); renderPresetList(); showMenuScreen('generator');
}

// What this file sets up as the game starts (called by app/boot.js)
export function initEndlessGenerator() {
  const saved = loadData('generator-settings', null);
  if (saved && typeof saved === 'object' && saved.map && saved.continent) applyMapSettings(saved);
  onTap(document.getElementById('open-generator'), () => openGenerator('endless'));
  document.querySelectorAll('#main-menu [data-back-to]').forEach(button => onTap(button, () => showMenuScreen(button.dataset.backTo)));
  onTap(document.getElementById('preset-pick'), () => setPresetMenu(document.getElementById('preset-menu').hidden));
  // (a tap anywhere else puts the list away)
  document.addEventListener('pointerdown', e => {
    const target = /** @type {Element} */ (e.target);
    if (!document.getElementById('preset-menu').hidden && !target.closest?.('.preset-pick-wrap')) setPresetMenu(false);
  });
  onTap(document.getElementById('preset-standard'), () => {
    applyMapSettings({ map: STANDARD_MAP_SETTINGS, continent: STANDARD_CONTINENT_SETTINGS });
    rememberSettings();
    setPresetMenu(false);
  });
  // Save: what's set kept as a new preset, named the next free "Preset N"
  onTap(document.getElementById('preset-save'), () => {
    if (currentPreset()) { updatePresetSelection(); return; }
    const presets = loadPresets();
    let n = 1;
    while (Object.prototype.hasOwnProperty.call(presets, t('gen.presetN', { n }))) n++;
    presets[t('gen.presetN', { n })] = currentSettings();
    savePresets(presets);
    renderPresetList();
  });
}
