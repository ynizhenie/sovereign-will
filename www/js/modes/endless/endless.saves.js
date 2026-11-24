// Saving and loading Endless games: from the pause menu, a save of the whole game on the device;
// from the Endless menu, the saves to carry on from (or delete). A save holds the world (every list in
// WORLD_LISTS), the stock, the clocks, the factions and the random sequence, so a loaded game goes on exactly
// as it would have.
//
// Things on the map point at each other (an archer at its tower, an order at its target, a builder's
// load at its blueprint...). Saved, such a pointer becomes { $ref: 'list:index' } (or '$hall'), and
// loading puts the real object back in its place.

import { escapeHtml, iconHtml, rebuildConfigHud, renderedFaction, runLoading, setRichText, updateSeedHud } from '../../ui/index.js';
import { camera, clampCamera, exportFile, loadData, onTap, saveData, t } from '../../engine/platform/index.js';
import { createWorldSeed, game, resetTileIndex, setWorldSize, townHall, WORLD_LISTS } from '../../engine/world/index.js';
import { stock } from '../../domains/colony/storage/index.js';
import { sides } from '../../domains/factions/index.js';
import { setPaused } from '../../app/index.js';
import { exportFog, importFog, prewarmVisibleWorldChunks } from '../../domains/world/index.js';
import { showMenuScreen } from '../menu/index.js';
import { exitPlagueMode, preparePlagueSaveLoad, restorePlagueSaveState } from '../plague/index.js';
import { syncCards } from './endless.cards.js';
import { isInCamp, normalizeEnemyCamp, resetRaid } from './endless.raid.js';

// caches, worked out again after loading rather than saved
// (#298) and a raid's marks on its party: saved on the way, loaded they're home, the raid over
export const UNSAVED_FIELDS = new Set(['reachCache', 'reachUse', 'lastBehaviour', 'approachCache', 'raider', 'raidSpot', 'exitSpot', 'lastStep']);

/** @typedef {'endless' | 'plague'} SaveMode */
/** @type {Record<SaveMode, string | null>} */
const activeSaveKeys = { endless: null, plague: null };
/** @type {SaveMode} */
let saveManagerMode = 'endless';

/** @param {SaveMode} [mode] */
export function loadSaves(mode = 'endless') {
  return loadData(mode === 'plague' ? 'plagueSaves' : 'saves', {});
}

// (#299) A save squeezed (gzip, kept as text), with its world and wave beside it for the list: a big map's
// filled the device's room for saves in one or two. Where squeezing can't be done, as it was
async function squeeze(data) {
  const json = JSON.stringify(data);
  if (typeof CompressionStream === 'undefined') return { data };
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { z: btoa(text) };
}

