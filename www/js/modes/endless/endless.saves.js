// Saving and loading Endless games: from the pause menu, a save of the whole game on the device (as many as
// there's room for); from the pause menu or the Endless menu, the saves to carry on from (or delete, or write
// to a file and read back, #326 30.10, 3). A save holds the world (every list in
// WORLD_LISTS), the stock, the clocks, the factions and the random sequence, so a loaded game goes on exactly
// as it would have.
//
// Things on the map point at each other (an archer at its tower, an order at its target, a builder's
// load at its blueprint...). Saved, such a pointer becomes { $ref: 'list:index' } (or '$hall'), and
// loading puts the real object back in its place.

import { escapeHtml, iconHtml, rebuildConfigHud, renderedFaction, richText, runLoading, setRichText, updateSeedHud } from '../../ui/index.js';
import { camera, clampCamera, deleteBig, getBig, loadData, onTap, putBig, saveData, t } from '../../engine/platform/index.js';
import { GAME_CONFIG } from '../../content/configs/index.js';
import { showMenuScreen } from '../menu/index.js';
import { createWorldSeed, game, resetTileIndex, setWorldSize, townHall, WORLD_LISTS } from '../../engine/world/index.js';
import { updateUnitCounts } from '../../domains/colony/settlers/index.js';
import { stock } from '../../domains/colony/storage/index.js';
import { sides } from '../../domains/factions/index.js';
import { setPaused } from '../../app/index.js';
import { exportFog, importFog } from '../../domains/world/index.js';
import { syncCards } from './endless.cards.js';
import { isInCamp, resetRaid } from './endless.raid.js';

// caches, worked out again after loading rather than saved
// (#298) and a raid's marks on its party: saved on the way, loaded they're home, the raid over
export const UNSAVED_FIELDS = new Set(['reachCache', 'reachUse', 'lastBehaviour', 'approachCache', 'raider', 'raidSpot', 'exitSpot', 'lastStep']);

