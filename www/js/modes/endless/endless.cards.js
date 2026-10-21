// Cards (#255): an Endless setting, off by default. On, most buildings, tools, weapons and gear start locked
// (all but GAME_CONFIG.cards.start, what it takes to live), their tiles greyed under a lock. Each wave beaten
// (its enemies down, their tents and portals too) offers three cards, each a thing of a rarity drawn by
// its chance (common, rare, legendary), and the game waits while the player picks one: that one opens for good. Till all are open.

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { onTap, t } from '../../engine/platform/index.js';
import { game } from '../../engine/world/index.js';
import { isForPlayerFaction } from '../../domains/factions/index.js';
import { escapeHtml, iconHtml, richText, showNotification } from '../../ui/index.js';
import { formatCost } from '../../domains/colony/storage/index.js';
import { playSound } from '../../app/index.js';

const RARITIES = ['common', 'rare', 'legendary'];
const LOCKABLE = ['buildings', 'tools', 'weapons', 'gear'];

const config = () => GAME_CONFIG.cards;
const isOn = () => game.cardMode && game.gameMode === 'endless';
const isStart = (category, id) => (config().start[category] || []).includes(id);
const rarityOf = key => RARITIES.find(r => config().rarity[r].includes(key)) || 'common';

// Can't be built or made yet: cards on, and not opened (from the start or by a card)
export function isLocked(category, id) {
  if (!isOn()) return false;
  // (#306) a recipe opens with what it's for (arrows: with the bow)
  if (category === 'recipes') { const w = (GAME_CONFIG.recipes[id] || {}).unlockedWith; return !!w && isLocked(w.split(':')[0], w.split(':')[1]); }
  if (!LOCKABLE.includes(category) || id === 'fist') return false;
  return !isStart(category, id) && !game.unlocked[`${category}:${id}`];
}

// What a card can offer now: locked things of the player's faction whose way to make them is open (iron
// wants the smelter, a smithy's things the smithy)
function offerable() {
  const keys = [];
  for (const category of LOCKABLE) {
    for (const item of Object.values(GAME_CONFIG[category])) {
      if (!isLocked(category, item.id) || !isForPlayerFaction(item) || item.hidden) continue;
      const iron = item.cost && item.cost.iron;
      if (iron && isLocked('buildings', 'smelter')) continue;
      if (category !== 'buildings' && iron && isLocked('buildings', 'smithy')) continue;
      keys.push(`${category}:${item.id}`);
    }
  }
  return keys;
}

// Three cards, each of a rarity drawn by its chance (#279: not always one of each; three common can come),
// another rarity standing in for one with none left
export function drawCards(random = Math.random) {
  const pool = offerable();
  const cards = [];
  const chances = config().chances;
  while (cards.length < 3 && pool.length) {
    let roll = random() * RARITIES.reduce((sum, r) => sum + chances[r], 0), rarity = RARITIES[0];
    for (const r of RARITIES) { if (roll < chances[r]) { rarity = r; break; } roll -= chances[r]; }
    // none of that rarity left: the nearest that has some, the commoner first
    const order = [rarity, ...RARITIES.filter(r => r !== rarity).sort((a, b) => Math.abs(RARITIES.indexOf(a) - RARITIES.indexOf(rarity)) - Math.abs(RARITIES.indexOf(b) - RARITIES.indexOf(rarity)) || RARITIES.indexOf(a) - RARITIES.indexOf(b))];
    const of = pool.filter(k => rarityOf(k) === order.find(r => pool.some(k2 => rarityOf(k2) === r)));
    const key = of[Math.floor(random() * of.length)];
    pool.splice(pool.indexOf(key), 1);
    cards.push(key);
  }
  return cards.sort((a, b) => RARITIES.indexOf(rarityOf(a)) - RARITIES.indexOf(rarityOf(b)));
}

