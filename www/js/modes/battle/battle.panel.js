// The battle's panel: categories, factions, what to place, armour and shield; its buttons

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { closeSheet, escapeHtml, hidePlacing, iconHtml, richText, setRichText, showPlacing, toggleSheet } from '../../ui/index.js';
import { enemyFactionOf, enemyStats } from '../../domains/conflict/waves/index.js';
import { isBowWeapon } from '../../domains/colony/equipment/index.js';
import { onTap, t } from '../../engine/platform/index.js';
import { game } from '../../engine/world/index.js';
import { battlePresetLabel, getBattleBuildings, getBattlePresetsShown } from './battle.roster.js';
import { battle, battleArmor, clearBattleSide, setBattleDifficulty, startBattleMode } from './battle.setup.js';
import { cancelBattleFight, startBattleFight } from './battle.rules.js';

export function renderBattlePanel() {
  const panel = document.getElementById('battle-panel');
  document.querySelectorAll('[data-battle-gear]').forEach(b => b.classList.toggle('on', !!battle[/** @type {'armor' | 'shield'} */ (b.dataset.battleGear)]));
  // (#298) the armour button says which: leather, iron, or just "armour" off
  const armourButton = document.querySelector('[data-battle-gear="armor"]');
  if (armourButton) setRichText(/** @type {HTMLElement} */ (armourButton), t(battle.armor === 'leather' ? 'battle.armorLeather' : battle.armor ? 'battle.armorIron' : 'battle.armor'));
  document.querySelectorAll('[data-battle-difficulty]').forEach(b => b.classList.toggle('on', b.dataset.battleDifficulty === battle.difficulty));
  document.querySelectorAll('[data-battle-auto]').forEach(b => b.classList.toggle('on', (b.dataset.battleAuto === 'on') === battle.auto));
  document.getElementById('battle-auto').classList.toggle('on', battle.auto);
  // the faction sub-tabs
  const factions = document.getElementById('battle-factions');
  factions.innerHTML = '';
  for (const f of Object.values(GAME_CONFIG.factions).filter(f => f.ready)) {
    const b = document.createElement('button');
    b.className = 'btn sub-tab' + (battle.faction === f.id ? ' on' : '');
    b.dataset.battleFaction = f.id;
    b.textContent = f.label;
    onTap(b, () => setBattleFaction(f.id));
    factions.appendChild(b);
  }
  panel.dataset.category = battle.category;
  const presets = document.getElementById('battle-presets');
  presets.innerHTML = '';
  // picked: the sheet steps aside for the field, the chip says what a tap places
  let chosen = '';
  // a tile (as Endless's, #255): its icons and name, and under them what it is in a fight
  const add = (id, active, icons, name, stats, pick) => {
    const button = document.createElement('button');
    button.className = 'btn tile' + (active ? ' active' : '');
    button.dataset.preset = id;
    button.innerHTML = `<span class="tile-name">${icons.map(i => iconHtml(i)).join('')} <b>${escapeHtml(name)}</b></span> <span class="tile-cost">${richText(stats)}</span>`;
    onTap(button, () => { pick(); closeSheet(); renderBattlePanel(); });
    presets.appendChild(button);
    if (active) chosen = /** @type {HTMLElement} */ (button.querySelector('.tile-name')).innerHTML;
  };
  if (battle.category === 'buildings') {
    for (const id of getBattleBuildings()) {
      const def = getDefinition('buildings', id);
      add(id, battle.building === id, [def.icon], def.label, `[[heart]]${(def.build && def.build.hp) || ''}`, () => { battle.building = id; });
    }
  } else {
    for (const preset of getBattlePresetsShown()) {
      const { icons, hp, damage } = presetStats(preset);
      add(preset.id, battle.preset === preset.id, icons, battlePresetLabel(preset), `[[heart]]${hp} [[swords]]${damage}`, () => { battle.preset = preset.id; });
    }
  }
  panel.dataset.phase = battle.phase;
  document.body.dataset.battlePhase = battle.phase;
  if (battle.phase === 'setup') showPlacing(chosen);
  else { hidePlacing(); closeSheet(); }
  updateBattleTop();
}