export function loadSaves() {
  return loadData('saves', {});
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

// Its world (the seed) and wave, kept beside it (inside it, in one from before #299)
const seedOf = save => save.seed ?? (save.data && save.data.seed ? save.data.seed.value : undefined);
const waveOf = save => save.wave ?? (save.data && save.data.clocks ? save.data.clocks.waveNum : '');

export function storeSaves(saves) {
  return saveData('saves', saves);
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
  return {
    version: 1,
    world,
    stock: { ...stock },
    townHall: { x: townHall.x, y: townHall.y, hp: townHall.hp, maxHp: townHall.maxHp, repairRequested: townHall.repairRequested, store: { ...(townHall.store || {}) } },
    cols: game.COLS, rows: game.ROWS,
    clocks: { waveTimer: game.waveTimer, waveNum: game.waveNum, waveInterval: game.waveInterval, boarRespawnTimer: game.boarRespawnTimer, pathTick: game.pathTick },
    playerGear: { ...game.playerGear },
    armory: { ...game.armory },
    sides: JSON.parse(JSON.stringify(sides)),
    difficulty: game.gameDifficulty,
    cardMode: game.cardMode,
    seed: { value: game.worldSeed.value, state: game.worldSeed.getState() },
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    fog: exportFog() // (#299: what's been explored)
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

export function loadGame(data) {
  resetRaid(); // (#255)
  game.gameMode = 'endless';
  Object.assign(sides.player, data.sides.player);
  Object.assign(sides.enemy, data.sides.enemy);
  game.gameDifficulty = data.difficulty;
  game.cardMode = !!data.cardMode;
  setWorldSize(data.cols, data.rows);
  game.worldSeed = createWorldSeed(data.seed.value);
  game.worldSeed.setState(data.seed.state);
  for (const [list, value] of Object.entries(data.world)) game[list] = unpackList(value);
  if (!data.world.logs) game.logs = []; // (a save from before #298)
  if (!data.world.weather) game.weather = null; // (#308)
  for (const value of WORLD_LISTS.map(list => game[list])) resolveRefs(value);
  // older saves' archer kinds, gone (#249): a skeleton is a zombie with its bow, a fire imp an imp
  const goneKinds = { skeleton: 'zombie', fire_imp: 'imp' };
  for (const s of game.settlers) if (goneKinds[s.type]) s.type = goneKinds[s.type];
  const goneEnemies = { undead_skeleton: 'undead_zombie_archer', demon_fire_imp: 'demon_imp_archer' };
  for (const en of game.enemies) if (goneEnemies[en.enemyKey]) en.enemyKey = goneEnemies[en.enemyKey];
  Object.assign(townHall, { store: {} }, data.townHall); // (older saves: nothing in it, filled again from the stock)
  game.piles = game.piles || [];
  game.raidCamp = game.raidCamp || null; game.raidCampWave = game.raidCampWave || 0; game.scouts = game.scouts || []; game.scoutClock = game.scoutClock || 0; game.reliefZones = game.reliefZones || []; game.postZones = game.postZones || []; game.pathZones = game.pathZones || [];
  game.unlocked = game.unlocked || {}; game.cardsDue = game.cardsDue || 0; game.cardsWave = game.cardsWave || 0; game.cardOffer = game.cardOffer || null; // (older saves: no cards)
  for (const id of Object.keys(stock)) stock[id] = 0;
  Object.assign(stock, data.stock);
  ({ waveTimer: game.waveTimer, waveNum: game.waveNum, waveInterval: game.waveInterval, boarRespawnTimer: game.boarRespawnTimer, pathTick: game.pathTick } = data.clocks);
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
  updateUnitCounts();
  game.gameStarted = true;
  setPaused(false);
  syncCards(); // (an offer it was saved with shows again, #255)
  document.getElementById('main-menu').style.display = 'none';
}

// ---- (#326, 30.10, 3) As many saves as the device has room for, each its own (no slot a world any more): what's
// shown of it kept in the list (localStorage, small), its game in the device's database (putBig). Saved and loaded
// from screens of their own with the whole list; each can be written to a file and read back from one

// What's shown of a save: its world, wave, day, people, sides, difficulty, map size, when (and its name)
function saveInfo() {
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const seed = game.worldSeed.value;
  return {
    name: t('save.name', { world: seed, wave: game.waveNum, time: `${pad(now.getDate())}.${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}` }),
    savedAt: now.getTime(), seed, wave: game.waveNum, day: (game.nightId || 0) + 1,
    settlers: game.settlers.filter(s => !s.temporary && s.role !== 'pet').length, pets: game.settlers.filter(s => s.role === 'pet').length,
    faction: sides.player.faction, enemy: sides.enemy.faction, difficulty: game.gameDifficulty, cols: game.COLS, rows: game.ROWS
  };
}

// A new save (over: the key of one to write over), its game where there's room. Says how it went on its button
/** @param {string | null} [over] */
export function saveCurrentGame(over = null) {
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
  // (#298) with a party on its way to a camp or home it saves (the base is there; loaded, they're home);
  // in the camp itself, not: it says so, it used to do nothing at all
  if (isInCamp()) { flashSaveButton(t('save.inCamp'), false); return; }
  return saveNow(over).catch(e => { console.error(e); flashSaveButton(t('save.failed'), false); });
}

/** @param {string | null} over */
async function saveNow(over) {
  const body = await squeeze(serializeGame());
  const key = over || `save:${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const save = { ...saveInfo(), id: key, size: (body.z || JSON.stringify(body.data)).length };
  let inBig = true;
  try { await putBig(key, body); } catch (e) { inBig = false; } // (no database: in the list itself, as before)
  const saves = loadSaves();
  if (over && saves[over] && !saves[over].id) delete saves[over]; // (an old one written over: kept the new way)
  saves[key] = inBig ? save : { ...save, ...body };
  if (!storeSaves(saves)) { if (inBig) deleteBig(key).catch(() => {}); flashSaveButton(t('save.failed'), false); return; }
  flashSaveButton(t('save.done'), true);
  if (!document.getElementById('saves-screen').hidden) renderSavesScreen();
  return key;
}

// A save's game: in the list (one from before) or in the database
export async function saveDataOf(save) {
  if (save.data) return save.data;
  const body = save.z ? save : await getBig(save.id);
  if (!body) throw new Error('save missing');
  if (body.data) return body.data;
  const bytes = Uint8Array.from(atob(body.z), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// The newest save (of this world, if asked)
export function latestSave(seed = null) {
  return Object.values(loadSaves()).filter(s => seed === null || seedOf(s) === seed).sort((a, b) => b.savedAt - a.savedAt)[0] || null;
}

export function deleteSave(key) {
  const saves = loadSaves();
  delete saves[key];
  storeSaves(saves);
  deleteBig(key).catch(() => {});
}

// ---- Files

const FILE_KIND = 'sovereign-will-save';
// A save written to a file (a .swsave: its info and its game), downloaded, or shared where the device can
export async function exportSave(key) {
  const save = loadSaves()[key];
  if (!save) return false;
  const body = save.z || save.data ? { z: save.z, data: save.data } : await getBig(save.id);
  const { z, data, ...info } = save;
  const text = JSON.stringify({ kind: FILE_KIND, version: 1, info, body });
  const name = `${String(seedOf(save) || 'world').replace(/[^\w-]+/g, '_').slice(0, 40)}-wave${waveOf(save)}.swsave`;
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: save.name }); return true; } catch (e) { /* shared not: downloaded */ }
  }
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

// A save read from a file into the list (a new one, whatever it was called before). True if it was one
export async function importSave(file) {
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch (e) { parsed = null; }
  if (!parsed || parsed.kind !== FILE_KIND || !parsed.body || !(parsed.body.z || parsed.body.data)) { showSavesNote(t('save.importBad'), false); return false; }
  const key = `save:${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const info = { ...(parsed.info || {}), id: key };
  let inBig = true;
  try { await putBig(key, parsed.body); } catch (e) { inBig = false; }
  const saves = loadSaves();
  saves[key] = inBig ? info : { ...info, ...parsed.body };
  if (!storeSaves(saves)) { showSavesNote(t('save.failed'), false); return false; }
  showSavesNote(t('save.imported'), true);
  renderSavesScreen();
  return true;
}

// ---- On screen

// The save button (and the saves screen's own note) says how it went for a moment, then is itself again
/** @type {any} */
let flashTimer = null;
function flashSaveButton(text, ok) {
  showSavesNote(text, ok);
  const button = document.getElementById('save-game-button');
  setRichText(button, text);
  button.classList.toggle('save-ok', ok);
  button.classList.toggle('save-no', !ok);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { setRichText(button, t('save.button')); button.classList.remove('save-ok', 'save-no'); }, 2200);
}
/** @type {any} */
let noteTimer = null;
function showSavesNote(text, ok) {
  const note = document.getElementById('saves-note');
  if (!note) return;
  setRichText(note, text);
  note.className = `saves-note ${ok ? 'save-ok' : 'save-no'}`;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { note.textContent = ''; note.className = 'saves-note'; }, 2600);
}

// The saves screen: 'save' (from the pause menu: a new save, or written over one) or 'load' (from the pause menu or
// the Endless screen); 'from': where Back goes ('pause' or 'endless')
const screen = { mode: 'load', from: 'endless' };
export function openSavesScreen(mode, from) {
  screen.mode = mode; screen.from = from;
  const menu = document.getElementById('main-menu');
  if (from === 'pause') { document.getElementById('pause-menu').hidden = true; menu.style.display = ''; menu.dataset.fromPause = 'yes'; }
  showMenuScreen('saves');
  renderSavesScreen();
}

function closeSavesScreen() {
  const menu = document.getElementById('main-menu');
  if (menu.dataset.fromPause === 'yes') {
    delete menu.dataset.fromPause;
    menu.style.display = 'none';
    document.getElementById('pause-menu').hidden = false;
    showMenuScreen('home');
  } else { renderSaveList(); showMenuScreen('endless'); }
}

const pad = n => String(n).padStart(2, '0');
const when = at => { const d = new Date(at); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const factionIcon = id => (GAME_CONFIG.factions[id] ? { humans: 'worker', demons: 'imp', undead: 'zombie' }[id] || 'worker' : '');

// The list, newest first (this world's first when saving): each with its world, wave, day, people, sides, difficulty,
// map size and when; tapped, loaded (or, saving, written over: asked first); its buttons write it to a file or delete it
export function renderSavesScreen() {
  const saving = screen.mode === 'save' && game.gameStarted && game.gameMode === 'endless';
  document.getElementById('saves-title').textContent = t(saving ? 'save.screenSave' : 'save.screenLoad');
  document.getElementById('saves-new').hidden = !saving;
  const list = document.getElementById('saves-list');
  const here = game.worldSeed && game.worldSeed.value;
  const all = Object.entries(loadSaves()).sort((a, b) => (saving ? Number(seedOf(b[1]) === here) - Number(seedOf(a[1]) === here) : 0) || b[1].savedAt - a[1].savedAt);
  list.innerHTML = '';
  if (!all.length) {
    const empty = document.createElement('div');
    empty.className = 'item-list-empty';
    empty.textContent = t('save.none');
    list.appendChild(empty);
    return;
  }
  for (const [key, s] of all) {
    const row = document.createElement('div');
    row.className = 'save-row';
    const tile = document.createElement('button');
    tile.className = 'btn save-tile';
    tile.dataset.save = key;
    const info = [t('save.wave', { wave: waveOf(s) })];
    if (s.day) info.push(t('save.day', { n: s.day }));
    if (s.settlers !== undefined) info.push(t('save.people', { n: s.settlers }) + (s.pets ? ` + ${s.pets}[[dog]]` : ''));
    if (s.cols) info.push(`${s.cols}×${s.rows}`);
    if (s.difficulty) info.push(t(`menu.${s.difficulty}`));
    const sidesLine = s.faction ? `[[${factionIcon(s.faction)}]] ${GAME_CONFIG.factions[s.faction] ? GAME_CONFIG.factions[s.faction].label : ''} · [[swords]] ${GAME_CONFIG.factions[s.enemy] ? GAME_CONFIG.factions[s.enemy].label : ''}` : '';
    tile.innerHTML = `<span class="save-world"><b>${escapeHtml(t('save.world', { world: seedOf(s) ?? '' }))}</b> <small>${escapeHtml(when(s.savedAt))}</small></span>` +
      `<span class="save-info">${richText(info.join(' · '))}</span>` + (sidesLine ? `<span class="save-info">${richText(sidesLine)}</span>` : '');
    onTap(tile, () => (saving ? askThen(tile, () => saveCurrentGame(key)) : loadSave(key)));
    const actions = document.createElement('div');
    actions.className = 'save-actions';
    const fileBtn = document.createElement('button');
    fileBtn.className = 'btn tile-act save-export';
    fileBtn.dataset.exportSave = key;
    fileBtn.title = t('save.export');
    fileBtn.innerHTML = iconHtml('save');
    onTap(fileBtn, () => exportSave(key));
    const del = document.createElement('button');
    del.className = 'btn tile-act save-delete';
    del.dataset.deleteSave = key;
    del.setAttribute('aria-label', t('list.deleteQuestion', { name: s.name }));
    del.innerHTML = iconHtml('close');
    onTap(del, () => askThen(del, () => { deleteSave(key); renderSavesScreen(); }, true));
    actions.append(fileBtn, del);
    row.append(tile, actions);
    list.appendChild(row);
  }
}

// Asked first: the button turns into its question, tapped again it's done
function askThen(button, act, isDelete = false) {
  if (!button.classList.contains('asking')) {
    const was = button.innerHTML;
    button.classList.add('asking');
    if (isDelete) button.dataset.confirmDelete = button.dataset.deleteSave; else button.dataset.confirmOver = button.dataset.save;
    const label = t(isDelete ? 'save.deleteAsk' : 'save.overAsk');
    if (isDelete) button.textContent = label; else button.insertAdjacentHTML('beforeend', `<span class="save-ask">${escapeHtml(label)}</span>`);
    setTimeout(() => { if (button.isConnected && button.classList.contains('asking')) { button.classList.remove('asking'); delete button.dataset.confirmDelete; delete button.dataset.confirmOver; button.innerHTML = was; } }, 3000);
    return;
  }
  act();
}

async function loadSave(key) {
  const menu = document.getElementById('main-menu');
  delete menu.dataset.fromPause;
  let data;
  await runLoading('loading.save', (function* () { // (#326) a bar while it's read and set up
    yield 0.1;
    yield saveDataOf(loadSaves()[key]).then(read => { data = read; });
    yield 0.7;
    loadGame(data);
  })());
}

// The Endless screen's line: how many saves there are, its button opening the list
export function renderSaveList() {
  const n = Object.keys(loadSaves()).length;
  document.getElementById('save-settings').hidden = n === 0;
  setRichText(document.getElementById('open-saves'), t('save.openList', { n }));
}

// What this file sets up as the game starts (called by app/boot.js)
export function initEndlessSaves() {
  onTap(document.getElementById('save-game-button'), () => openSavesScreen('save', 'pause'));
  onTap(document.getElementById('load-game-button'), () => openSavesScreen('load', 'pause'));
  onTap(document.getElementById('mode-endless'), () => renderSaveList());
  onTap(document.getElementById('open-saves'), () => openSavesScreen('load', 'endless'));
  onTap(document.getElementById('saves-back'), closeSavesScreen);
  onTap(document.getElementById('saves-new'), () => saveCurrentGame());
  const input = /** @type {HTMLInputElement} */ (document.getElementById('saves-import-file'));
  onTap(document.getElementById('saves-import'), () => input.click());
  input.addEventListener('change', async () => { const file = input.files && input.files[0]; input.value = ''; if (file) await importSave(file); });
}