// A save's game, squeezed or not
export async function saveDataOf(save) {
  if (save.data) return save.data;
  const bytes = Uint8Array.from(atob(save.z), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// Its world (the seed) and wave, kept beside it (inside it, in one from before #299)
const seedOf = save => save.seed ?? (save.data && save.data.seed ? save.data.seed.value : undefined);
const waveOf = save => save.wave ?? (save.data && save.data.clocks ? save.data.clocks.waveNum : '');

/** @param {Record<string, any>} saves @param {SaveMode} [mode] */
export function storeSaves(saves, mode = 'endless') {
  return saveData(mode === 'plague' ? 'plagueSaves' : 'saves', saves);
}

export function serializeGame() {
  const refs = new Map([[townHall, '$hall']]);
  for (const [list, value] of WORLD_LISTS.map(list => [list, game[list]])) {
    if (Array.isArray(value)) value.forEach((o, i) => { if (o && typeof o === 'object') refs.set(o, `${list}:${i}`); });
  }
  // an object as plain data: what it points at as references, itself (the root) in full. (#298) A loop
  // through things no longer on the map (a fallen settler and the fallen enemy each remembering the other,
  // one still alive remembering one of them) is cut there: JSON threw on it and the save silently failed
  const encode = (value, root = true, path = new Set()) => {
    if (value === null || value === undefined) return value === null ? null : undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'object') return typeof value === 'function' ? undefined : value;
    if (!root && refs.has(value)) return { $ref: refs.get(value) };
    if (path.has(value)) return null;
    path.add(value);
    let out;
    if (Array.isArray(value)) out = value.map(v => { const e = encode(v, false, path); return e === undefined ? null : e; });
    else {
      out = {};
      for (const [k, v] of Object.entries(value)) {
        if (UNSAVED_FIELDS.has(k)) continue;
        const e = encode(v, false, path);
        if (e !== undefined) out[k] = e;
      }
    }
    path.delete(value);
    return out;
  };
  const world = {};
  for (const [list, value] of WORLD_LISTS.map(list => [list, game[list]])) world[list] = Array.isArray(value) ? packList(value.map(o => encode(o))) : encode(value);
  world.enemyCampCount = game.enemyCampCount;
  world.fogEnabled = game.fogEnabled;
  world.raidCampId = game.raidCampId;
  return {
    version: 1,
    mode: game.plagueMode ? 'plague' : 'endless',
    world,
    stock: { ...stock },
    townHall: { x: townHall.x, y: townHall.y, hp: townHall.hp, maxHp: townHall.maxHp, repairRequested: townHall.repairRequested, store: { ...(townHall.store || {}) } },
    cols: game.COLS, rows: game.ROWS,
    clocks: { waveTimer: game.waveTimer, waveNum: game.waveNum, waveInterval: game.waveInterval, boarRespawnTimer: game.boarRespawnTimer, territoryBoarRespawnsPending: game.territoryBoarRespawnsPending, pathTick: game.pathTick },
    playerGear: { ...game.playerGear },
    armory: { ...game.armory },
    sides: JSON.parse(JSON.stringify(sides)),
    playerFaction: sides.player.faction,
    difficulty: game.gameDifficulty,
    cardMode: game.cardMode,
    seed: { value: game.worldSeed.value, state: game.worldSeed.getState() },
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    fog: exportFog(), // (#299: what's been explored)
    plague: game.plagueMode ? encode(game.plague) : null
  };
}

// (#299) A long list of things alike (a big map's tens of thousands of rock and water tiles), each of
// numbers, words and yes/no only, saved as its fields' names once and each thing's values in a row: the
// names over and over were most of a save, too big for the device's room on a 512 map
const PACK_FROM = 64;
function packList(list) {
  if (list.length < PACK_FROM) return list;
  const cols = [], at = new Map();
  for (const o of list) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.$ref) return list;
    for (const [k, v] of Object.entries(o)) {
      if (v === null || typeof v === 'object') return list;
      if (!at.has(k)) { at.set(k, cols.length); cols.push(k); }
    }
  }
  // (a field a thing hasn't: 0 in its row, and its place in $none)
  const rows = list.map(o => cols.map(k => (k in o ? o[k] : 0)));
  const none = list.flatMap((o, i) => cols.filter(k => !(k in o)).map(k => [i, at.get(k)]));
  return { $cols: cols, $rows: rows, $none: none };
}

export function unpackList(value) {
  if (!value || !Array.isArray(value.$cols)) return value;
  const list = value.$rows.map(row => Object.fromEntries(value.$cols.map((k, j) => [k, row[j]])));
  for (const [i, j] of value.$none || []) delete list[i][value.$cols[j]];
  return list;
}

