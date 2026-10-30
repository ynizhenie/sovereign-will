// The battle's panel: units and buildings by faction, what to place, armour and shield; its buttons

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { closeSheet, escapeHtml, hidePlacing, iconHtml, richText, setRichText, showPlacing, toggleSheet } from '../../ui/index.js';
import { isRangedWeapon } from '../../domains/colony/equipment/index.js';
import { onTap, t } from '../../engine/platform/index.js';
import { game } from '../../engine/world/index.js';
import { setBattleColor, sides } from '../../domains/factions/index.js';
import { BATTLE_PRESETS, battlePresetLabel, bigPresetOf, getBattleBuildings } from './battle.roster.js';
import { battle, battleArmor, clearBattleSide, setBattleDifficulty, setBattleField, setBattleLook, startBattleMode } from './battle.setup.js';
import { cancelBattleFight, startBattleFight } from './battle.rules.js';

export function renderBattlePanel() {
  const panel = document.getElementById('battle-panel');
  document.querySelectorAll('[data-battle-gear]').forEach(b => b.classList.toggle('on', !!battle[/** @type {'armor' | 'shield' | 'banner' | 'torch' | 'big'} */ (b.dataset.battleGear)]));
  // (#326) the time of day, the weather, blighted ground
  document.querySelectorAll('[data-battle-look]').forEach(b => {
    b.classList.toggle('on', String(battle[/** @type {'time' | 'weather' | 'blight'} */ (b.dataset.battleLook)]) === b.dataset.value);
    /** @type {HTMLButtonElement} */ (b).disabled = battle.phase !== 'setup';
  });
  // (#298) the armour button says which: leather, iron, or just "armour" off
  const armourButton = document.querySelector('[data-battle-gear="armor"]');
  if (armourButton) setRichText(/** @type {HTMLElement} */ (armourButton), t(battle.armor === 'leather' ? 'battle.armorLeather' : battle.armor ? 'battle.armorIron' : 'battle.noArmor'));
  document.querySelectorAll('[data-battle-field]').forEach(b => {
    b.classList.toggle('on', b.dataset.battleField === battle.field);
    /** @type {HTMLButtonElement} */ (b).disabled = battle.phase !== 'setup';
  });
  document.querySelectorAll('[data-battle-difficulty]').forEach(b => b.classList.toggle('on', b.dataset.battleDifficulty === battle.difficulty));
  // what the chosen difficulty does to the red side (#255)
  const hint = document.getElementById('battle-difficulty-hint');
  if (hint) {
    hint.dataset.i18n = battle.difficulty === 'hard' ? 'battle.hardHint' : 'battle.normalHint';
    setRichText(hint, t(hint.dataset.i18n));
  }
  document.querySelectorAll('[data-battle-auto]').forEach(b => b.classList.toggle('on', (b.dataset.battleAuto === 'on') === battle.auto));
  renderBattleColors();
  renderBattleMusic();
  document.getElementById('battle-auto').classList.toggle('on', battle.auto);
  panel.dataset.category = battle.category;
  const presets = document.getElementById('battle-presets');
  presets.innerHTML = '';
  // picked: the sheet steps aside for the field, the chip says what a tap places
  let chosen = '';
  // (#326) in sections under headings, as Endless's Build and Craft: no sub-tabs. Units: a faction each;
  // buildings: everyone's, then each faction's own
  let grid = presets;
  const section = title => {
    const heading = document.createElement('div');
    heading.className = 'panel-heading';
    heading.textContent = title;
    grid = document.createElement('div');
    grid.className = 'tile-grid';
    presets.append(heading, grid);
  };
  // a tile (as Endless's, #255): its icons and name, and under them what it is in a fight
  const add = (id, active, icons, name, stats, pick) => {
    const button = document.createElement('button');
    button.className = 'btn tile' + (active ? ' active' : '');
    button.dataset.preset = id;
    button.innerHTML = `<span class="tile-name">${icons.map(i => iconHtml(i)).join('')} <b>${escapeHtml(name)}</b></span> <span class="tile-cost">${richText(stats)}</span>`;
    onTap(button, () => { pick(); closeSheet(); renderBattlePanel(); });
    grid.appendChild(button);
    if (active) chosen = /** @type {HTMLElement} */ (button.querySelector('.tile-name')).innerHTML;
  };
  const factions = Object.values(GAME_CONFIG.factions).filter(f => f.ready);
  if (battle.category === 'buildings') {
    for (const faction of [null, ...factions]) {
      const ids = getBattleBuildings(faction && faction.id);
      if (!ids.length) continue;
      section(faction ? faction.label : t('battle.buildingsCommon'));
      for (const id of ids) {
        const def = getDefinition('buildings', id);
        add(id, battle.building === id, [def.icon], def.label, `[[heart]]${(def.build && def.build.hp) || ''}`, () => { battle.building = id; });
      }
    }
  } else {
    for (const faction of factions) {
      section(faction.label);
      for (const preset of BATTLE_PRESETS.filter(p => p.faction === faction.id && p.size !== 'big')) {
        const shown = (battle.big && bigPresetOf(preset)) || preset; // (#326: as a big one, when the switch is on)
        const { icons, hp, damage } = presetStats(shown);
        add(preset.id, battle.preset === preset.id, icons, battlePresetLabel(shown), `[[heart]]${hp} [[swords]]${damage}`, () => { battle.preset = preset.id; });
      }
    }
  }
  panel.dataset.phase = battle.phase;
  document.body.dataset.battlePhase = battle.phase;
  if (battle.phase === 'setup') showPlacing(chosen);
  else { hidePlacing(); closeSheet(); }
  updateBattleTop();
}

