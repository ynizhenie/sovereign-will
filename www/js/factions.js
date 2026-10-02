// Factions (#43): the colony's faction and the enemy's, each with its colour, chosen in the Endless menu
// and remembered on the device. The enemy's faction decides what its waves and spawners are made of
// (GAME_CONFIG.factions); every unit is drawn in its side's colour, and the two sides never share one.

const FACTION_STORAGE_KEY = 'sovereign-will-factions';

// In battle mode the sides stay green and red, as the field is marked
function getSettlerColor() {
  return gameMode === 'battle' ? '#27ae60' : sides.player.color;
}

function getEnemyColor(en) {
  const color = gameMode === 'battle' ? '#e74c3c' : sides.enemy.color;
  return en && en.type === 'big' ? shadeColor(color, -0.25) : color;
}

// A colour made lighter (amount > 0) or darker (< 0), amount -1..1
function shadeColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = c => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

// The first colour of the palette the other side doesn't have, starting from `wanted`
function freeColor(wanted, other) {
  if (wanted !== other) return wanted;
  return GAME_CONFIG.factionColors.find(c => c !== other);
}

function setSideFaction(side, faction) {
  if (!GAME_CONFIG.factions[faction] || !GAME_CONFIG.factions[faction].ready) return;
  const other = side === 'player' ? sides.enemy : sides.player;
  sides[side].faction = faction;
  sides[side].color = freeColor(GAME_CONFIG.factions[faction].color, other.color);
  saveSides();
  renderFactionPicker();
}

function setSideColor(side, color) {
  const other = side === 'player' ? sides.enemy : sides.player;
  if (color === other.color || !GAME_CONFIG.factionColors.includes(color)) return;
  sides[side].color = color;
  saveSides();
  renderFactionPicker();
}

function saveSides() {
  try { localStorage.setItem(FACTION_STORAGE_KEY, JSON.stringify(sides)); } catch (e) { /* not remembered */ }
}

function loadSides() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(FACTION_STORAGE_KEY)); } catch (e) { /* none */ }
  for (const side of ['player', 'enemy']) {
    const s = saved && saved[side];
    if (s && GAME_CONFIG.factions[s.faction] && GAME_CONFIG.factions[s.faction].ready) sides[side].faction = s.faction;
    if (s && GAME_CONFIG.factionColors.includes(s.color)) sides[side].color = s.color;
  }
  if (sides.enemy.color === sides.player.color) sides.enemy.color = freeColor(sides.enemy.color, sides.player.color);
}

// The Endless menu's faction rows: a button per faction (the unready ones say "soon") and the colours
function renderFactionPicker() {
  for (const side of ['player', 'enemy']) {
    const row = document.getElementById(`faction-${side}`);
    row.innerHTML = '';
    for (const faction of Object.values(GAME_CONFIG.factions)) {
      const button = document.createElement('button');
      button.className = 'faction-option' + (sides[side].faction === faction.id ? ' active' : '');
      button.dataset.faction = faction.id;
      button.disabled = !faction.ready;
      button.textContent = faction.ready ? faction.label : `${faction.label} · ${t('menu.soon')}`;
      onTap(button, () => setSideFaction(side, faction.id));
      row.appendChild(button);
    }
    const colors = document.getElementById(`colors-${side}`);
    colors.innerHTML = '';
    const other = side === 'player' ? sides.enemy.color : sides.player.color;
    for (const color of GAME_CONFIG.factionColors) {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch' + (sides[side].color === color ? ' active' : '');
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.disabled = color === other;
      swatch.setAttribute('aria-label', color);
      onTap(swatch, () => setSideColor(side, color));
      colors.appendChild(swatch);
    }
  }
}

loadSides();
renderFactionPicker();
onTap(document.getElementById('mode-endless'), renderFactionPicker); // in the current language
