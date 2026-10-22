// Saving and loading Endless games: from the pause menu, a save of the whole game on the device;
// from the Endless menu, the saves to carry on from (or delete). A save holds the world (every list in
// WORLD_LISTS), the stock, the clocks, the factions and the random sequence, so a loaded game goes on exactly
// as it would have.
//
// Things on the map point at each other (an archer at its tower, an order at its target, a builder's
// load at its blueprint...). Saved, such a pointer becomes { $ref: 'list:index' } (or '$hall'), and
// loading puts the real object back in its place.

import { escapeHtml, iconHtml, rebuildConfigHud, renderedFaction, setRichText, updateSeedHud } from '../../ui/index.js';
import { camera, clampCamera, loadData, onTap, saveData, t } from '../../engine/platform/index.js';
import { WORLD_LISTS, createWorldSeed, game, resetTileIndex, setWorldSize, townHall } from '../../engine/world/index.js';
import { updateUnitCounts } from '../../domains/colony/settlers/index.js';
import { stock } from '../../domains/colony/storage/index.js';
import { sides } from '../../domains/factions/index.js';
import { setPaused } from '../../app/index.js';
import { syncCards } from './endless.cards.js';
import { isInCamp, resetRaid } from './endless.raid.js';

// caches, worked out again after loading rather than saved
// (#298) and a raid's marks on its party: saved on the way, loaded they're home, the raid over
export const UNSAVED_FIELDS = new Set(['reachCache', 'approachCache', 'raider', 'raidSpot', 'exitSpot', 'lastStep']);

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
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom }
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
  game.raidCamp = game.raidCamp || null; game.raidCampWave = game.raidCampWave || 0; game.scouts = game.scouts || []; game.scoutClock = game.scoutClock || 0; game.reliefZones = game.reliefZones || []; game.postZones = game.postZones || [];
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
  Object.assign(camera, data.camera);
  clampCamera();
  updateSeedHud();
  updateUnitCounts();
  game.gameStarted = true;
  setPaused(false);
  syncCards(); // (an offer it was saved with shows again, #255)
  document.getElementById('main-menu').style.display = 'none';
}

// The most saves kept: one slot a world (#254)
export const SAVE_SLOTS = 10;

// From the pause menu: one slot a world (its seed), saved over each time; at most SAVE_SLOTS worlds. Says
// how it went on the save button itself, not in a notice the pause menu hides (#254)
export function saveCurrentGame() {
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
  // (#298) with a party on its way to a camp or home it saves (the base is there; loaded, they're home);
  // in the camp itself, not: it says so, it used to do nothing at all
  if (isInCamp()) { flashSaveButton(t('save.inCamp'), false); return; }
  return saveNow().catch(e => { console.error(e); flashSaveButton(t('save.failed'), false); });
}

async function saveNow() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const seed = game.worldSeed.value;
  const name = t('save.name', { world: seed, wave: game.waveNum, time: `${pad(now.getDate())}.${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}` });
  const save = { name, savedAt: now.getTime(), seed, wave: game.waveNum, ...(await squeeze(serializeGame())) };
  const saves = loadSaves();
  // this world's slot (older saves of it, one per save, go into it)
  for (const [key, s] of Object.entries(saves)) if (seedOf(s) === seed) delete saves[key];
  if (Object.keys(saves).length >= SAVE_SLOTS) { flashSaveButton(t('save.full', { n: SAVE_SLOTS }), false); return; }
  saves[`world:${seed}`] = save;
  if (!storeSaves(saves)) { flashSaveButton(t('save.failed'), false); return; }
  flashSaveButton(t('save.done'), true);
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

// The saves as tiles, newest first (#254): its world in bold, its wave and when it was saved; tapped, it's
// loaded; its × deletes it, asked first. In the Endless menu all of them; in the pause menu's Load only this
// world's (its one slot)
export function renderSaveList(listId = 'save-list') {
  const all = Object.entries(loadSaves()).sort((a, b) => b[1].savedAt - a[1].savedAt);
  const thisWorld = listId !== 'save-list';
  const saves = thisWorld ? all.filter(([, s]) => game.worldSeed && seedOf(s) === game.worldSeed.value) : all;
  if (!thisWorld) document.getElementById('save-settings').hidden = saves.length === 0;
  const list = document.getElementById(listId);
  list.innerHTML = '';
  list.className = 'tile-grid save-tiles';
  if (!saves.length) {
    const empty = document.createElement('div');
    empty.className = 'item-list-empty';
    empty.textContent = t(thisWorld ? 'save.noneHere' : 'save.none');
    list.appendChild(empty);
    return;
  }
  const pad = n => String(n).padStart(2, '0');
  for (const [key, s] of saves) {
    const wrap = document.createElement('div');
    wrap.className = 'save-tile-wrap';
    const tile = document.createElement('button');
    tile.className = 'btn tile save-tile';
    tile.dataset.save = key;
    const at = new Date(s.savedAt);
    const world = seedOf(s) ?? '';
    const wave = waveOf(s);
    tile.title = s.name;
    tile.innerHTML = `<span class="tile-name"><b>${escapeHtml(t('save.world', { world }))}</b></span>` +
      `<span class="tile-cost">${escapeHtml(t('save.wave', { wave }))} · ${pad(at.getDate())}.${pad(at.getMonth() + 1)} ${pad(at.getHours())}:${pad(at.getMinutes())}</span>`;
    onTap(tile, async () => { document.getElementById('pause-load').hidden = true; loadGame(await saveDataOf(loadSaves()[key])); });
    const del = document.createElement('button');
    del.className = 'btn tile-act save-delete';
    del.dataset.deleteSave = key;
    del.title = t('list.deleteQuestion', { name: s.name });
    del.innerHTML = iconHtml('close');
    // asked first: the × turns into "Delete?", tapped again it's gone
    onTap(del, () => {
      if (!del.classList.contains('asking')) {
        del.classList.add('asking');
        del.dataset.confirmDelete = key;
        del.textContent = t('save.deleteAsk');
        setTimeout(() => { if (del.isConnected) { del.classList.remove('asking'); delete del.dataset.confirmDelete; del.innerHTML = iconHtml('close'); } }, 3000);
        return;
      }
      const left = loadSaves(); delete left[key]; storeSaves(left); renderSaveList(listId);
    });
    wrap.append(tile, del);
    list.appendChild(wrap);
  }
}

// What this file sets up as the game starts (called by app/boot.js)
export function initEndlessSaves() {
  onTap(document.getElementById('save-game-button'), saveCurrentGame);
  onTap(document.getElementById('mode-endless'), () => renderSaveList());
  // the pause menu's Load: the saves, under the button (#254)
  onTap(document.getElementById('load-game-button'), () => {
    const box = document.getElementById('pause-load');
    box.hidden = !box.hidden;
    if (!box.hidden) renderSaveList('pause-load-list');
  });
}
