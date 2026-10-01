// Map generator settings (#20): every GAME_CONFIG.map value on its own labelled field, a Standard preset
// and the player's own presets, saved on the device. The values go straight into GAME_CONFIG.map, which
// the next new game (resetGame -> generateMap) reads.

// The settings as the game ships them: the Standard preset
const STANDARD_MAP_SETTINGS = JSON.parse(JSON.stringify(GAME_CONFIG.map));
const PRESET_STORAGE_KEY = 'sovereign-will-map-presets';

// Fields in groups; a GAME_CONFIG.map value missing here still gets a field, under "other"
const GENERATOR_GROUPS = [
  ['water', ['lakes', 'lakeWidth', 'lakeHeight', 'lakeMinDistance']],
  ['desert', ['deserts', 'desertRadiusX', 'desertRadiusY', 'desertCactus', 'desertPebbles']],
  ['forests', ['forests', 'forestTrees', 'forestRadius', 'forestUndergrowthShare', 'trees']],
  ['resources', ['boulders', 'boulderPiles', 'boulderPileSize', 'grass', 'berryBushes', 'sticks', 'pebbles']],
  ['ore', ['ironSpawners', 'coalSpawners', 'orePerSpawner', 'oreSpawnerRadius']],
  ['rocks', ['rockClusters', 'rockClusterWidth', 'rockClusterHeight']],
  ['animals', ['boars']],
  ['regrowth', ['respawnDelay', 'oreRespawnDelay']]
];

function isShare(key) {
  return key === 'forestUndergrowthShare';
}

// A typed-in number, kept sensible: never negative, shares 0..1, whole numbers otherwise
function cleanValue(key, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return isShare(key) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.round(n));
}

function renderGeneratorFields() {
  const container = document.getElementById('generator-fields');
  container.innerHTML = '';
  const listed = new Set(GENERATOR_GROUPS.flatMap(([, keys]) => keys));
  const other = Object.keys(GAME_CONFIG.map).filter(key => !listed.has(key));
  for (const [group, keys] of [...GENERATOR_GROUPS, ...(other.length ? [['other', other]] : [])]) {
    const heading = document.createElement('h2');
    heading.textContent = t(`gen.group.${group}`);
    container.appendChild(heading);
    for (const key of keys.filter(k => k in GAME_CONFIG.map)) container.appendChild(generatorField(key));
  }
}

// One labelled field: "from - to" for a range, a single box for a number
function generatorField(key) {
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
    input.step = isShare(key) ? '0.05' : '1';
    input.value = current;
    input.dataset.key = key;
    input.addEventListener('change', () => {
      const clean = cleanValue(key, input.value);
      if (clean === null) { input.value = current; return; }
      onChange(clean);
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

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY)) || {}; } catch (e) { return {}; }
}

function savePresets(presets) {
  try { localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets)); } catch (e) { /* not remembered */ }
}

function applyMapSettings(settings) {
  for (const key of Object.keys(GAME_CONFIG.map)) delete GAME_CONFIG.map[key];
  Object.assign(GAME_CONFIG.map, JSON.parse(JSON.stringify(STANDARD_MAP_SETTINGS)), JSON.parse(JSON.stringify(settings)));
  renderGeneratorFields();
}

function renderPresetList() {
  const list = document.getElementById('preset-list');
  list.innerHTML = '';
  for (const name of Object.keys(loadPresets())) {
    const item = document.createElement('span');
    const load = document.createElement('button');
    load.className = 'fps-option';
    load.textContent = name;
    load.dataset.preset = name;
    onTap(load, () => applyMapSettings(loadPresets()[name]));
    const remove = document.createElement('button');
    remove.className = 'fps-option';
    remove.textContent = '✖';
    remove.dataset.deletePreset = name;
    onTap(remove, () => { const presets = loadPresets(); delete presets[name]; savePresets(presets); renderPresetList(); });
    item.append(load, remove);
    list.appendChild(item);
  }
}

onTap(document.getElementById('open-generator'), () => { renderGeneratorFields(); renderPresetList(); showMenuScreen('generator'); });
document.querySelectorAll('#main-menu [data-back-to]').forEach(button => onTap(button, () => showMenuScreen(button.dataset.backTo)));
onTap(document.getElementById('preset-standard'), () => applyMapSettings(STANDARD_MAP_SETTINGS));
onTap(document.getElementById('preset-save'), () => {
  const input = document.getElementById('preset-name');
  const name = input.value.trim();
  if (!name) return;
  const presets = loadPresets();
  presets[name] = JSON.parse(JSON.stringify(GAME_CONFIG.map));
  savePresets(presets);
  input.value = '';
  renderPresetList();
});
