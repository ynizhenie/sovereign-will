// The battle's panel: categories, factions, what to place, armour and shield; its buttons

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { closeSheet, hidePlacing, setRichText, showPlacing, toggleSheet } from '../../ui/index.js';
import { onTap, t } from '../../engine/platform/index.js';
import { game } from '../../engine/world/index.js';
import { battlePresetLabel, getBattleBuildings, getBattlePresetsShown } from './battle.roster.js';
import { battle, clearBattleSide, startBattleMode } from './battle.setup.js';
import { cancelBattleFight, startBattleFight } from './battle.rules.js';

export function renderBattlePanel() {
  const panel = document.getElementById('battle-panel');
  document.querySelectorAll('[data-battle-gear]').forEach(b => b.classList.toggle('active', !!battle[/** @type {'armor' | 'shield'} */ (b.dataset.battleGear)]));
  // the faction sub-tabs
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
  // picked: the sheet steps aside for the field, the chip says what a tap places
  let chosen = '';
  const add = (id, active, label, pick) => {
    const button = document.createElement('button');
    button.className = 'btn' + (active ? ' active' : '');
    button.dataset.preset = id;
    setRichText(button, label);
    onTap(button, () => { pick(); closeSheet(); renderBattlePanel(); });
    presets.appendChild(button);
    if (active) chosen = button.innerHTML;
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
  if (battle.phase === 'setup') showPlacing(chosen);
  else { hidePlacing(); closeSheet(); }
  updateBattleTop();
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
  document.querySelectorAll('[data-battle-gear]').forEach(b => onTap(b, () => { const gear = /** @type {'armor' | 'shield'} */ (b.dataset.battleGear); battle[gear] = !battle[gear]; renderBattlePanel(); }));
}
