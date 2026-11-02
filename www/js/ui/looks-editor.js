// (#326, 26.10, 28) The looks editor (Settings → Looks): every variation of how things look, each seen drawn, its chance
// set, its colours changed, new ones added (a coat, a hair colour), and all put back as they came. What's changed is kept
// on the device and laid over the config as the game starts (applySavedLooks): GAME_CONFIG.looks (people: how many
// women, the hairstyles' weights, the hair colours), GAME_CONFIG.pets (coats, how many females), the boars' looks
// (coats, marks, size, sows), and the dummies' kinds. A unit keeps the look it has (by its number); new ones come by the
// new chances. Hairstyles and dummies are drawn by the game: their chances change, no new ones

import { GAME_CONFIG } from '../content/configs/index.js';
import { ctx, loadData, onTap, saveData, t } from '../engine/platform/index.js';
import { SKIN, drawFigure } from '../domains/colony/settlers/index.js';
import { drawPet } from '../domains/colony/pets/index.js';
import { drawBoarBody } from '../domains/economy/hunting/index.js';
import { DUMMY_VARIANTS, drawDummyArt } from '../domains/economy/building/index.js';
import { setRichText } from './icons.js';
import { showMenuScreen } from '../modes/menu/index.js';

const copy = v => JSON.parse(JSON.stringify(v));
const boarLooks = () => GAME_CONFIG.mapResources.boar.looks;
// What's edited, as the game ships it (put back by Reset)
const ORIGINAL = {
  people: copy(GAME_CONFIG.looks),
  pets: copy({ coats: GAME_CONFIG.pets.coats, femaleChance: GAME_CONFIG.pets.femaleChance }),
  boars: copy(boarLooks()),
  dummies: copy(DUMMY_VARIANTS)
};
export const LOOK_TABS = /** @type {const} */ (['people', 'pets', 'boars', 'dummies']);

// Now: each part of it as it is in the game
function current() {
  return { people: GAME_CONFIG.looks, pets: { coats: GAME_CONFIG.pets.coats, femaleChance: GAME_CONFIG.pets.femaleChance }, boars: boarLooks(), dummies: DUMMY_VARIANTS };
}

// A part laid into the game, in place (what the game keeps pointing at stays the same object)
function put(part, value) {
  const v = copy(value);
  if (part === 'people') { const p = GAME_CONFIG.looks; for (const k of Object.keys(p)) delete p[k]; Object.assign(p, v); }
  if (part === 'pets') { const c = GAME_CONFIG.pets.coats; for (const k of Object.keys(c)) delete c[k]; Object.assign(c, v.coats); GAME_CONFIG.pets.femaleChance = v.femaleChance; }
  if (part === 'boars') { const b = boarLooks(); for (const k of Object.keys(b)) delete b[k]; Object.assign(b, v); }
  if (part === 'dummies') DUMMY_VARIANTS.splice(0, DUMMY_VARIANTS.length, ...v);
}

// As the game starts: what was changed on this device, over the config
export function applySavedLooks() {
  const saved = loadData('looks', {});
  for (const part of LOOK_TABS) if (saved[part]) { try { put(part, saved[part]); } catch (e) { put(part, ORIGINAL[part]); } }
}

// Kept after each change: the parts that differ from the config's
function store() {
  const now = current(), saved = {};
  for (const part of LOOK_TABS) if (JSON.stringify(now[part]) !== JSON.stringify(ORIGINAL[part])) saved[part] = copy(now[part]);
  saveData('looks', saved);
}

/** @param {typeof LOOK_TABS[number] | null} part null: all */
export function resetLooks(part = null) {
  for (const p of part ? [part] : LOOK_TABS) put(p, ORIGINAL[p]);
  store();
  renderLooks();
}

// ---- Drawn: the game's own drawing, into a corner of the map's canvas and copied out (the next frame draws over it)

function preview(canvas, paint) {
  const w = canvas.width, h = canvas.height, c = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#4f6b3a'; ctx.fillRect(0, 0, w, h); // (grass under it)
  ctx.translate(w / 2, h * 0.6);
  ctx.scale(2, 2);
  try { paint(); } catch (e) { /* (a look that can't be drawn: an empty picture) */ }
  ctx.restore();
  if (c) { c.clearRect(0, 0, w, h); c.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, w, h); }
}
const KIN_TYPE = { humans: 'normal', undead: 'zombie', demons: 'imp' }; // (its hair by its kind's unit)
const person = (female, style, shade, kin = 'humans') => () => {
  const unit = { x: 0, y: 0, facing: 0.5, walk: 0, look: { female, style, shade }, type: KIN_TYPE[kin] || 'normal', visualRadius: 11, radius: 11 };
  drawFigure(unit, { x: 0, y: 0, r: 11, body: '#6d8f3c', skin: SKIN[kin] || SKIN.humans, horns: kin === 'demons', hand: true });
};

