// The editor's panel and its menu screen (new map, saved maps); its buttons

// ---- Panels

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { closeSheet, escapeHtml, iconHtml, showPlacing, toggleSheet } from '../../ui/index.js';
import { loadData, onTap, saveData, t } from '../../engine/platform/index.js';
import { game } from '../../engine/world/index.js';
import { setStartingWeather, timeOfPhase } from '../../domains/world/index.js';
import { showMenuScreen } from '../menu/index.js';
import { openGenerator, setMapSource } from '../endless/index.js';
import { initMapManager } from './editor.maps.js';
import { EDITOR_TOOLS, clearEditorMap, editor, redoEditor, saveEditorMap, startEditor, undoEditor } from './editor.tools.js';

export function renderEditorPanel() {
  const tools = document.getElementById('editor-tools');
  tools.innerHTML = '';
  let chosen = '';
  const shown = EDITOR_TOOLS.filter(tl => tl.category === editor.category);
  const landmarks = new Set(['town_hall', 'outpost']);
  const groups = editor.category === 'buildings'
    ? [
      { title: t('editor.section.hallAndOutpost'), section: '', tools: shown.filter(tl => landmarks.has(tl.id)) },
      { title: t('battle.buildingsCommon'), section: '', tools: shown.filter(tl =>
        !landmarks.has(tl.id) && (!tl.building || !getDefinition('buildings', tl.building).factions)) },
      ...Object.values(GAME_CONFIG.factions).filter(faction => faction.ready).map(faction => ({
        title: faction.label,
        section: '',
        tools: shown.filter(tl => tl.building && getDefinition('buildings', tl.building).factions?.includes(faction.id))
      }))
    ].filter(group => group.tools.length)
    : [...new Set(shown.map(tl => tl.section || ''))].map(section => ({
      title: '',
      section,
      tools: shown.filter(tl => (tl.section || '') === section)
    }));
  for (const group of groups) {
    if (editor.category === 'buildings' || groups.length > 1 || group.section) {
      const heading = document.createElement('div');
      heading.className = 'panel-heading';
      heading.textContent = group.title || t(`editor.section.${group.section}`);
      tools.appendChild(heading);
    }
    const grid = document.createElement('div');
    grid.className = 'tile-grid';
    for (const tool of group.tools) {
      const button = document.createElement('button');
      button.className = 'btn tile' + (editor.tool === tool.id ? ' active' : '');
      button.dataset.tool = tool.id;
      const label = tool.building ? getDefinition('buildings', tool.building).label : t(`editor.tool.${tool.id}`);
      button.innerHTML = `<span class="tile-name">${iconHtml(tool.icon)} <b>${escapeHtml(label)}</b></span>`;
      // picked: the sheet steps aside for the map, the chip says what a tap puts down
      onTap(button, () => { editor.tool = tool.id; closeSheet(); renderEditorPanel(); });
      grid.appendChild(button);
      if (editor.tool === tool.id) chosen = /** @type {HTMLElement} */ (button.querySelector('.tile-name')).innerHTML;
    }
    tools.appendChild(grid);
  }
  document.querySelectorAll('[data-brush]').forEach(b => b.classList.toggle('on', Number(b.dataset.brush) === editor.brush));
  document.querySelectorAll('[data-start-time]').forEach(b => b.classList.toggle('on', b.dataset.startTime === editor.startTime));
  document.querySelectorAll('[data-editor-weather]').forEach(b => b.classList.toggle('on', b.dataset.editorWeather === editor.weather));
  document.querySelectorAll('[data-hide-time-weather]').forEach(b =>
    b.classList.toggle('active', (b.dataset.hideTimeWeather === 'on') === editor.hideTimeAndWeather));
  document.getElementById('editor-erase').classList.toggle('active', editor.tool === 'erase');
  document.getElementById('editor-top-size').textContent = `${game.COLS}×${game.ROWS}`;
  updateEditorTitle();
  if (editor.tool === 'erase') chosen = document.getElementById('editor-erase').innerHTML;
  if (chosen) showPlacing(chosen);
  rememberEditorChoices();
}

// The top bar's middle: the map's name (as typed), or that it has none yet
export function updateEditorTitle() {
  const name = document.getElementById('editor-name').value.trim();
  document.getElementById('editor-map-label').textContent = name || t('editor.untitled');
}

