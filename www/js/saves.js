// Saving and loading Endless games (#156): from the pause menu, a save of the whole game on the device;
// from the Endless menu, the saves to carry on from (or delete). A save holds the world (every list in
// WORLD), the stock, the clocks, the factions and the random sequence, so a loaded game goes on exactly
// as it would have.
//
// Things on the map point at each other (an archer at its tower, an order at its target, a builder's
// load at its blueprint...). Saved, such a pointer becomes { $ref: 'list:index' } (or '$hall'), and
// loading puts the real object back in its place.

const SAVE_STORAGE_KEY = 'sovereign-will-saves';
// caches, worked out again after loading rather than saved
const UNSAVED_FIELDS = new Set(['reachCache', 'approachCache']);

function loadSaves() {
  try { return JSON.parse(localStorage.getItem(SAVE_STORAGE_KEY)) || {}; } catch (e) { return {}; }
}

function storeSaves(saves) {
  try { localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saves)); return true; } catch (e) { return false; }
}

function serializeGame() {
  const refs = new Map([[townHall, '$hall']]);
  for (const [list, value] of Object.entries(WORLD)) {
    if (Array.isArray(value)) value.forEach((o, i) => { if (o && typeof o === 'object') refs.set(o, `${list}:${i}`); });
  }
  // an object as plain data: what it points at as references, itself (the root) in full
  const encode = value => JSON.parse(JSON.stringify(value, function (key, v) {
    if (UNSAVED_FIELDS.has(key)) return undefined;
    if (key !== '' && v && typeof v === 'object' && refs.has(v)) return { $ref: refs.get(v) };
    return v;
  }));
  const world = {};
  for (const [list, value] of Object.entries(WORLD)) world[list] = Array.isArray(value) ? value.map(encode) : encode(value);
  return {
    version: 1,
    world,
    stock: { ...stock },
    townHall: { x: townHall.x, y: townHall.y, hp: townHall.hp, maxHp: townHall.maxHp, repairRequested: townHall.repairRequested },
    cols: COLS, rows: ROWS,
    clocks: { waveTimer, waveNum, waveInterval, boarRespawnTimer, pathTick },
    sides: JSON.parse(JSON.stringify(sides)),
    difficulty: gameDifficulty,
    seed: { value: worldSeed.value, state: worldSeed.getState() },
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom }
  };
}

// Put every { $ref } back as the object it names
function resolveRefs(root) {
  const lookup = ref => (ref === '$hall' ? townHall : WORLD[ref.slice(0, ref.indexOf(':'))][Number(ref.slice(ref.indexOf(':') + 1))]);
  const seen = new Set();
  const walk = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const key of Object.keys(value)) {
      const v = value[key];
      if (v && typeof v === 'object' && typeof v.$ref === 'string') value[key] = lookup(v.$ref);
      else walk(v);
    }
  };
  walk(root);
}

function loadGame(data) {
  gameMode = 'endless';
  Object.assign(sides.player, data.sides.player);
  Object.assign(sides.enemy, data.sides.enemy);
  gameDifficulty = data.difficulty;
  setWorldSize(data.cols, data.rows);
  worldSeed = createWorldSeed(data.seed.value);
  worldSeed.setState(data.seed.state);
  for (const [list, value] of Object.entries(data.world)) WORLD[list] = value;
  for (const value of Object.values(WORLD)) resolveRefs(value);
  Object.assign(townHall, data.townHall);
  for (const id of Object.keys(stock)) stock[id] = 0;
  Object.assign(stock, data.stock);
  ({ waveTimer, waveNum, waveInterval, boarRespawnTimer, pathTick } = data.clocks);
  if (renderedFaction !== sides.player.faction) rebuildConfigHud();
  selectedSettler = null;
  defensePlan = null;
  resetTileIndex();
  Object.assign(camera, data.camera);
  clampCamera();
  updateSeedHud();
  updateUnitCounts();
  gameStarted = true;
  setPaused(false);
  document.getElementById('main-menu').style.display = 'none';
}

// From the pause menu: saved under the wave and the time, never over another save
function saveCurrentGame() {
  if (gameMode !== 'endless' || !gameStarted) return;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const name = t('save.name', { wave: waveNum, time: `${pad(now.getDate())}.${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}` });
  const saves = loadSaves();
  let unique = name;
  for (let n = 2; saves[unique]; n++) unique = `${name} (${n})`;
  saves[unique] = { name: unique, savedAt: now.getTime(), data: serializeGame() };
  if (!storeSaves(saves)) { showNotification(t('save.failed'), true); return; }
  showNotification(t('save.done', { name: unique }), false);
}

// The Endless menu's list of saves, newest first
function renderSaveList() {
  const saves = Object.values(loadSaves()).sort((a, b) => b.savedAt - a.savedAt);
  document.getElementById('save-settings').hidden = saves.length === 0;
  renderItemList(document.getElementById('save-list'), saves.map(s => ({ id: s.name, label: s.name })), {
    attr: 'save',
    onPick: name => loadGame(loadSaves()[name].data),
    onDelete: name => { const all = loadSaves(); delete all[name]; storeSaves(all); renderSaveList(); }
  });
}

onTap(document.getElementById('save-game-button'), saveCurrentGame);
onTap(document.getElementById('mode-endless'), renderSaveList);
