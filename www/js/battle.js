// Battle mode (#38): an empty grass field split down the middle. The player places units of any faction:
// theirs on the green side (left), enemies on the red side (right), buildings anywhere; presses Fight, and
// they battle it out; the winner is shown and, a few seconds later, the same line-up comes back to adjust.
// A fight can be called off, and the player can possess one of theirs in it. Archers' arrows don't run
// out. Green units are settlers and red ones enemies, driven by the usual AI (#142, #166).

// The panel's categories: the player's units (green side), enemies (red side), buildings (either side);
// each by faction (#166)
const BATTLE_CATEGORIES = ['own', 'enemy', 'buildings'];

// The player's units by faction: a settler kind with a weapon (and a tool: the undead's necromancer);
// armour and a shield come from the panel's toggles. Enemies: the enemy kinds of each faction, with their
// own stats (GAME_CONFIG.factions[f].enemies).
const BATTLE_PLAYER_UNITS = {
  humans: [
    { id: 'fist', type: 'normal', weapon: 'fist' }, { id: 'club', type: 'normal', weapon: 'club' },
    { id: 'sword', type: 'normal', weapon: 'sword' }, { id: 'spear', type: 'normal', weapon: 'spear' },
    { id: 'iron_sword', type: 'normal', weapon: 'iron_sword' }, { id: 'iron_spear', type: 'normal', weapon: 'iron_spear' },
    { id: 'bow', type: 'normal', weapon: 'bow' }, { id: 'big_club', type: 'big', weapon: 'club' }, { id: 'big_spear', type: 'big', weapon: 'spear' }
  ],
  undead: [
    { id: 'zombie', type: 'zombie', weapon: 'fist' }, { id: 'zombie_club', type: 'zombie', weapon: 'club' },
    { id: 'zombie_sword', type: 'zombie', weapon: 'sword' }, { id: 'skeleton', type: 'skeleton', weapon: 'bow' },
    { id: 'necromancer', type: 'zombie', weapon: 'fist', tool: 'necro_staff' }, { id: 'big_zombie', type: 'big_zombie', weapon: 'club' }
  ],
  demons: [
    { id: 'imp', type: 'imp', weapon: 'club' }, { id: 'imp_sword', type: 'imp', weapon: 'sword' },
    { id: 'imp_spear', type: 'imp', weapon: 'spear' }, { id: 'fire_imp', type: 'fire_imp', weapon: 'bow' },
    { id: 'demon', type: 'demon', weapon: 'club' }, { id: 'demon_spear', type: 'demon', weapon: 'spear' }
  ]
};

const BATTLE_PRESETS = [
  ...Object.entries(BATTLE_PLAYER_UNITS).flatMap(([faction, units]) => units.map(u => ({ ...u, faction }))),
  ...Object.values(GAME_CONFIG.factions).filter(f => f.ready && f.enemies).flatMap(f => f.enemies.map(id => ({ id, enemy: id, faction: f.id })))
];

// buildings any faction has, then each faction's own (those with `factions` in GAME_CONFIG.buildings)
const BATTLE_BUILDINGS = ['wall_wood', 'wall_stone', 'door', 'spikes', 'watchtower', 'tent', 'grave', 'sacrifice_circle', 'portal'];

const BATTLE_RESULT_SECONDS = 4;

const battle = {
  phase: 'off',       // off / setup / fight / result
  category: 'own',    // the panel's category
  faction: 'humans',  // the faction its units and buildings are shown for (#166)
  preset: 'sword',    // the unit preset the next tap places
  building: 'wall_wood',
  armor: false,       // colony units placed next get armour / a shield (melee only)
  shield: false,
  lineup: [],         // { presetId, x, y, armor, shield } or { building, x, y }: what's placed, kept between fights
  winner: null,       // green / red / draw
  resultTimer: 0,
  nextId: 1,
  savedMapSettings: null
};

function getBattlePreset(id) {
  return BATTLE_PRESETS.find(p => p.id === id);
}

// The midline: left of it is green, right of it red
function battleSide(x) {
  return x < WORLD_WIDTH / 2 ? 'green' : 'red';
}

function makeBattleUnit(entry) {
  const preset = getBattlePreset(entry.presetId);
  if (preset.enemy) {
    const en = createConfiguredEnemy({ x: entry.x, y: entry.y }, preset.enemy);
    en.battleEntry = entry;
    enemies.push(en);
    return;
  }
  const archer = isBowWeapon(preset.weapon);
  const s = createSettler(preset.type, battle.nextId++, entry.x, entry.y);
  Object.assign(s, {
    weapon: preset.weapon, tool: preset.tool || 'none',
    role: archer ? 'archer' : preset.tool ? 'worker' : 'soldier', quiver: archer, quiverCapacity: 30, arrows: archer ? 30 : 0, battleEntry: entry
  });
  if (entry.armor) putOnGear(s, 'armor');
  if (entry.shield && canUseShield(s)) s.shield = true;
  settlers.push(s);
}