// What a unit is: its icons (kind and weapon or tool), hp, and damage (a hit's, an arrow's), with the
// armour picked (as one of yours: on the red half the difficulty may take some hp off)
function presetStats(preset) {
  const kind = GAME_CONFIG.settlerTypes[preset.type], weapon = getDefinition('weapons', preset.weapon);
  const tool = preset.tool && getDefinition('tools', preset.tool);
  const hit = kind.bite ? kind.bite.damage : kind.pet ? 0 : preset.weapon === 'fist' && tool && tool.combatDamage ? tool.combatDamage : weapon.combat.damage;
  const armour = kind.pet ? null : battleArmor(battle.armor);
  const hp = kind.hp + (armour && !isRangedWeapon(preset.weapon) ? armour.hpBonus : 0);
  return { icons: [kind.icon, tool ? tool.icon : weapon.icon], hp, damage: Math.round(hit * kind.damageMultiplier) };
}

// The top bar's middle: placing, fighting or who won, and how many stand on each side
export function updateBattleTop() {
  // (#326: who won is said in the middle of the field, not up here)
  const label = battle.phase === 'fight' ? t('battle.phase.fight') : t('battle.phase.setup');
  document.getElementById('battle-phase-label').textContent = label;
  // (#326) each side's broom on its colour
  for (const side of /** @type {('green' | 'red')[]} */ (['green', 'red'])) {
    document.getElementById(`battle-clear-${side}`).style.background = sides.battle[side];
    document.getElementById(`battle-count-${side}`).style.color = sides.battle[side];
  }
  document.getElementById('battle-count-green').textContent = String(game.settlers.length);
  document.getElementById('battle-count-red').textContent = String(game.enemies.length);
}

// The dock's category: its sheet's units or buildings (what was picked in each is kept)
export function setBattleCategory(category) {
  battle.category = category;
  renderBattlePanel();
}

// (#306) the sides' colours: a swatch each, the other side's taken
function renderBattleColors() {
  for (const side of /** @type {('green' | 'red')[]} */ (['green', 'red'])) {
    const row = document.getElementById(`battle-colors-${side}`);
    if (!row) continue;
    const other = side === 'green' ? sides.battle.red : sides.battle.green;
    row.innerHTML = '';
    for (const color of GAME_CONFIG.factionColors) {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch' + (sides.battle[side] === color ? ' active' : '');
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.disabled = color === other;
      swatch.setAttribute('aria-label', color);
      onTap(swatch, () => { setBattleColor(side, color); renderBattlePanel(); });
      row.appendChild(swatch);
    }
  }
}

// (#326) Whose music: the Battles' own, or a faction's; the game picks the track for the placing and the fight and
// for the time of day
function renderBattleMusic() {
  const box = document.getElementById('battle-music');
  if (!box) return;
  box.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'sub-tabs battle-music-row';
  box.appendChild(row);
  const button = (theme, label) => {
    const b = document.createElement('button');
    b.className = 'btn sub-tab' + (battle.theme === theme ? ' on' : '');
    b.dataset.theme = theme;
    b.textContent = label;
    onTap(b, () => { battle.theme = theme; renderBattlePanel(); });
    row.appendChild(b);
  };
  button('arena', t('battle.themeArena'));
  for (const faction of Object.values(GAME_CONFIG.factions).filter(f => f.ready && f.music)) button(faction.id, faction.label);
}

// What this file sets up as the game starts (called by app/boot.js)
export function initBattlePanel() {
  document.getElementById('mode-battles').disabled = false;
  onTap(document.getElementById('mode-battles'), startBattleMode);
  onTap(document.getElementById('battle-fight'), startBattleFight);
  onTap(document.getElementById('battle-cancel'), cancelBattleFight);
  onTap(document.getElementById('battle-clear-green'), () => clearBattleSide('green'));
  onTap(document.getElementById('battle-clear-red'), () => clearBattleSide('red'));
  // the dock: a category's sheet opens (again: closes)
  document.querySelectorAll('[data-battle-category]').forEach(b => onTap(b, () => {
    setBattleCategory(b.dataset.battleCategory);
    toggleSheet('battle', b.dataset.battleCategory);
  }));
  // (the armour: off, leather, iron, off again; the shield and the banner: on or off, #298, #279)
  document.querySelectorAll('[data-battle-gear]').forEach(b => onTap(b, () => {
    const gear = /** @type {'armor' | 'shield' | 'banner' | 'torch' | 'big'} */ (b.dataset.battleGear);
    if (gear === 'armor') battle.armor = !battle.armor ? 'leather' : battle.armor === 'leather' ? 'iron' : false;
    else battle[gear] = !battle[gear];
    renderBattlePanel();
  }));
  document.querySelectorAll('[data-battle-look]').forEach(b => onTap(b, () => {
    const key = /** @type {'time' | 'weather' | 'blight'} */ (b.dataset.battleLook);
    setBattleLook(key, key === 'blight' ? b.dataset.value === 'true' : b.dataset.value);
    renderBattlePanel();
  }));
  // the battle's settings (#255): the field, the difficulty, the auto battle (also by Fight! once it's on)
  document.querySelectorAll('[data-battle-field]').forEach(b => onTap(b, () => { setBattleField(b.dataset.battleField); renderBattlePanel(); }));
  document.querySelectorAll('[data-battle-difficulty]').forEach(b => onTap(b, () => { setBattleDifficulty(b.dataset.battleDifficulty); renderBattlePanel(); }));
  document.querySelectorAll('[data-battle-auto]').forEach(b => onTap(b, () => { battle.auto = b.dataset.battleAuto === 'on'; renderBattlePanel(); }));
  onTap(document.getElementById('battle-auto'), () => { battle.auto = !battle.auto; renderBattlePanel(); });
}