// ---- On screen

let tab = /** @type {typeof LOOK_TABS[number]} */ ('people');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const share = (w, list) => { const sum = list.reduce((n, x) => n + Number(x || 0), 0); return sum > 0 ? Math.round(Number(w || 0) / sum * 100) : 0; };

// A card: its picture, its name, a chance (weight) with its share of all, colours, and a × if it may go
/** @param {{ name: string, paint: () => void, weight?: number, weights?: number[], onWeight?: (v: number) => void, colours?: string[], onColour?: (i: number, v: string) => void, onRemove?: () => void }} o */
function card({ name, paint, weight, weights = [], onWeight = () => {}, colours = [], onColour = () => {}, onRemove }) {
  const box = el('div', 'look-card');
  const canvas = /** @type {HTMLCanvasElement} */ (el('canvas', 'look-preview'));
  canvas.width = 72; canvas.height = 72;
  box.appendChild(canvas);
  box.appendChild(el('div', 'look-name', name));
  if (weight !== undefined) {
    const row = el('label', 'look-weight');
    const input = /** @type {HTMLInputElement} */ (el('input'));
    input.type = 'number'; input.min = '0'; input.step = '1'; input.value = String(weight); input.dataset.lookWeight = name;
    input.addEventListener('change', () => { const v = Math.max(0, Math.round(Number(input.value) || 0)); onWeight(v); store(); renderLooks(); });
    row.append(el('span', '', t('looks.chance')), input, el('small', '', `${share(weight, weights)}%`));
    box.appendChild(row);
  }
  if (colours.length) {
    const row = el('div', 'look-colours');
    colours.forEach((col, i) => {
      const input = /** @type {HTMLInputElement} */ (el('input'));
      input.type = 'color'; input.value = col; input.dataset.lookColour = String(i);
      input.addEventListener('change', () => { onColour(i, input.value); store(); renderLooks(); });
      row.appendChild(input);
    });
    box.appendChild(row);
  }
  if (onRemove) {
    const del = el('button', 'btn tile-act look-remove');
    del.dataset.lookRemove = name;
    setRichText(del, '[[close]]');
    onTap(del, () => { onRemove(); store(); renderLooks(); });
    box.appendChild(del);
  }
  requestAnimationFrame(() => preview(canvas, paint));
  return box;
}

function heading(text) { return el('div', 'panel-heading', text); }
function addButton(label, act) {
  const b = el('button', 'btn look-add');
  setRichText(b, `[[plus]] ${label}`);
  onTap(b, () => { act(); store(); renderLooks(); });
  return b;
}
// a share 0..1 as a percent field
function percentField(label, get, set) {
  const row = el('label', 'generator-field');
  const input = /** @type {HTMLInputElement} */ (el('input'));
  input.type = 'number'; input.min = '0'; input.max = '100'; input.value = String(Math.round(get() * 100));
  input.addEventListener('change', () => { set(Math.max(0, Math.min(100, Number(input.value) || 0)) / 100); store(); renderLooks(); });
  const boxes = el('span'); boxes.append(input, document.createTextNode(' %'));
  row.append(el('span', '', label), boxes);
  return row;
}
const grid = () => el('div', 'look-grid');

function renderPeople(pane) {
  const L = GAME_CONFIG.looks;
  pane.appendChild(percentField(t('looks.women'), () => L.femaleChance, v => { L.femaleChance = v; }));
  for (const sex of ['male', 'female']) {
    pane.appendChild(heading(t(`looks.${sex}`)));
    const g = grid();
    L[sex].forEach((w, i) => g.appendChild(card({ name: t('looks.style', { n: i + 1 }), paint: person(sex === 'female', i, 1), weight: w, weights: L[sex], onWeight: v => { L[sex][i] = v; } })));
    pane.appendChild(g);
  }
  for (const kin of Object.keys(L.hair)) {
    pane.appendChild(heading(t('looks.hair', { faction: (GAME_CONFIG.factions[kin] || { label: kin }).label })));
    const g = grid();
    L.hair[kin].forEach((col, i) => g.appendChild(card({
      name: `#${i + 1}`, paint: person(i % 2 === 1, 0, i, kin), colours: [col], onColour: (_, v) => { L.hair[kin][i] = v; },
      onRemove: L.hair[kin].length > 1 ? () => L.hair[kin].splice(i, 1) : undefined
    })));
    g.appendChild(addButton(t('looks.addColour'), () => L.hair[kin].push(L.hair[kin][L.hair[kin].length - 1])));
    pane.appendChild(g);
  }
}