// Put every { $ref } back as the object it names
export function resolveRefs(root) {
  const lookup = ref => (ref === '$hall' ? townHall : game[ref.slice(0, ref.indexOf(':'))][Number(ref.slice(ref.indexOf(':') + 1))]);
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

/** @param {any} data @param {string | null} [saveKey] */
export function loadGame(data, saveKey = null) {
  resetRaid(); // (#255)
  const mode = data.mode === 'plague' ? 'plague' : 'endless';
  if (mode === 'plague') preparePlagueSaveLoad();
  else exitPlagueMode();
  game.gameMode = 'endless';
  Object.assign(sides.player, data.sides && data.sides.player);
  Object.assign(sides.enemy, data.sides && data.sides.enemy);
  game.rareAppearances = { pinkHair: false, demonSingleHorn: false, undeadCrossEyes: false };
  if (data.playerFaction) sides.player.faction = data.playerFaction;
  game.gameDifficulty = data.difficulty;
  game.cardMode = !!data.cardMode;
  setWorldSize(data.cols, data.rows);
  game.worldSeed = createWorldSeed(data.seed.value);
  game.worldSeed.setState(data.seed.state);
  for (const [list, value] of Object.entries(data.world)) game[list] = unpackList(value);
  if (!data.world.savannaTiles) game.savannaTiles = [];
  game.enemyCamps = game.enemyCamps || (game.enemyCamp ? [game.enemyCamp] : []);
  game.enemyCamp = game.enemyCamp || game.enemyCamps[0] || null;
  game.enemyCampCount = data.world.enemyCampCount ?? game.enemyCampCount ?? 1;
  game.fogEnabled = data.world.fogEnabled !== false;
  game.raidCampId = data.world.raidCampId ?? game.enemyCamps[0]?.id ?? null;
  if (!data.world.logs) game.logs = []; // (a save from before #298)
  if (!data.world.weather) game.weather = null; // (#308)
  for (const value of WORLD_LISTS.map(list => game[list])) resolveRefs(value);
  if (mode === 'plague') {
    game.plague = data.plague;
    resolveRefs(game.plague);
    restorePlagueSaveState(game.plague);
  }
  // older saves' archer kinds, gone (#249): a skeleton is a zombie with its bow, a fire imp an imp
  const goneKinds = { skeleton: 'zombie', fire_imp: 'imp' };
  for (const s of game.settlers) if (goneKinds[s.type]) s.type = goneKinds[s.type];
  const goneEnemies = { undead_skeleton: 'undead_zombie_archer', demon_fire_imp: 'demon_imp_archer' };
  for (const en of game.enemies) if (goneEnemies[en.enemyKey]) en.enemyKey = goneEnemies[en.enemyKey];
  Object.assign(townHall, { store: {} }, data.townHall); // (older saves: nothing in it, filled again from the stock)
  game.piles = game.piles || [];
  game.enemyCampDestroyed = game.enemyCamps.length === 0;
  game.enemyRafts = game.enemyRafts || []; game.wavePreparation = game.wavePreparation || null; game.raidActive = false;
  normalizeEnemyCamp();
  game.scouts = game.scouts || []; game.scoutClock = game.scoutClock || 0; game.reliefZones = game.reliefZones || []; game.postZones = game.postZones || []; game.pathZones = game.pathZones || [];
  game.unlocked = game.unlocked || {}; game.cardsDue = game.cardsDue || 0; game.cardsWave = game.cardsWave || 0; game.cardOffer = game.cardOffer || null; // (older saves: no cards)
  for (const id of Object.keys(stock)) stock[id] = 0;
  Object.assign(stock, data.stock);
  ({ waveTimer: game.waveTimer, waveNum: game.waveNum, waveInterval: game.waveInterval, boarRespawnTimer: game.boarRespawnTimer, territoryBoarRespawnsPending: game.territoryBoarRespawnsPending, pathTick: game.pathTick } = data.clocks);
  game.territoryBoarRespawnsPending = game.territoryBoarRespawnsPending || 0;
  game.playerGear = { armor: false, shield: false, ...data.playerGear }; // (older saves have none)
  game.armory = { ...data.armory };
  if (renderedFaction !== sides.player.faction) rebuildConfigHud();
  game.selectedSettler = null;
  game.defensePlan = null;
  resetTileIndex();
  importFog(data.fog); // (#299; a save from before: the start land seen)
  Object.assign(camera, data.camera);
  clampCamera();
  updateSeedHud();
  game.gameStarted = true;
  setPaused(false);
  syncCards(); // (an offer it was saved with shows again, #255)
  prewarmVisibleWorldChunks();
  activeSaveKeys[mode] = findActiveSaveKey(data, saveKey, mode);
  delete document.getElementById('main-menu').dataset.fromPause;
  document.getElementById('main-menu').style.display = 'none';
}

/** @param {any} data @param {string | null} requestedKey @param {SaveMode} mode */
function findActiveSaveKey(data, requestedKey, mode) {
  const saves = loadSaves(mode);
  if (requestedKey && saves[requestedKey]) return requestedKey;
  const seed = data.seed.value;
  const matching = Object.entries(saves).filter(([, save]) => seedOf(save) === seed);
  const matchingWave = matching.filter(([, save]) => waveOf(save) === data.clocks.waveNum);
  if (matchingWave.length === 1) return matchingWave[0][0];
  if (matching.length === 1) return matching[0][0];
  const legacyKey = `world:${seed}`;
  return saves[legacyKey] ? legacyKey : null;
}

/** @param {SaveMode} [mode] */
export function clearActiveSave(mode = 'endless') {
  activeSaveKeys[mode] = null;
}

/** @param {string} seed @param {SaveMode} [mode] */
export function selectActiveSaveForSeed(seed, mode = 'endless') {
  const matching = Object.entries(loadSaves(mode)).filter(([, save]) => seedOf(save) === seed);
  matching.sort((a, b) => b[1].savedAt - a[1].savedAt);
  activeSaveKeys[mode] = matching[0]?.[0] ?? null;
}

/** @param {SaveMode} mode */
function currentSaveKey(mode) {
  let key = activeSaveKeys[mode];
  if (!key || !loadSaves(mode)[key] || seedOf(loadSaves(mode)[key]) !== game.worldSeed.value) {
    selectActiveSaveForSeed(game.worldSeed.value, mode);
    key = activeSaveKeys[mode];
  }
  const save = key && loadSaves(mode)[key];
  return save && seedOf(save) === game.worldSeed.value ? key : null;
}

function openSaveMenuFromPause() {
  saveManagerMode = game.plagueMode ? 'plague' : 'endless';
  setSaveBackTarget(saveManagerMode);
  document.getElementById('pause-menu').hidden = true;
  const menu = document.getElementById('main-menu');
  menu.style.display = '';
  menu.dataset.fromPause = 'yes';
  showMenuScreen('saves');
  renderSaveList(saveManagerMode);
}

/** @param {SaveMode} mode */
function openSaveMenu(mode) {
  saveManagerMode = mode;
  setSaveBackTarget(mode);
  showMenuScreen('saves');
  renderSaveList(mode);
}

/** @param {SaveMode} mode */
function setSaveBackTarget(mode) {
  const back = document.querySelector('[data-screen="saves"] [data-back]');
  if (!back) throw new Error('The save menu back button is missing');
  back.dataset.backTo = mode;
}

// From the pause menu, overwrite the save loaded for this game, or create one if this is a new world.
export function saveCurrentGame() {
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
  const mode = game.plagueMode ? 'plague' : 'endless';
  // (#298) with a party on its way to a camp or home it saves (the base is there; loaded, they're home);
  // in the camp itself, not: it says so, it used to do nothing at all
  if (mode === 'endless' && isInCamp()) { flashSaveButton(t('save.inCamp'), false); return; }
  return saveNow(currentSaveKey(mode), mode).catch(e => { console.error(e); showSaveStatus(t('save.failed'), false); flashSaveButton(t('save.failed'), false); });
}

/** @param {string | null} overwriteKey @param {SaveMode} [mode] */
async function saveNow(overwriteKey, mode = game.plagueMode ? 'plague' : 'endless') {
  const now = new Date();
  const seed = game.worldSeed.value;
  const saves = loadSaves(mode);
  const targetKey = overwriteKey && saves[overwriteKey] ? overwriteKey : newSaveKey(saves, seed, now.getTime());
  const previous = saves[targetKey];
  const name = previous?.nameEdited ? previous.name : seed;
  const save = { name, nameEdited: !!previous?.nameEdited, savedAt: now.getTime(), seed, wave: game.waveNum, ...(await squeeze(serializeGame())) };
  saves[targetKey] = save;
  if (!storeSaves(saves, mode)) { showSaveStatus(t('save.failed'), false); flashSaveButton(t('save.failed'), false); return; }
  activeSaveKeys[mode] = targetKey;
  showSaveStatus(t('save.done'), true);
  flashSaveButton(t('save.done'), true);
  renderSaveList(mode);
}

function newSaveKey(saves, seed, savedAt) {
  const base = `world:${seed}`;
  if (!saves[base]) return base;
  let suffix = 0, key;
  do { key = `world:${seed}:${savedAt}${suffix ? `-${suffix}` : ''}`; suffix++; } while (saves[key]);
  return key;
}

function displayedName(save) {
  return save.nameEdited && save.name ? save.name : String(seedOf(save) ?? '');
}

function showSaveStatus(text, ok) {
  const status = document.getElementById('save-status');
  if (!status) return;
  setRichText(status, text);
  status.classList.toggle('save-ok', ok);
  status.classList.toggle('save-no', !ok);
}

// The save button says how the save went for a moment, then is itself again
/** @type {any} */
let flashTimer = null;
function flashSaveButton(text, ok) {
  const button = document.getElementById('save-game-button');
  setRichText(button, text);
  button.classList.toggle('save-ok', ok);
  button.classList.toggle('save-no', !ok);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { setRichText(button, t('save.button')); button.classList.remove('save-ok', 'save-no'); }, 2200);
}

