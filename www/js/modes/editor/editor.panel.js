// The editor's panel and its menu screen (new map, saved maps); its buttons

// ---- Panels

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { closeSheet, escapeHtml, iconHtml, setRichText, showPlacing, toggleSheet } from '../../ui/index.js';
import { loadData, onTap, saveData, setDragPainter, t } from '../../engine/platform/index.js';
import { game } from '../../engine/world/index.js';
import { showMenuScreen } from '../menu/index.js';
import { openGenerator } from '../endless/index.js';
import { loadSavedMaps, renderSavedMapList, storeSavedMaps } from './editor.maps.js';
import { EDITOR_TOOLS, clearEditorMap, editor, editorPaint, redoEditor, resizeEditorMap, saveEditorMap, startEditor, undoEditor } from './editor.tools.js';

export function renderEditorPanel() {
  const tools = document.getElementById('editor-tools');
  tools.innerHTML = '';
  let chosen = '';
  const forFaction = tl => !tl.building || !getDefinition('buildings', tl.building).factions || getDefinition('buildings', tl.building).factions.includes(editor.faction);
  // as Endless's (#255): the category's things as tiles, in sections
  const shown = EDITOR_TOOLS.filter(tl => tl.category === editor.category && forFaction(tl));
  const sections = [...new Set(shown.map(tl => tl.section || ''))];
  for (const section of sections) {
    if (sections.length > 1 || section) {
      const heading = document.createElement('div');
      heading.className = 'panel-heading';
      heading.textContent = t(`editor.section.${section}`);
      tools.appendChild(heading);
    }
    const grid = document.createElement('div');
    grid.className = 'tile-grid';
    for (const tool of shown.filter(tl => (tl.section || '') === section)) {
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
  document.getElementById('editor-drag').classList.toggle('on', editor.dragPaint);
  document.querySelectorAll('[data-start-time]').forEach(b => b.classList.toggle('on', b.dataset.startTime === editor.startTime));
  setRichText(document.getElementById('editor-hint'), t(editor.dragPaint ? 'editor.hintDrag' : 'editor.hint'));
  document.getElementById('editor-erase').classList.toggle('active', editor.tool === 'erase');
  document.getElementById('editor-size').textContent = `${game.COLS}×${game.ROWS}`;
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

// The editor menu's faction choice
export function renderEditorFaction() {
  const row = document.getElementById('editor-faction');
  row.innerHTML = '';
  for (const faction of Object.values(GAME_CONFIG.factions).filter(f => f.ready)) {
    const button = document.createElement('button');
    button.className = 'faction-option' + (editor.faction === faction.id ? ' active' : '');
    button.dataset.faction = faction.id;
    button.textContent = faction.label;
    onTap(button, () => { editor.faction = faction.id; rememberEditorChoices(); renderEditorFaction(); });
    row.appendChild(button);
  }
}

// The editor's menu screen: new map (size, empty or generated) and the saved maps to open or delete
export function renderEditorMapList() {
  renderEditorFaction();
  renderSavedMapList(document.getElementById('editor-map-list'), {
    open: map => startEditor({ map }),
    remove: name => { const maps = loadSavedMaps(); delete maps[name]; storeSavedMaps(maps); renderEditorMapList(); }
  });
}

export let editorNewSize = 192;
let editorUsesCustomSize = false;
const editorCustomSize = /** @type {HTMLElement} */ (document.getElementById('editor-map-custom'));
const editorMapCols = /** @type {HTMLInputElement} */ (document.getElementById('editor-map-cols'));
const editorMapRows = /** @type {HTMLInputElement} */ (document.getElementById('editor-map-rows'));
const EDITOR_DEFAULTS = { size: 192, custom: false, cols: 192, rows: 192, faction: 'humans', startTime: 'morning', brush: 1, dragPaint: false, category: 'nature', tool: 'tree' };
const rememberEditorChoices = () => saveData('editor-choices', {
  size: editorNewSize,
  custom: editorUsesCustomSize,
  cols: editorMapCols.value,
  rows: editorMapRows.value,
  faction: editor.faction,
  startTime: editor.startTime,
  brush: editor.brush,
  dragPaint: editor.dragPaint,
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

// What this file sets up as the game starts (called by app/boot.js)
export function initEditorPanel() {
  const saved = loadData('editor-choices', EDITOR_DEFAULTS);
  editorNewSize = [128, 192, 256].includes(Number(saved.size)) ? Number(saved.size) : EDITOR_DEFAULTS.size;
  editorUsesCustomSize = !!saved.custom;
  editorMapCols.value = String(Math.max(128, Math.min(512, Number(saved.cols) || EDITOR_DEFAULTS.cols)));
  editorMapRows.value = String(Math.max(128, Math.min(512, Number(saved.rows) || EDITOR_DEFAULTS.rows)));
  editor.faction = GAME_CONFIG.factions[saved.faction]?.ready ? saved.faction : EDITOR_DEFAULTS.faction;
  editor.startTime = ['morning', 'day', 'evening', 'night'].includes(saved.startTime) ? saved.startTime : EDITOR_DEFAULTS.startTime;
  editor.brush = [1, 3, 5].includes(Number(saved.brush)) ? Number(saved.brush) : EDITOR_DEFAULTS.brush;
  editor.dragPaint = !!saved.dragPaint;
  editor.category = ['terrain', 'nature', 'buildings'].includes(saved.category) ? saved.category : EDITOR_DEFAULTS.category;
  editor.tool = EDITOR_TOOLS.some(tool => tool.id === saved.tool) ? saved.tool : EDITOR_DEFAULTS.tool;
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
  onTap(document.getElementById('mode-editor'), () => { renderEditorMapList(); showMenuScreen('editor'); });
  onTap(document.getElementById('editor-new-empty'), () => startEditor({ ...editorDimensions(), generate: false }));
  onTap(document.getElementById('editor-new-generated'), () => startEditor({ ...editorDimensions(), generate: true }));
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
  // (#255) a drag paints with the brush when that's on; undo, redo; play the map; clear it
  setDragPainter(editorPaint);
  onTap(document.getElementById('editor-drag'), () => { editor.dragPaint = !editor.dragPaint; rememberEditorChoices(); renderEditorPanel(); });
  onTap(document.getElementById('editor-undo'), undoEditor);
  onTap(document.getElementById('editor-redo'), redoEditor);
  onTap(document.getElementById('editor-clear'), clearEditorMap);
  document.querySelectorAll('[data-start-time]').forEach(b => onTap(b, () => { editor.startTime = /** @type {string} */ (b.dataset.startTime); rememberEditorChoices(); renderEditorPanel(); })); // (#257)
  document.querySelectorAll('[data-resize]').forEach(button => onTap(button, () => {
    const [side, delta] = /** @type {string} */ (button.dataset.resize).split(':');
    resizeEditorMap(side, Number(delta));
  }));
}