export let editorNewSize = 192;
let editorUsesCustomSize = false;
const editorCustomSize = /** @type {HTMLElement} */ (document.getElementById('editor-map-custom'));
const editorMapCols = /** @type {HTMLInputElement} */ (document.getElementById('editor-map-cols'));
const editorMapRows = /** @type {HTMLInputElement} */ (document.getElementById('editor-map-rows'));
const EDITOR_DEFAULTS = { size: 192, custom: false, cols: 192, rows: 192, hallFaction: 'humans', startTime: 'morning', brush: 1, category: 'nature', tool: 'tree', hideTimeAndWeather: true };
const rememberEditorChoices = () => saveData('editor-choices', {
  size: editorNewSize,
  custom: editorUsesCustomSize,
  cols: editorMapCols.value,
  rows: editorMapRows.value,
  hallFaction: editor.hallFaction,
  startTime: editor.startTime,
  hideTimeAndWeather: editor.hideTimeAndWeather,
  brush: editor.brush,
  category: editor.category,
  tool: editor.tool
});
const editorDimensions = () => {
  if (!editorUsesCustomSize) return { cols: editorNewSize, rows: editorNewSize };
  const dimension = input => {
    const value = Math.round(Number(input.value));
    return Number.isFinite(value) ? Math.max(128, Math.min(512, value)) : 192;
  };
  return { cols: dimension(editorMapCols), rows: dimension(editorMapRows) };
};

function renderEditorHallFaction() {
  const picker = document.getElementById('editor-hall-faction');
  picker.innerHTML = '';
  for (const faction of Object.values(GAME_CONFIG.factions).filter(item => item.ready)) {
    const button = document.createElement('button');
    button.className = `faction-option${editor.hallFaction === faction.id ? ' active' : ''}`;
    button.dataset.hallFaction = faction.id;
    button.textContent = faction.label;
    button.title = faction.label;
    onTap(button, () => {
      editor.hallFaction = faction.id;
      rememberEditorChoices();
      renderEditorHallFaction();
    });
    picker.appendChild(button);
  }
}

// What this file sets up as the game starts (called by app/boot.js)
// A new map in the editor, the land generated or bare, at the size chosen
/** @param {boolean} generate */
export function newEditorMap(generate) { startEditor({ ...editorDimensions(), generate }); }