// The saves as tiles, newest first: tap to load, rename, export or delete.
/** @param {SaveMode} [mode] */
export function renderSaveList(mode = saveManagerMode) {
  const all = Object.entries(loadSaves(mode)).sort((a, b) => b[1].savedAt - a[1].savedAt);
  const saves = all;
  updateSaveActions(mode);
  const list = document.getElementById('save-list');
  list.innerHTML = '';
  list.className = 'tile-grid save-tiles';
  if (!saves.length) {
    const empty = document.createElement('div');
    empty.className = 'item-list-empty';
    empty.textContent = t('save.none');
    list.appendChild(empty);
    return;
  }
  const pad = n => String(n).padStart(2, '0');
  for (const [key, s] of saves) {
    const wrap = document.createElement('div');
    wrap.className = `save-tile-wrap${key === activeSaveKeys[mode] ? ' current' : ''}`;
    const tile = document.createElement('button');
    tile.className = 'btn tile save-tile';
    tile.dataset.save = key;
    const at = new Date(s.savedAt);
    const name = displayedName(s);
    const wave = waveOf(s);
    tile.innerHTML = `<span class="tile-name"><b>${escapeHtml(name)}</b></span>` +
      `<span class="tile-cost">${escapeHtml(t('save.wave', { wave }))} · ${pad(at.getDate())}.${pad(at.getMonth() + 1)} ${pad(at.getHours())}:${pad(at.getMinutes())}</span>`;
    onTap(tile, async () => {
      let data;
      await runLoading('loading.save', (function* () { // (#326) a bar while it's read and set up
        yield 0.1;
        yield saveDataOf(loadSaves(mode)[key]).then(read => { data = read; });
        yield 0.7;
        loadGame(data, key);
      })());
    });
    const nameInput = document.createElement('input');
    nameInput.className = 'menu-number save-name-input';
    nameInput.type = 'text';
    nameInput.maxLength = 48;
    nameInput.value = name;
    nameInput.placeholder = t('save.namePlaceholder');
    nameInput.setAttribute('aria-label', t('save.rename'));
    nameInput.dataset.saveName = key;
    nameInput.addEventListener('change', () => renameSave(key, nameInput.value));
    const exportButton = document.createElement('button');
    exportButton.className = 'btn tile-act save-export';
    exportButton.dataset.exportSave = key;
    exportButton.textContent = t('save.export');
    onTap(exportButton, () => exportSave(key));
    const del = document.createElement('button');
    del.className = 'btn tile-act save-delete';
    del.dataset.deleteSave = key;
    del.setAttribute('aria-label', t('list.deleteQuestion', { name }));
    del.innerHTML = iconHtml('close');
    // asked first: the × turns into "Delete?", tapped again it's gone
    onTap(del, () => {
      if (!del.classList.contains('asking')) {
        del.classList.add('asking');
        del.dataset.confirmDelete = key;
        exportButton.hidden = true; // (the question in Export's place, as wide)
        del.textContent = t('save.deleteAsk');
        setTimeout(() => { if (del.isConnected) { del.classList.remove('asking'); delete del.dataset.confirmDelete; del.innerHTML = iconHtml('close'); exportButton.hidden = false; } }, 3000);
        return;
      }
      const left = loadSaves(mode); delete left[key];
      if (!storeSaves(left, mode)) { showSaveStatus(t('save.failed'), false); return; }
      if (activeSaveKeys[mode] === key) activeSaveKeys[mode] = null;
      renderSaveList(mode);
    });
    // (#420) laid out as the saved maps are: the tile, its name, then Export and the × side by side
    const actions = document.createElement('div');
    actions.className = 'save-map-actions';
    actions.append(exportButton, del);
    wrap.append(tile, nameInput, actions);
    list.appendChild(wrap);
  }
}

