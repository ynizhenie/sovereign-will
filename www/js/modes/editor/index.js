// The door of modes/editor/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { loadCustomMap, loadSavedMaps, renderSavedMapList } from './editor.maps.js';
export { initEditorPanel } from './editor.panel.js';
export { editor, editorTap, leaveEditor } from './editor.tools.js';