// An empty field: grass only, the town hall out of the way, no waves, no animals
function setUpBattleField() {
  battle.savedMapSettings = mapSettings;
  mapSettings = { cols: 40, rows: 26 };
  resetGame();
  for (const list of [trees, cacti, boulders, grassList, berryBushes, sticks, pebbles, ironOres, coalOres, boars,
    naturalRocks, waterTiles, farmPlots, desertTiles, beachTiles]) list.length = 0;
  desertRegion = null;
  forests = [];
  settlers = [];
  townHall.x = -10000; townHall.y = -10000; townHall.hp = townHall.maxHp = 1e9;
  waveTimer = Infinity; boarRespawnTimer = Infinity;
  invalidateAllPaths();
  camera.x = WORLD_WIDTH / 2; camera.y = WORLD_HEIGHT / 2; setZoom(0); clampCamera();
}

// The line-up as placed: units standing still until Fight
function resetBattleUnits() {
  settlers = []; enemies = []; projectiles = []; corpses = []; bloodSplats = []; dung = []; buildings = [];
  for (const entry of battle.lineup) {
    if (entry.building) {
      const b = createBuildingBlueprint(entry.building, entry.x, entry.y);
      delete b.progress;
      delete b.maxProgress;
      buildings.push(b);
    } else {
      makeBattleUnit(entry);
    }
  }
  invalidateAllPaths();
}

function startBattleMode() {
  gameMode = 'battle';
  battle.phase = 'setup';
  battle.lineup = [];
  battle.winner = null;
  setUpBattleField();
  resetBattleUnits();
  gameStarted = true;
  document.getElementById('main-menu').style.display = 'none';
  document.body.classList.add('battle-mode');
  renderBattlePanel();
}

function leaveBattleMode() {
  gameMode = 'endless';
  battle.phase = 'off';
  document.body.classList.remove('battle-mode');
  if (battle.savedMapSettings) mapSettings = battle.savedMapSettings; // the Endless choice comes back
  exitToMainMenu();
}

// A tap during setup: place what's chosen on an empty tile (colony units on the green side, enemies on
// the red one, buildings anywhere), or take away what stands there
function battleTap(x, y) {
  if (battle.phase !== 'setup') return;
  const g = getGridPos(x, y);
  if (isBorderZone(g.gx, g.gy)) return;
  const cx = g.gx * TILE_SIZE + 15, cy = g.gy * TILE_SIZE + 15;
  const existing = battle.lineup.find(e => e.x === cx && e.y === cy);
  if (existing) {
    battle.lineup.splice(battle.lineup.indexOf(existing), 1);
  } else if (battle.category === 'buildings') {
    battle.lineup.push({ building: battle.building, x: cx, y: cy });
  } else {
    const preset = getBattlePreset(battle.preset);
    const side = preset.enemy ? 'red' : 'green';
    if (battleSide(cx) !== side) { showNotification(t(`battle.only.${side}`), true); return; }
    battle.lineup.push(preset.enemy ? { presetId: preset.id, x: cx, y: cy }
      : { presetId: preset.id, x: cx, y: cy, armor: battle.armor, shield: battle.shield });
  }
  resetBattleUnits();
}

// Take away everything placed on one side
function clearBattleSide(side) {
  if (battle.phase !== 'setup') return;
  battle.lineup = battle.lineup.filter(e => battleSide(e.x) !== side);
  resetBattleUnits();
}

// Stop a fight and put the line-up back as it was placed (#166)
function cancelBattleFight() {
  if (battle.phase !== 'fight') return;
  battle.phase = 'setup';
  settlers.forEach(s => { s.isPossessed = false; });
  resetBattleUnits();
  renderBattlePanel();
}

function startBattleFight() {
  if (battle.phase !== 'setup' || settlers.length === 0 || enemies.length === 0) {
    showNotification(t('battle.needBoth'), true);
    return;
  }
  battle.phase = 'fight';
  renderBattlePanel();
}

// Called every update in battle mode: the fight ends when a side has nobody left
function updateBattle(dt) {
  if (battle.phase === 'fight') {
    if (settlers.length === 0 || enemies.length === 0) {
      battle.winner = settlers.length > 0 ? 'green' : enemies.length > 0 ? 'red' : 'draw';
      battle.phase = 'result';
      battle.resultTimer = BATTLE_RESULT_SECONDS;
    }
  } else if (battle.phase === 'result') {
    battle.resultTimer -= dt;
    if (battle.resultTimer <= 0) {
      battle.phase = 'setup';
      battle.winner = null;
      resetBattleUnits();
      renderBattlePanel();
    }
  }
}

// ---- Drawing and the panel

function drawBattleOverlay() {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath(); ctx.moveTo(WORLD_WIDTH / 2, 0); ctx.lineTo(WORLD_WIDTH / 2, WORLD_HEIGHT); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(46, 204, 113, 0.06)'; ctx.fillRect(0, 0, WORLD_WIDTH / 2, WORLD_HEIGHT);
  ctx.fillStyle = 'rgba(231, 76, 60, 0.06)'; ctx.fillRect(WORLD_WIDTH / 2, 0, WORLD_WIDTH / 2, WORLD_HEIGHT);
}