/** @param {SaveMode} mode */
function updateSaveActions(mode) {
  const actions = document.getElementById('save-actions');
  if (!actions) return;
  const fromPause = document.getElementById('main-menu').dataset.fromPause === 'yes';
  actions.hidden = !fromPause;
  const overwrite = document.getElementById('save-overwrite-button');
  overwrite.hidden = !fromPause || !currentSaveKey(mode);
}

function renameSave(key, value) {
  const saves = loadSaves(saveManagerMode), save = saves[key];
  if (!save) return;
  const seed = String(seedOf(save) ?? '');
  const name = value.trim().slice(0, 48) || seed;
  saves[key] = { ...save, name, nameEdited: name !== seed };
  if (!storeSaves(saves, saveManagerMode)) { showSaveStatus(t('save.failed'), false); return; }
  showSaveStatus(t('save.done'), true);
  renderSaveList(saveManagerMode);
}

async function exportSave(key) {
  const save = loadSaves(saveManagerMode)[key];
  if (!save) { showSaveStatus(t('save.exportFailed'), false); return; }
  const filename = [...displayedName(save)].map(char => {
    const code = char.charCodeAt(0);
    return code < 32 || '<>:"/\\|?*'.includes(char) ? '-' : char;
  }).join('').trim().slice(0, 64) || 'save';
  try {
    const exported = await exportFile(`${filename}.json`,
      JSON.stringify({ format: 'sovereign-will-save', version: 1, save }, null, 2));
    if (typeof exported === 'string') showSaveStatus(t('save.exportedTo', { path: exported }), true);
    else if (exported) showSaveStatus(t('save.exported'), true);
  } catch (error) {
    console.error('Could not export save', error);
    showSaveStatus(t('save.exportFailed'), false);
  }
}

