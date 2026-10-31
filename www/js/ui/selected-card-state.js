import { game } from '../engine/world/index.js';

let trackedSelection = null;
let dismissed = false;
let editingName = false;

function trackSelection(selected) {
  if (selected === trackedSelection) return;
  trackedSelection = selected;
  dismissed = false;
  editingName = false;
}

export function isSelectedCardVisible(selected) {
  trackSelection(selected);
  return !!selected && !dismissed;
}

export function isSelectedNameEditing(selected) {
  trackSelection(selected);
  return !!selected && !dismissed && editingName;
}

export function closeSelectedCard() {
  game.selectedSettler = null;
  game.selectedGroup = [];
  game.addingToGroup = false;
  trackSelection(null);
  dismissed = false;
  editingName = false;
  document.getElementById('selected-bar')?.classList.remove('has-settler', 'editing-name');
}

export function openSelectedCard(selected) {
  trackSelection(selected);
  if (!selected) return;
  dismissed = false;
  editingName = false;
  document.getElementById('selected-bar')?.classList.add('has-settler');
  document.getElementById('selected-bar')?.classList.remove('editing-name');
}

export function openSelectedNameEditor(selected) {
  trackSelection(selected);
  if (!selected) return;
  dismissed = false;
  editingName = true;
  document.getElementById('selected-bar')?.classList.add('has-settler', 'editing-name');
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('selected-name'));
  input?.focus();
  input?.select();
}
