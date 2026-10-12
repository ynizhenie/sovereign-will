// Factions (#43): the colony's faction and the enemy's, each with its colour, chosen in the Endless menu
// and remembered on the device. The enemy's faction decides what its waves and spawners are made of
// (GAME_CONFIG.factions); every unit is drawn in its side's colour, and the two sides never share one.

// The Endless menu's faction rows: a button per faction (the unready ones say "soon") and the colours
function renderFactionPicker() {
  for (const side of ['player', 'enemy']) {
    const row = document.getElementById(`faction-${side}`);
    row.innerHTML = '';
    for (const faction of Object.values(GAME_CONFIG.factions)) {
      const button = document.createElement('button');
      button.className = 'faction-option' + (sides[side].faction === faction.id ? ' active' : '');
      button.dataset.faction = faction.id;
      const locked = side === 'player' && getLockedPlayerFaction();
      button.disabled = !faction.ready || (!!locked && faction.id !== locked);
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