// The wave beaten: none of its enemies left (nor any still to come out of a portal), no enemy tent or portal
function waveBeaten() {
  return !game.enemies.some(en => en.fromWave && en.hp > 0) && !game.portalQueue.length && !game.enemyTents.length && !game.enemyTentBlueprints.length;
}

// Each tick: a card earned for each wave that came; offered once the waves are beaten
let lockClock = 0;
export function tickCards() {
  if (!isOn() || !game.gameStarted) return;
  const waves = game.waveNum - 1;
  if (waves > game.cardsWave) { game.cardsDue += waves - game.cardsWave; game.cardsWave = waves; }
  if (game.cardsDue > 0 && !game.cardOffer && waveBeaten()) {
    game.cardsDue--;
    const cards = drawCards();
    if (cards.length) { game.cardOffer = cards; showCardOffer(); }
  }
  if (++lockClock % 30 === 0) refreshLocks();
}

// The one picked opens
export function pickCard(key) {
  if (!game.cardOffer || !game.cardOffer.includes(key)) return;
  game.unlocked[key] = true;
  game.cardOffer = null;
  hideCardOffer();
  refreshLocks();
  const [category, id] = key.split(':');
  playSound('craftDone');
  showNotification(t('cards.opened', { name: (getDefinition(category, id) || { label: id }).label }), false);
}

// ---- On screen

// The tiles of locked things greyed, a lock on each (the Building and Craft tabs)
export function refreshLocks() {
  for (const tile of document.querySelectorAll('#bottom-panel [data-info]')) {
    const [category, id] = String(tile.dataset.info).split(':');
    const locked = isLocked(category, id);
    tile.classList.toggle('locked', locked);
    let mark = tile.querySelector('.tile-lock');
    if (locked && !mark) { mark = document.createElement('span'); mark.className = 'tile-lock'; mark.innerHTML = iconHtml('lock'); tile.appendChild(mark); }
    if (!locked && mark) mark.remove();
  }
}

function hideCardOffer() {
  const el = document.getElementById('card-offer');
  if (el) el.remove();
}

// The three cards over the map; the game waits till one is picked
export function showCardOffer() {
  hideCardOffer();
  if (!game.cardOffer) return;
  const el = document.createElement('div');
  el.id = 'card-offer';
  el.innerHTML = `<div class="card-offer-title">${escapeHtml(t('cards.title'))}</div><div class="card-row"></div>`;
  const row = /** @type {HTMLElement} */ (el.querySelector('.card-row'));
  for (const key of game.cardOffer) {
    const [category, id] = key.split(':');
    const item = getDefinition(category, id) || { id, label: id, icon: '' };
    const rarity = rarityOf(key);
    const card = document.createElement('button');
    card.className = `card card-${rarity}`;
    card.dataset.card = key;
    card.innerHTML = `<span class="card-rarity">${escapeHtml(t(`cards.${rarity}`))}</span>` +
      `<span class="card-icon">${item.icon ? iconHtml(item.icon) : ''}</span>` +
      `<b class="card-name">${escapeHtml(item.label)}</b>` +
      `<span class="card-kind">${escapeHtml(t(`cards.kind.${category}`))}</span>` +
      `<span class="card-cost">${richText(formatCost(item.cost || {}))}</span>`;
    onTap(card, () => pickCard(key));
    row.appendChild(card);
  }
  document.body.appendChild(el);
}

// A new game or one loaded: the cards as they stand (an offer waiting shows again)
export function syncCards() {
  hideCardOffer();
  refreshLocks();
  if (isOn() && game.cardOffer) showCardOffer();
}

// What this file sets up as the game starts (called by app/boot.js): the setting in the Endless menu
export function initEndlessCards() {
  document.querySelectorAll('.cards-option').forEach(button => onTap(button, () => {
    game.cardMode = button.dataset.cards === 'on';
    document.querySelectorAll('.cards-option').forEach(b => b.classList.toggle('active', b === button));
  }));
}
