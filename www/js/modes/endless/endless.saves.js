// Saving and loading Endless games: from the pause menu, a save of the whole game on the device;
// from the Endless menu, the saves to carry on from (or delete). A save holds the world (every list in
// WORLD_LISTS), the stock, the clocks, the factions and the random sequence, so a loaded game goes on exactly
// as it would have.
//
// Things on the map point at each other (an archer at its tower, an order at its target, a builder's
// load at its blueprint...). Saved, such a pointer becomes { $ref: 'list:index' } (or '$hall'), and
// loading puts the real object back in its place.

import { rebuildConfigHud, renderItemList, renderedFaction, setRichText, updateSeedHud } from '../../ui/index.js';
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
    townHall: { x: townHall.x, y: townHall.y, hp: townHall.hp, maxHp: townHall.maxHp, repairRequested: townHall.repairRequested },
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
  Object.assign(townHall, data.townHall);
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

// A list of saves, newest first: in the Endless menu, and in the pause menu's Load (#254)
export function renderSaveList(listId = 'save-list') {
  const saves = Object.entries(loadSaves()).sort((a, b) => b[1].savedAt - a[1].savedAt);
  if (listId === 'save-list') document.getElementById('save-settings').hidden = saves.length === 0;
  renderItemList(document.getElementById(listId), saves.map(([key, s]) => ({ id: key, label: s.name })), {
    attr: 'save',
    emptyText: t('save.none'),
    onPick: key => { document.getElementById('pause-load').hidden = true; loadGame(loadSaves()[key].data); },
    onDelete: key => { const all = loadSaves(); delete all[key]; storeSaves(all); renderSaveList(listId); }
  });
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
