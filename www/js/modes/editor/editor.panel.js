// The editor's panel and its menu screen (new map, saved maps); its buttons

// ---- Panels

function renderEditorPanel() {
  const tools = document.getElementById('editor-tools');
  tools.innerHTML = '';
  const forFaction = tl => !tl.building || !getDefinition('buildings', tl.building).factions || getDefinition('buildings', tl.building).factions.includes(editor.faction);
  for (const tool of EDITOR_TOOLS.filter(tl => tl.category === editor.category && forFaction(tl))) {
    const button = document.createElement('button');
    button.className = 'btn' + (editor.tool === tool.id ? ' active' : '');
    button.dataset.tool = tool.id;
    const label = tool.building ? getDefinition('buildings', tool.building).label : t(`editor.tool.${tool.id}`);
    setRichText(button, `[[${tool.icon}]] ${label}`);
    onTap(button, () => { editor.tool = tool.id; renderEditorPanel(); });
    tools.appendChild(button);
  }
  document.querySelectorAll('[data-brush]').forEach(b => b.classList.toggle('active', Number(b.dataset.brush) === editor.brush));
  document.querySelectorAll('[data-editor-category]').forEach(b => b.classList.toggle('active', b.dataset.editorCategory === editor.category));
  document.getElementById('editor-erase').classList.toggle('active', editor.tool === 'erase');
  document.getElementById('editor-size').textContent = `${COLS}×${ROWS}`;
}

// The editor menu's faction choice (#170)
function renderEditorFaction() {
  const row = document.getElementById('editor-faction');
  row.innerHTML = '';
  for (const faction of Object.values(GAME_CONFIG.factions).filter(f => f.ready)) {
    const button = document.createElement('button');
    button.className = 'faction-option' + (editor.faction === faction.id ? ' active' : '');
    button.dataset.faction = faction.id;
    button.textContent = faction.label;
    onTap(button, () => { editor.faction = faction.id; renderEditorFaction(); });
    row.appendChild(button);
  }
}

// The editor's menu screen: new map (size, empty or generated) and the saved maps to open or delete
function renderEditorMapList() {
  renderEditorFaction();
  renderSavedMapList(document.getElementById('editor-map-list'), {
    open: map => startEditor({ map }),
    remove: name => { const maps = loadSavedMaps(); delete maps[name]; storeSavedMaps(maps); renderEditorMapList(); }
  });
}

let editorNewSize = 40;
document.querySelectorAll('[data-editor-size]').forEach(button => onTap(button, () => {
  editorNewSize = Number(button.dataset.editorSize);
  document.querySelectorAll('[data-editor-size]').forEach(b => b.classList.toggle('active', b === button));
}));

document.getElementById('mode-editor').disabled = false;
onTap(document.getElementById('mode-editor'), () => { renderEditorMapList(); showMenuScreen('editor'); });
onTap(document.getElementById('editor-new-empty'), () => startEditor({ cols: editorNewSize, rows: editorNewSize, generate: false }));
onTap(document.getElementById('editor-new-generated'), () => startEditor({ cols: editorNewSize, rows: editorNewSize, generate: true }));
onTap(document.getElementById('editor-save'), saveEditorMap);
document.querySelectorAll('[data-brush]').forEach(button => onTap(button, () => { editor.brush = Number(button.dataset.brush); renderEditorPanel(); }));
document.querySelectorAll('[data-editor-category]').forEach(button => onTap(button, () => {
  editor.category = button.dataset.editorCategory;
  if (editor.tool !== 'erase') editor.tool = EDITOR_TOOLS.find(tl => tl.category === editor.category).id;
  renderEditorPanel();
}));
onTap(document.getElementById('editor-erase'), () => { editor.tool = 'erase'; renderEditorPanel(); });
onTap(document.getElementById('editor-resize'), () => { document.getElementById('editor-resize-panel').hidden ^= true; });
document.querySelectorAll('[data-resize]').forEach(button => onTap(button, () => {
  const [side, delta] = button.dataset.resize.split(':');
  resizeEditorMap(side, Number(delta));
}));
