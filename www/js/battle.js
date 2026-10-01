// Battle mode (#38): an empty grass field split down the middle. The player places units from presets,
// green on the left and red on the right, presses Fight, and they battle it out; the winner is shown and,
// a few seconds later, the same line-up comes back to adjust.
//
// Green units are settlers and red ones enemies, driven by the usual AI. Any preset can go on either side:
// on the red side a settler preset becomes an enemy with that weapon and hp, and on the green side an
// enemy preset becomes a soldier with that enemy's weapon and hp.

// Presets: a weapon, a body (big or not) and hp. `enemy` names the enemy kind a red unit is made from.
const BATTLE_PRESETS = [
  { id: 'fist', weapon: 'fist', hp: 100, enemy: 'raider_club' },
  { id: 'club', weapon: 'club', hp: 100, enemy: 'raider_club' },
  { id: 'sword', weapon: 'sword', hp: 100, enemy: 'raider' },
  { id: 'spear', weapon: 'spear', hp: 100, enemy: 'raider' },
  { id: 'iron_sword', weapon: 'iron_sword', hp: 100, enemy: 'raider' },
  { id: 'iron_spear', weapon: 'iron_spear', hp: 100, enemy: 'raider' },
  { id: 'bow', weapon: 'bow', hp: 100, enemy: 'raider_archer' },
  { id: 'big_club', weapon: 'club', hp: 250, big: true, enemy: 'brute' },
  { id: 'big_spear', weapon: 'spear', hp: 250, big: true, enemy: 'brute' },
  { id: 'raider_club', enemyPreset: 'raider_club' },
  { id: 'raider', enemyPreset: 'raider' },
  { id: 'brute', enemyPreset: 'brute' },
  { id: 'raider_archer', enemyPreset: 'raider_archer' }
];

const BATTLE_RESULT_SECONDS = 4;

const battle = {
  phase: 'off',       // off / setup / fight / result
  preset: 'sword',    // the preset the next tap places
  lineup: [],         // { presetId, x, y }: what's placed, kept between fights
  winner: null,       // green / red / draw
  resultTimer: 0,
  nextId: 1,
  savedMapSettings: null
};

function getBattlePreset(id) {
  return BATTLE_PRESETS.find(p => p.id === id);
}

// What a preset is as a fighter: weapon, big or not, hp (an enemy preset brings its kind's own)
function presetBody(preset) {
  if (preset.enemyPreset) {
    const def = GAME_CONFIG.enemies[preset.enemyPreset];
    return { weapon: def.weapon || 'sword', big: def.type === 'big', hp: def.hp, enemyKey: preset.enemyPreset };
  }
  return { weapon: preset.weapon, big: !!preset.big, hp: preset.hp, enemyKey: preset.enemy };
}

// The midline: left of it is green, right of it red
function battleSide(x) {
  return x < WORLD_WIDTH / 2 ? 'green' : 'red';
}

function makeBattleUnit(entry) {
  const body = presetBody(getBattlePreset(entry.presetId));
  if (battleSide(entry.x) === 'green') {
    const type = body.big ? 'big' : 'normal';
    const archer = isBowWeapon(body.weapon);
    const s = createSettler(type, battle.nextId++, entry.x, entry.y);
    Object.assign(s, {
      hp: body.hp, maxHp: body.hp, weapon: body.weapon, tool: 'none',
      role: archer ? 'archer' : 'soldier', quiver: archer, quiverCapacity: 30, arrows: archer ? 30 : 0, battleEntry: entry
    });
    settlers.push(s);
  } else {
    const en = createConfiguredEnemy({ x: entry.x, y: entry.y }, body.enemyKey);
    const weapon = getDefinition('weapons', body.weapon);
    en.weapon = body.weapon;
    en.hp = en.maxHp = body.hp;
    if (body.big) { en.type = 'big'; en.radius = Math.max(en.radius, 18); }
    // a settler weapon on the red side: its strike as damage per second, like the enemies' own
    if (!getBattlePreset(entry.presetId).enemyPreset && weapon && weapon.combat && weapon.combat.cooldown && !isBowWeapon(body.weapon)) {
      en.damage = weapon.combat.damage / weapon.combat.cooldown * (body.big ? GAME_CONFIG.settlerTypes.big.damageMultiplier : 1);
    }
    en.battleEntry = entry;
    enemies.push(en);
  }
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
  settlers = []; enemies = []; projectiles = []; corpses = []; bloodSplats = []; dung = [];
  for (const entry of battle.lineup) makeBattleUnit(entry);
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

// A tap during setup: place the chosen preset on an empty tile, or take away the unit standing there
function battleTap(x, y) {
  if (battle.phase !== 'setup') return;
  const g = getGridPos(x, y);
  if (isBorderZone(g.gx, g.gy)) return;
  const cx = g.gx * TILE_SIZE + 15, cy = g.gy * TILE_SIZE + 15;
  const existing = battle.lineup.find(e => e.x === cx && e.y === cy);
  if (existing) battle.lineup.splice(battle.lineup.indexOf(existing), 1);
  else battle.lineup.push({ presetId: battle.preset, x: cx, y: cy });
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
  const presets = document.getElementById('battle-presets');
  presets.innerHTML = '';
  for (const preset of BATTLE_PRESETS) {
    const button = document.createElement('button');
    button.className = 'btn' + (battle.preset === preset.id ? ' active' : '');
    button.dataset.preset = preset.id;
    const body = presetBody(preset);
    const weapon = getDefinition('weapons', body.weapon);
    setRichText(button, `${weapon ? `[[${weapon.icon}]]` : ''} ${t(`preset.${preset.id}`)}`);
    button.addEventListener('click', () => { battle.preset = preset.id; renderBattlePanel(); });
    presets.appendChild(button);
  }
  panel.dataset.phase = battle.phase;
}

document.getElementById('mode-battles').disabled = false;
onTap(document.getElementById('mode-battles'), startBattleMode);
onTap(document.getElementById('battle-fight'), startBattleFight);
onTap(document.getElementById('battle-clear'), () => { if (battle.phase === 'setup') { battle.lineup = []; resetBattleUnits(); } });
onTap(document.getElementById('battle-menu'), leaveBattleMode);