function drawBattleResult() {
  if (battle.phase !== 'result') return;
  ctx.save();
  ctx.scale(screenPixelRatio, screenPixelRatio);
  const cx = canvas.width / screenPixelRatio / 2, cy = canvas.height / screenPixelRatio / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - 160, cy - 40, 320, 80);
  ctx.fillStyle = battle.winner === 'green' ? '#2ecc71' : battle.winner === 'red' ? '#e74c3c' : '#ecf0f1';
  ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(t(`battle.${battle.winner}Wins`), cx, cy + 9);
  ctx.restore();
}

// What a preset is called: a human one by its own name, an enemy by its kind, the others kind + weapon
function battlePresetLabel(preset) {
  if (preset.enemy) return GAME_CONFIG.enemies[preset.enemy].label;
  if (preset.faction === 'humans') return t(`preset.${preset.id}`);
  const parts = [GAME_CONFIG.settlerTypes[preset.type].label];
  if (preset.tool) parts.push(getDefinition('tools', preset.tool).label);
  else if (preset.weapon !== 'fist' && !isBowWeapon(preset.weapon)) parts.push(getDefinition('weapons', preset.weapon).label.toLowerCase());
  return parts.join(', ');
}

function renderBattlePanel() {
  const panel = document.getElementById('battle-panel');
  document.querySelectorAll('[data-battle-category]').forEach(b => b.classList.toggle('active', b.dataset.battleCategory === battle.category));
  document.querySelectorAll('[data-battle-gear]').forEach(b => b.classList.toggle('active', !!battle[b.dataset.battleGear]));
  // the faction sub-tabs (#166)
  const factions = document.getElementById('battle-factions');
  factions.innerHTML = '';
  for (const f of Object.values(GAME_CONFIG.factions).filter(f => f.ready)) {
    const b = document.createElement('button');
    b.className = 'fps-option' + (battle.faction === f.id ? ' active' : '');
    b.dataset.battleFaction = f.id;
    b.textContent = f.label;
    onTap(b, () => setBattleFaction(f.id));
    factions.appendChild(b);
  }
  panel.dataset.category = battle.category;
  const presets = document.getElementById('battle-presets');
  presets.innerHTML = '';
  const add = (id, active, label, pick) => {
    const button = document.createElement('button');
    button.className = 'btn' + (active ? ' active' : '');
    button.dataset.preset = id;
    setRichText(button, label);
    onTap(button, () => { pick(); renderBattlePanel(); });
    presets.appendChild(button);
  };
  if (battle.category === 'buildings') {
    for (const id of getBattleBuildings()) {
      const def = getDefinition('buildings', id);
      add(id, battle.building === id, `[[${def.icon}]] ${def.label}`, () => { battle.building = id; });
    }
  } else {
    for (const preset of getBattlePresetsShown()) {
      const def = preset.enemy ? GAME_CONFIG.enemies[preset.enemy] : preset;
      const weapon = getDefinition('weapons', def.weapon);
      const icon = preset.tool ? getDefinition('tools', preset.tool).icon : weapon && weapon.icon;
      add(preset.id, battle.preset === preset.id, `${icon ? `[[${icon}]]` : ''} ${battlePresetLabel(preset)}`, () => { battle.preset = preset.id; });
    }
  }
  panel.dataset.phase = battle.phase;
  document.body.dataset.battlePhase = battle.phase;
}

// The presets the panel shows now: the category's side, the chosen faction's
function getBattlePresetsShown() {
  return BATTLE_PRESETS.filter(p => !!p.enemy === (battle.category === 'enemy') && p.faction === battle.faction);
}

function getBattleBuildings() {
  return BATTLE_BUILDINGS.filter(id => { const f = getDefinition('buildings', id).factions; return !f || f.includes(battle.faction); });
}

// Switching category or faction picks the first unit shown (so a tap never places from another one)
function setBattleCategory(category) {
  battle.category = category;
  pickShownPreset();
  renderBattlePanel();
}

function setBattleFaction(faction) {
  battle.faction = faction;
  pickShownPreset();
  renderBattlePanel();
}

function pickShownPreset() {
  if (battle.category === 'buildings') {
    if (!getBattleBuildings().includes(battle.building)) battle.building = getBattleBuildings()[0];
  } else if (!getBattlePresetsShown().some(p => p.id === battle.preset)) {
    battle.preset = getBattlePresetsShown()[0].id;
  }
}

document.getElementById('mode-battles').disabled = false;
onTap(document.getElementById('mode-battles'), startBattleMode);
onTap(document.getElementById('battle-fight'), startBattleFight);
onTap(document.getElementById('battle-cancel'), cancelBattleFight);
onTap(document.getElementById('battle-clear-green'), () => clearBattleSide('green'));
onTap(document.getElementById('battle-clear-red'), () => clearBattleSide('red'));
document.querySelectorAll('[data-battle-category]').forEach(b => onTap(b, () => setBattleCategory(b.dataset.battleCategory)));
document.querySelectorAll('[data-battle-gear]').forEach(b => onTap(b, () => { battle[b.dataset.battleGear] = !battle[b.dataset.battleGear]; renderBattlePanel(); }));
