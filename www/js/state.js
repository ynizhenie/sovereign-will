function updateSeedHud() {
  const seedElem = document.getElementById('hud-seed');
  if (seedElem && worldSeed) {
    seedElem.innerText = worldSeed.value;
  }
}

// the two sides (#43, factions.js): GAME_CONFIG.factions ids and the colours their units are drawn in
const sides = { player: { faction: 'humans', color: '#e9c46a' }, enemy: { faction: 'humans', color: '#e8572a' } };

// in the map editor, the faction the map is made for (#170)
function getPlayerFaction() {
  if (gameMode === 'editor' && typeof editor !== 'undefined') return GAME_CONFIG.factions[editor.faction];
  if (gameMode === 'menu' && typeof menuWorld !== 'undefined') return GAME_CONFIG.factions[menuWorld.faction]; // #193
  return GAME_CONFIG.factions[sides.player.faction];
}

function getEnemyFaction() { return GAME_CONFIG.factions[sides.enemy.faction]; }

function getDifficulty() {
  return GAME_CONFIG.difficulty[gameDifficulty] || GAME_CONFIG.difficulty.normal;
}

// ---- The colony's stock (#36, #141): amount per resource id of GAME_CONFIG.resources, shared by the
// whole colony (set from GAME_CONFIG.start by resetGame). The town hall and warehouses are where
// settlers bring what they gather and fetch what they need: whichever is nearest.
const stock = Object.fromEntries(Object.keys(GAME_CONFIG.resources).map(id => [id, 0]));

function getStorages() {
  return [townHall, ...buildings.filter(b => b.type === 'warehouse')];
}

// Take up to `amount` of a resource out of the stock; returns how much there was
function takeStock(id, amount) {
  const got = Math.max(0, Math.min(amount, stock[id] || 0));
  stock[id] -= got;
  return got;
}

function showNotification(msg, isWarning = true) {
  if (isWarning && typeof playSound === 'function') playSound('error');
  if (typeof answerPressedButton === 'function') answerPressedButton(!isWarning);
  const toastDiv = document.getElementById('toast-notification');
  if (toastDiv) {
    setRichText(toastDiv, msg);
    toastDiv.classList.toggle('ok', !isWarning); // red for a warning, green for done (theme.css)
    toastDiv.style.opacity = '1';
    toastDiv.style.transform = 'translateX(-50%) translateY(0px)';
    
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
      toastDiv.style.opacity = '0';
      toastDiv.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 2800);
  }
}