// What a unit is: its icons (kind and weapon or tool), hp, and damage (a hit's; an enemy's per second in
// melee, an arrow's), with the armour picked and the difficulty
function presetStats(preset) {
  if (preset.enemy) {
    const def = GAME_CONFIG.enemies[preset.enemy], units = enemyFactionOf(preset.enemy).units || ['normal', 'big'];
    const kind = GAME_CONFIG.settlerTypes[def.type === 'big' ? units[1] || units[0] : units[0]];
    const weapon = getDefinition('weapons', def.weapon), tool = def.tool && getDefinition('tools', def.tool);
    const look = def.necromancer ? 'necromancer' : kind && kind.icon;
    const stats = enemyStats(preset.enemy);
    const armour = battleArmor(battle.armor);
    if (armour) stats.hp += armour.hpBonus; // (#279; #298 its kind's)
    return { icons: [look, tool ? tool.icon : weapon && weapon.icon].filter(Boolean), ...stats };
  }
  const kind = GAME_CONFIG.settlerTypes[preset.type], weapon = getDefinition('weapons', preset.weapon);
  const tool = preset.tool && getDefinition('tools', preset.tool);
  const hit = preset.weapon === 'fist' && tool && tool.combatDamage ? tool.combatDamage : weapon.combat.damage;
  const armour = battleArmor(battle.armor);
  const hp = kind.hp + (armour && !isBowWeapon(preset.weapon) ? armour.hpBonus : 0);
  return { icons: [kind.icon, tool ? tool.icon : weapon.icon], hp, damage: Math.round(hit * kind.damageMultiplier) };
}

// The top bar's middle: placing, fighting or who won, and how many stand on each side
export function updateBattleTop() {
  const label = battle.phase === 'fight' ? t('battle.phase.fight')
    : battle.phase === 'result' ? t(battle.winner === 'green' ? 'battle.greenWins' : battle.winner === 'red' ? 'battle.redWins' : 'battle.drawWins')
    : t('battle.phase.setup');
  document.getElementById('battle-phase-label').textContent = label;
  document.getElementById('battle-count-green').textContent = String(game.settlers.length);
  document.getElementById('battle-count-red').textContent = String(game.enemies.length);
}

// Switching category or faction picks the first unit shown (so a tap never places from another one)
export function setBattleCategory(category) {
  battle.category = category;
  pickShownPreset();
  renderBattlePanel();
}

export function setBattleFaction(faction) {
  battle.faction = faction;
  pickShownPreset();
  renderBattlePanel();
}

export function pickShownPreset() {
  if (battle.category === 'buildings') {
    if (!getBattleBuildings().includes(battle.building)) battle.building = getBattleBuildings()[0];
  } else if (!getBattlePresetsShown().some(p => p.id === battle.preset)) {
    battle.preset = getBattlePresetsShown()[0].id;
  }
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
  // (the armour: off, leather, iron, off again; the shield: on or off, #298)
  document.querySelectorAll('[data-battle-gear]').forEach(b => onTap(b, () => {
    const gear = /** @type {'armor' | 'shield'} */ (b.dataset.battleGear);
    if (gear === 'armor') battle.armor = !battle.armor ? 'leather' : battle.armor === 'leather' ? 'iron' : false;
    else battle.shield = !battle.shield;
    renderBattlePanel();
  }));
  // the battle's settings (#255): the difficulty, the auto battle (also by Fight! once it's on)
  document.querySelectorAll('[data-battle-difficulty]').forEach(b => onTap(b, () => { setBattleDifficulty(b.dataset.battleDifficulty); renderBattlePanel(); }));
  document.querySelectorAll('[data-battle-auto]').forEach(b => onTap(b, () => { battle.auto = b.dataset.battleAuto === 'on'; renderBattlePanel(); }));
  onTap(document.getElementById('battle-auto'), () => { battle.auto = !battle.auto; renderBattlePanel(); });
}
