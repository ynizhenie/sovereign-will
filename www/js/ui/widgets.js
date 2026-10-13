// Pieces the screens share: a button's answer to a tap, prices shown short in red, a list of saved things

import { escapeHtml, iconHtml, setRichText } from './icons.js';
import { onTap, t } from '../engine/platform/index.js';
import { stock } from '../domains/colony/storage/index.js';

// Buttons with a price (#UI): what the stock is short of shows in red, and a button that can't be paid
// for is dimmed, as the stock changes (a few times a second)
export let affordabilityTick = 0;
export function refreshAffordability(force = false) {
  if (!force && ++affordabilityTick % 8 !== 0) return;
  for (const button of document.querySelectorAll('#bottom-panel button, #selected-bar button')) {
    const parts = button.querySelectorAll('.cost-part');
    if (!parts.length) continue;
    let short = false;
    for (const part of parts) {
      const missing = Number(stock[part.dataset.res || ''] || 0) < Number(part.dataset.amount);
      part.classList.toggle('short', missing);
      if (missing) short = true;
    }
    button.classList.toggle('cant-afford', short);
  }
}

// A button's answer (#UI): the one just pressed flashes green when what it did worked (a green notice) and
// shakes when it didn't (a red one), within a moment of the press
/** @type {HTMLElement | null} */
export let pressedButton = null;
export let pressedAt = 0;
export function answerPressedButton(ok) {
  if (!pressedButton || performance.now() - pressedAt > 600) return;
  const button = pressedButton, name = ok ? 'btn-ok' : 'btn-no';
  pressedButton = null;
  button.classList.remove('btn-ok', 'btn-no');
  void button.offsetWidth; // restart the animation
  button.classList.add(name);
  setTimeout(() => button.classList.remove(name), 500);
}

// A list of saved things (maps, generator presets), one per row: tap a name to pick it; its delete
// button asks right there whether to delete it. items: [{ id, label }]; attr names the data attributes the
// rows carry (data-<attr>, data-delete-<attr>).
/** @param {Element} list @param {{ id: string, label: string }[]} items
 * @param {{ attr: string, selected?: string, onPick: (id: string) => void, onDelete?: (id: string) => void, emptyText?: string }} options */
export function renderItemList(list, items, { attr, selected, onPick, onDelete, emptyText }) {
  list.innerHTML = '';
  list.classList.add('item-list');
  if (items.length === 0 && emptyText) {
    const empty = document.createElement('div');
    empty.className = 'item-list-empty';
    empty.textContent = emptyText;
    list.appendChild(empty);
    return;
  }
  const button = (className, html, dataName, id, action) => {
    const b = document.createElement('button');
    b.className = className;
    b.innerHTML = html;
    if (dataName) b.dataset[dataName] = id;
    onTap(b, action);
    return b;
  };
  for (const { id, label } of items) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const showItem = () => {
      row.innerHTML = '';
      row.append(
        button('item-name' + (selected === id ? ' active' : ''), escapeHtml(label), attr, id, () => onPick(id)),
        button('item-delete', iconHtml('close'), 'delete' + attr[0].toUpperCase() + attr.slice(1), id, askToDelete)
      );
    };
    const askToDelete = () => {
      row.innerHTML = '';
      const question = document.createElement('span');
      question.className = 'item-question';
      question.textContent = t('list.deleteQuestion', { name: label });
      row.append(question,
        button('item-confirm', escapeHtml(t('list.yes')), 'confirmDelete', id, () => onDelete && onDelete(id)),
        button('item-cancel', escapeHtml(t('list.no')), 'cancelDelete', id, showItem));
    };
    showItem();
    list.appendChild(row);
  }
}

// What this file sets up as the game starts (called by app/boot.js)
export function initWidgets() {
  document.addEventListener('pointerdown', e => {
    const target = /** @type {Element} */ (e.target), button = /** @type {HTMLElement | null} */ (target.closest && target.closest('button'));
    if (button) { pressedButton = button; pressedAt = performance.now(); }
  }, true);
}

// A button of the page (index.html) gets its text, icons marked [[name]], if it's there
export function labelButton(id, text) {
  const el = document.getElementById(id);
  if (el) setRichText(el, text);
}
