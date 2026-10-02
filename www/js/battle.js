// Battle mode (#38): an empty grass field split down the middle. The player places the colony's units on
// the green side (left) and enemies on the red side (right), and buildings anywhere, presses Fight, and
// they battle it out; the winner is shown and, a few seconds later, the same line-up comes back to adjust.
// Green units are settlers and red ones enemies, driven by the usual AI (#142).

// The panel's categories: the colony's units (green side), enemies (red side), buildings (either side)
const BATTLE_CATEGORIES = ['own', 'enemy', 'buildings'];

// Colony units: a weapon, a body (big or not) and hp; armour and a shield come from the panel's toggles.
// Enemies: an enemy kind from GAME_CONFIG.enemies, with its own stats.
const BATTLE_PRESETS = [
  { id: 'fist', weapon: 'fist', hp: 100 },
  { id: 'club', weapon: 'club', hp: 100 },
  { id: 'sword', weapon: 'sword', hp: 100 },
  { id: 'spear', weapon: 'spear', hp: 100 },
  { id: 'iron_sword', weapon: 'iron_sword', hp: 100 },
  { id: 'iron_spear', weapon: 'iron_spear', hp: 100 },
  { id: 'bow', weapon: 'bow', hp: 100 },
  { id: 'big_club', weapon: 'club', hp: 250, big: true },
  { id: 'big_spear', weapon: 'spear', hp: 250, big: true },
  { id: 'raider_club', enemy: 'raider_club' },
  { id: 'raider', enemy: 'raider' },
  { id: 'brute', enemy: 'brute' },
  { id: 'raider_archer', enemy: 'raider_archer' }
];

const BATTLE_BUILDINGS = ['wall_wood', 'wall_stone', 'door', 'spikes', 'watchtower'];

const BATTLE_RESULT_SECONDS = 4;

const battle = {
  phase: 'off',       // off / setup / fight / result
  category: 'own',    // the panel's category
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
  const s = createSettler(preset.big ? 'big' : 'normal', battle.nextId++, entry.x, entry.y);
  Object.assign(s, {
    hp: preset.hp, maxHp: preset.hp, weapon: preset.weapon, tool: 'none',
    role: archer ? 'archer' : 'soldier', quiver: archer, quiverCapacity: 30, arrows: archer ? 30 : 0, battleEntry: entry
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
  waveTimer = Infinity; foodTimer = Infinity; boarRespawnTimer = Infinity;
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

function renderBattlePanel() {
  const panel = document.getElementById('battle-panel');
  document.querySelectorAll('[data-battle-category]').forEach(b => b.classList.toggle('active', b.dataset.battleCategory === battle.category));
  document.querySelectorAll('[data-battle-gear]').forEach(b => b.classList.toggle('active', !!battle[b.dataset.battleGear]));
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
    for (const id of BATTLE_BUILDINGS) {
      const def = getDefinition('buildings', id);
      add(id, battle.building === id, `[[${def.icon}]] ${def.label}`, () => { battle.building = id; });
    }
  } else {
    for (const preset of BATTLE_PRESETS.filter(p => !!p.enemy === (battle.category === 'enemy'))) {
      const weapon = getDefinition('weapons', preset.enemy ? GAME_CONFIG.enemies[preset.enemy].weapon : preset.weapon);
      add(preset.id, battle.preset === preset.id, `${weapon ? `[[${weapon.icon}]]` : ''} ${t(`preset.${preset.id}`)}`, () => { battle.preset = preset.id; });
    }
  }
  panel.dataset.phase = battle.phase;
}

// Switching category picks that category's first unit (so a tap never places from another category)
function setBattleCategory(category) {
  battle.category = category;
  if (category !== 'buildings') {
    const current = getBattlePreset(battle.preset);
    if (!!current.enemy !== (category === 'enemy')) battle.preset = BATTLE_PRESETS.find(p => !!p.enemy === (category === 'enemy')).id;
  }
  renderBattlePanel();
}

document.getElementById('mode-battles').disabled = false;
onTap(document.getElementById('mode-battles'), startBattleMode);
onTap(document.getElementById('battle-fight'), startBattleFight);
onTap(document.getElementById('battle-clear-green'), () => clearBattleSide('green'));
onTap(document.getElementById('battle-clear-red'), () => clearBattleSide('red'));
onTap(document.getElementById('battle-menu'), leaveBattleMode);
document.querySelectorAll('[data-battle-category]').forEach(b => onTap(b, () => setBattleCategory(b.dataset.battleCategory)));
document.querySelectorAll('[data-battle-gear]').forEach(b => onTap(b, () => { battle[b.dataset.battleGear] = !battle[b.dataset.battleGear]; renderBattlePanel(); }));