function renderPets(pane) {
  const P = GAME_CONFIG.pets;
  pane.appendChild(percentField(t('looks.females'), () => P.femaleChance, v => { P.femaleChance = v; }));
  for (const kind of Object.keys(P.coats)) {
    const coats = P.coats[kind], type = Object.values(GAME_CONFIG.settlerTypes).find(k => k.pet === kind);
    pane.appendChild(heading(type ? type.label : kind));
    const g = grid(), weights = coats.map(c => c[2] ?? 1);
    coats.forEach((coat, i) => g.appendChild(card({
      name: `#${i + 1}`, paint: () => drawPet({ x: 0, y: 0, facing: 0, look: { coat: i, female: false }, type: type ? type.id : kind, visualRadius: 10, radius: 9, id: 1 }, kind),
      weight: coat[2] ?? 1, weights, onWeight: v => { coat[2] = v; },
      colours: [coat[0], coat[1]], onColour: (k, v) => { coat[k] = v; },
      onRemove: coats.length > 1 ? () => coats.splice(i, 1) : undefined
    })));
    g.appendChild(addButton(t('looks.addCoat'), () => coats.push(copy(coats[coats.length - 1]))));
    pane.appendChild(g);
  }
}

function renderBoars(pane) {
  const B = boarLooks();
  pane.appendChild(percentField(t('looks.marks'), () => B.marksChance, v => { B.marksChance = v; }));
  pane.appendChild(percentField(t('looks.sows'), () => B.femaleChance, v => { B.femaleChance = v; }));
  pane.appendChild(percentField(t('looks.sizeFrom'), () => B.size[0], v => { B.size[0] = Math.max(0.5, Math.min(v, B.size[1])); }));
  pane.appendChild(percentField(t('looks.sizeTo'), () => B.size[1], v => { B.size[1] = Math.max(B.size[0], Math.min(v, 1.6)); }));
  pane.appendChild(heading(t('looks.coats')));
  const g = grid(), weights = B.coats.map(c => Number(c[3]));
  B.coats.forEach((coat, i) => g.appendChild(card({
    name: `#${i + 1}`, paint: () => drawBoarBody({ x: 0, y: 0, look: { coat: i, marks: null, size: 1, female: false }, faceX: 1 }, false),
    weight: Number(coat[3]), weights: weights.map(Number), onWeight: v => { /** @type {any[]} */ (coat)[3] = v; },
    colours: [String(coat[0]), String(coat[1]), String(coat[2])], onColour: (k, v) => { /** @type {any[]} */ (coat)[k] = v; },
    onRemove: B.coats.length > 1 ? () => B.coats.splice(i, 1) : undefined
  })));
  g.appendChild(addButton(t('looks.addCoat'), () => B.coats.push(copy(B.coats[B.coats.length - 1]))));
  pane.appendChild(g);
}

function renderDummies(pane) {
  const g = grid(), weights = DUMMY_VARIANTS.map(v => Number(v[1]));
  DUMMY_VARIANTS.forEach((v, i) => g.appendChild(card({
    name: t(`looks.dummy.${v[0]}`), paint: () => drawDummyArt(0, 0, String(v[0])), weight: Number(v[1]), weights, onWeight: w => { /** @type {any[]} */ (DUMMY_VARIANTS[i])[1] = w; }
  })));
  pane.appendChild(g);
}

// The screen as it is now: its tabs, the open one's cards, Reset for it and for all
export function renderLooks() {
  const screen = document.getElementById('looks-screen');
  if (!screen || screen.hidden) return;
  document.querySelectorAll('[data-looks-tab]').forEach(b => b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.looksTab === tab));
  const pane = document.getElementById('looks-pane');
  pane.innerHTML = '';
  ({ people: renderPeople, pets: renderPets, boars: renderBoars, dummies: renderDummies })[tab](pane);
}


// What this file sets up as the game starts (called by app/boot.js)
export function initLooksEditor() {
  applySavedLooks();
  onTap(document.getElementById('open-looks'), () => { showMenuScreen('looks'); renderLooks(); });
  document.querySelectorAll('[data-looks-tab]').forEach(b => onTap(b, () => { tab = /** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.looksTab); renderLooks(); }));
  onTap(document.getElementById('looks-reset'), () => resetLooks(tab));
  onTap(document.getElementById('looks-reset-all'), () => resetLooks(null));
}
