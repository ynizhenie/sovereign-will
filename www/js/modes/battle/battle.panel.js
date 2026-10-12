// The battle's panel: categories, factions, what to place, armour and shield; its buttons

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { setRichText } from '../../ui/index.js';
import { onTap } from '../../engine/platform/index.js';
import { battlePresetLabel, getBattleBuildings, getBattlePresetsShown } from './battle.roster.js';
import { battle, clearBattleSide, startBattleMode } from './battle.setup.js';
import { cancelBattleFight, startBattleFight } from './battle.rules.js';

export function renderBattlePanel() {
  const panel = document.getElementById('battle-panel');
  document.querySelectorAll('[data-battle-category]').forEach(b => b.classList.toggle('active', b.dataset.battleCategory === battle.category));
  document.querySelectorAll('[data-battle-gear]').forEach(b => b.classList.toggle('active', !!battle[b.dataset.battleGear]));
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
  document.querySelectorAll('[data-battle-category]').forEach(b => onTap(b, () => setBattleCategory(b.dataset.battleCategory)));
  document.querySelectorAll('[data-battle-gear]').forEach(b => onTap(b, () => { battle[b.dataset.battleGear] = !battle[b.dataset.battleGear]; renderBattlePanel(); }));
}
