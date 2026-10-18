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

// caches, worked out again after loading rather than saved
export const UNSAVED_FIELDS = new Set(['reachCache', 'approachCache']);

export function loadSaves() {
  return loadData('saves', {});
}

export function storeSaves(saves) {
  return saveData('saves', saves);
}

export function serializeGame() {
  const refs = new Map([[townHall, '$hall']]);
  for (const [list, value] of WORLD_LISTS.map(list => [list, game[list]])) {
    if (Array.isArray(value)) value.forEach((o, i) => { if (o && typeof o === 'object') refs.set(o, `${list}:${i}`); });
  }
  // an object as plain data: what it points at as references, itself (the root) in full
  const encode = value => JSON.parse(JSON.stringify(value, function (key, v) {
    if (UNSAVED_FIELDS.has(key)) return undefined;
    if (key !== '' && v && typeof v === 'object' && refs.has(v)) return { $ref: refs.get(v) };
    return v;
  }));
  const world = {};
  for (const [list, value] of WORLD_LISTS.map(list => [list, game[list]])) world[list] = Array.isArray(value) ? value.map(encode) : encode(value);
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
    seed: { value: game.worldSeed.value, state: game.worldSeed.getState() },
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom }
  };
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
  game.gameMode = 'endless';
  Object.assign(sides.player, data.sides.player);
  Object.assign(sides.enemy, data.sides.enemy);
  game.gameDifficulty = data.difficulty;
  setWorldSize(data.cols, data.rows);
  game.worldSeed = createWorldSeed(data.seed.value);
  game.worldSeed.setState(data.seed.state);
  for (const [list, value] of Object.entries(data.world)) game[list] = value;
  for (const value of WORLD_LISTS.map(list => game[list])) resolveRefs(value);
  // older saves' archer kinds, gone (#249): a skeleton is a zombie with its bow, a fire imp an imp
  const goneKinds = { skeleton: 'zombie', fire_imp: 'imp' };
  for (const s of game.settlers) if (goneKinds[s.type]) s.type = goneKinds[s.type];
  const goneEnemies = { undead_skeleton: 'undead_zombie_archer', demon_fire_imp: 'demon_imp_archer' };
  for (const en of game.enemies) if (goneEnemies[en.enemyKey]) en.enemyKey = goneEnemies[en.enemyKey];
  Object.assign(townHall, { store: {} }, data.townHall); // (older saves: nothing in it, filled again from the stock)
  game.piles = game.piles || [];
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
  document.getElementById('main-menu').style.display = 'none';
}

// The most saves kept: one slot a world (#254)
export const SAVE_SLOTS = 10;

// From the pause menu: one slot a world (its seed), saved over each time; at most SAVE_SLOTS worlds. Says
// how it went on the save button itself, not in a notice the pause menu hides (#254)
export function saveCurrentGame() {
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const seed = game.worldSeed.value;
  const saves = loadSaves();
  // this world's slot (older saves of it, one per save, go into it)
  for (const [key, s] of Object.entries(saves)) if (s.data && s.data.seed && s.data.seed.value === seed) delete saves[key];
  if (Object.keys(saves).length >= SAVE_SLOTS) { flashSaveButton(t('save.full', { n: SAVE_SLOTS }), false); return; }
  const name = t('save.name', { world: seed, wave: game.waveNum, time: `${pad(now.getDate())}.${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}` });
  saves[`world:${seed}`] = { name, savedAt: now.getTime(), data: serializeGame() };
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
  const saves = thisWorld ? all.filter(([, s]) => s.data && s.data.seed && game.worldSeed && s.data.seed.value === game.worldSeed.value) : all;
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
    const d = s.data || {}, at = new Date(s.savedAt);
    const world = d.seed ? d.seed.value : '';
    const wave = d.clocks ? d.clocks.waveNum : '';
    tile.title = s.name;
    tile.innerHTML = `<span class="tile-name"><b>${escapeHtml(t('save.world', { world }))}</b></span>` +
      `<span class="tile-cost">${escapeHtml(t('save.wave', { wave }))} · ${pad(at.getDate())}.${pad(at.getMonth() + 1)} ${pad(at.getHours())}:${pad(at.getMinutes())}</span>`;
    onTap(tile, () => { document.getElementById('pause-load').hidden = true; loadGame(loadSaves()[key].data); });
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