export function initEditorPanel() {
  const saved = loadData('editor-choices', EDITOR_DEFAULTS);
  editorNewSize = [128, 192, 256].includes(Number(saved.size)) ? Number(saved.size) : EDITOR_DEFAULTS.size;
  editorUsesCustomSize = !!saved.custom;
  editorMapCols.value = String(Math.max(128, Math.min(512, Number(saved.cols) || EDITOR_DEFAULTS.cols)));
  editorMapRows.value = String(Math.max(128, Math.min(512, Number(saved.rows) || EDITOR_DEFAULTS.rows)));
  const savedHallFaction = saved.hallFaction || saved.faction;
  editor.hallFaction = GAME_CONFIG.factions[savedHallFaction]?.ready ? savedHallFaction : EDITOR_DEFAULTS.hallFaction;
  editor.startTime = ['morning', 'day', 'evening', 'night'].includes(saved.startTime) ? saved.startTime : EDITOR_DEFAULTS.startTime;
  editor.hideTimeAndWeather = saved.hideTimeAndWeather !== false;
  game.editorHideTimeAndWeather = editor.hideTimeAndWeather;
  editor.brush = [1, 3, 5].includes(Number(saved.brush)) ? Number(saved.brush) : EDITOR_DEFAULTS.brush;
  editor.category = ['terrain', 'nature', 'buildings'].includes(saved.category) ? saved.category : EDITOR_DEFAULTS.category;
  editor.tool = EDITOR_TOOLS.some(tool => tool.id === saved.tool) ? saved.tool : EDITOR_DEFAULTS.tool;
  renderEditorHallFaction();
  editorCustomSize.hidden = !editorUsesCustomSize;
  document.querySelectorAll('[data-editor-size]').forEach(button => button.classList.toggle('active',
    button.dataset.editorSize === (editorUsesCustomSize ? 'custom' : String(editorNewSize))));
  document.querySelectorAll('[data-editor-size]').forEach(button => onTap(button, () => {
    editorUsesCustomSize = button.dataset.editorSize === 'custom';
    if (!editorUsesCustomSize) editorNewSize = Number(button.dataset.editorSize);
    editorCustomSize.hidden = !editorUsesCustomSize;
    document.querySelectorAll('[data-editor-size]').forEach(b => b.classList.toggle('active', b === button));
    rememberEditorChoices();
  }));
  [editorMapCols, editorMapRows].forEach(input => input.addEventListener('change', rememberEditorChoices));
  document.getElementById('mode-editor').disabled = false;
  onTap(document.getElementById('mode-editor'), () => showMenuScreen('editor-hub'));
  onTap(/** @type {HTMLElement} */ (document.getElementById('editor-open-new')), () => showMenuScreen('editor'));
  initMapManager({
    openEditor: map => startEditor({ map }),
    selectEndless: map => {
      game.customMap = map;
      setMapSource('custom');
      const choices = loadData('endlessChoices', {});
      choices.customMap = map.name;
      choices.mapSource = 'custom';
      saveData('endlessChoices', choices);
      showMenuScreen('endless');
    },
    selectedEndless: () => game.customMap?.name ?? null,
    changed: (oldName, newName, maps) => {
      if (oldName && game.customMap?.name === oldName) {
        game.customMap = newName ? maps[newName] : Object.values(maps)[0] || null;
        const choices = loadData('endlessChoices', {});
        choices.customMap = game.customMap?.name ?? null;
        if (!game.customMap) choices.mapSource = 'random';
        saveData('endlessChoices', choices);
        if (!game.customMap) setMapSource('random');
      }
    }
  });
  // a new map: one button, the land generated or not by the switch beside it (remembered)
  const markGenerate = () => document.querySelectorAll('[data-editor-generate]').forEach(b => b.classList.toggle('active', (/** @type {HTMLElement} */ (b).dataset.editorGenerate === 'on') === (loadData('editorGenerate', true) !== false)));
  markGenerate();
  document.querySelectorAll('[data-editor-generate]').forEach(b => onTap(/** @type {HTMLElement} */ (b), () => { saveData('editorGenerate', /** @type {HTMLElement} */ (b).dataset.editorGenerate === 'on'); markGenerate(); }));
  onTap(/** @type {HTMLElement} */ (document.getElementById('editor-new')), () => newEditorMap(loadData('editorGenerate', true) !== false));
  // (#326, 27.10, 19) the shared seed panel's generator settings
  onTap(document.getElementById('editor-open-generator'), () => openGenerator('editor'));
  onTap(document.getElementById('editor-save'), saveEditorMap);
  document.querySelectorAll('[data-brush]').forEach(button => onTap(button, () => { editor.brush = Number(button.dataset.brush); rememberEditorChoices(); renderEditorPanel(); }));
  // the dock: a category's sheet opens (again: closes); the eraser is picked at once
  document.querySelectorAll('[data-editor-category]').forEach(button => onTap(button, () => {
    editor.category = /** @type {string} */ (button.dataset.editorCategory);
    if (editor.tool !== 'erase') editor.tool = /** @type {{ id: string }} */ (EDITOR_TOOLS.find(tl => tl.category === editor.category)).id;
    rememberEditorChoices();
    renderEditorPanel();
    toggleSheet('editor', editor.category);
  }));
  onTap(document.getElementById('editor-erase'), () => { editor.tool = 'erase'; rememberEditorChoices(); closeSheet(); renderEditorPanel(); });
  document.getElementById('editor-name').addEventListener('input', updateEditorTitle);
  // (#255) undo, redo, play the map; clear it
  onTap(document.getElementById('editor-undo'), undoEditor);
  onTap(document.getElementById('editor-redo'), redoEditor);
  onTap(document.getElementById('editor-clear'), clearEditorMap);
  document.querySelectorAll('[data-start-time]').forEach(b => onTap(b, () => {
    editor.startTime = /** @type {string} */ (b.dataset.startTime);
    game.dayTime = timeOfPhase(editor.startTime);
    rememberEditorChoices();
    renderEditorPanel();
  })); // (#257)
  document.querySelectorAll('[data-editor-weather]').forEach(b => onTap(b, () => {
    editor.weather = /** @type {string} */ (b.dataset.editorWeather);
    setStartingWeather(editor.weather);
    rememberEditorChoices();
    renderEditorPanel();
  }));
  document.querySelectorAll('[data-hide-time-weather]').forEach(button => onTap(button, () => {
    editor.hideTimeAndWeather = button.dataset.hideTimeWeather === 'on';
    game.editorHideTimeAndWeather = editor.hideTimeAndWeather;
    rememberEditorChoices();
    renderEditorPanel();
  }));
}