function validGameData(data) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  return object(data) && data.version === 1 && (data.mode === undefined || data.mode === 'endless' || data.mode === 'plague') &&
    (data.mode !== 'plague' || object(data.plague)) && object(data.world) && object(data.stock) && object(data.townHall) &&
    object(data.clocks) && object(data.playerGear) && object(data.armory) && object(data.sides) &&
    object(data.sides.player) && object(data.sides.enemy) && object(data.camera) && object(data.seed) &&
    typeof data.seed.value === 'string' && Number.isFinite(data.seed.state) &&
    Number.isFinite(data.cols) && Number.isFinite(data.rows) &&
    Number.isFinite(data.clocks.waveNum) && Number.isFinite(data.townHall.x) && Number.isFinite(data.townHall.y) &&
    Number.isFinite(data.camera.x) && Number.isFinite(data.camera.y) && Number.isFinite(data.camera.zoom);
}

/** @param {File} file */
async function importSaveFile(file) {
  let envelope, data;
  try {
    envelope = JSON.parse(await file.text());
    if (envelope?.format !== 'sovereign-will-save' || envelope.version !== 1 || !envelope.save) throw new Error('Unsupported save file');
    data = await saveDataOf(envelope.save);
    if (!validGameData(data)) throw new Error('Invalid save data');
    if ((data.mode === 'plague' ? 'plague' : 'endless') !== saveManagerMode) throw new Error('Save belongs to a different game mode');
  } catch (error) {
    console.error('Could not import save file', error);
    showSaveStatus(t('save.importFailed'), false);
    return;
  }
  try {
    const saves = loadSaves(saveManagerMode), now = Date.now(), imported = envelope.save;
    const seed = data.seed.value;
    const key = newSaveKey(saves, seed, now);
    saves[key] = {
      name: imported.nameEdited ? String(imported.name || seed).slice(0, 48) : seed,
      nameEdited: !!imported.nameEdited,
      savedAt: Number.isFinite(imported.savedAt) ? imported.savedAt : now,
      seed,
      wave: Number.isFinite(imported.wave) ? imported.wave : data.clocks.waveNum,
      ...(await squeeze(data))
    };
    if (!storeSaves(saves, saveManagerMode)) { showSaveStatus(t('save.failed'), false); return; }
  } catch (error) {
    console.error('Could not store imported save', error);
    showSaveStatus(t('save.importFailed'), false);
    return;
  }
  showSaveStatus(t('save.imported'), true);
  renderSaveList(saveManagerMode);
}

// What this file sets up as the game starts (called by app/boot.js)
export function initEndlessSaves() {
  onTap(document.getElementById('save-game-button'), openSaveMenuFromPause);
  onTap(document.getElementById('save-overwrite-button'), () => {
    if (game.gameMode !== 'endless' || !game.gameStarted) return;
    if (!game.plagueMode && isInCamp()) { showSaveStatus(t('save.inCamp'), false); return; }
    return saveCurrentGame();
  });
  onTap(document.getElementById('save-new-button'), () => {
    if (game.gameMode !== 'endless' || !game.gameStarted) return;
    const mode = game.plagueMode ? 'plague' : 'endless';
    if (mode === 'endless' && isInCamp()) { showSaveStatus(t('save.inCamp'), false); return; }
    return saveNow(null, mode).catch(error => { console.error(error); showSaveStatus(t('save.failed'), false); });
  });
  onTap(document.getElementById('open-saves'), () => openSaveMenu('endless'));
  onTap(document.getElementById('plague-open-saves'), () => openSaveMenu('plague'));
  const importButton = document.getElementById('import-save-button');
  const importInput = /** @type {HTMLInputElement} */ (document.getElementById('import-save-file'));
  onTap(importButton, () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (file) importSaveFile(file);
  });
}
