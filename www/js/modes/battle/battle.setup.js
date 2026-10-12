// Battle mode (#38): an empty grass field split down the middle. The player places units of any faction:
// theirs on the green side (left), enemies on the red side (right), buildings anywhere; presses Fight, and
// they battle it out; the winner is shown and, a few seconds later, the same line-up comes back to adjust.
// A fight can be called off, and the player can possess one of theirs in it. Archers' arrows don't run
// out. Green units are settlers and red ones enemies, driven by the usual AI (#142, #166).

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

// The midline: left of it is green, right of it red
function battleSide(x) {
  return x < WORLD_WIDTH / 2 ? 'green' : 'red';
}

function makeBattleUnit(entry) {
  const preset = getBattlePreset(entry.presetId);
  if (preset.enemy) {
    const en = createConfiguredEnemy({ x: entry.x, y: entry.y }, preset.enemy);
    en.battleEntry = entry;
    en.facing = battleSide(entry.x) === 'green' ? 0 : Math.PI; // towards the other side, until they move
    enemies.push(en);
    return;
  }
  const archer = isBowWeapon(preset.weapon);
  const s = createSettler(preset.type, battle.nextId++, entry.x, entry.y);
  Object.assign(s, {
    weapon: preset.weapon, tool: preset.tool || 'none',
    role: archer ? 'archer' : preset.tool ? 'worker' : 'soldier', quiver: archer, quiverCapacity: 30, arrows: archer ? 30 : 0, battleEntry: entry
  });
  s.facing = battleSide(entry.x) === 'green' ? 0 : Math.PI;
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
