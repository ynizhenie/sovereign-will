// The top bar and the resource tiles: the wave and its timer, the base, settlers, the stock, the seed

import { GAME_CONFIG, getDefinition } from '../content/configs/index.js';
import { setRichText } from './icons.js';
import { t } from '../engine/platform/index.js';
import { game, townHall } from '../engine/world/index.js';
import { getCurrentPop, getMaxPop, getSelectedSettler, getUpgrade, renderSettlerInfo } from '../domains/colony/settlers/index.js';
import { countHeld, getHeldItems, hasGear } from '../domains/colony/equipment/index.js';
import { getResourceAmount, syncFoodMix } from '../domains/colony/storage/index.js';

export function updateUI() {
  document.getElementById('wave-num').innerText = String(game.waveNum);
  document.getElementById('wave-timer').innerText = String(Math.ceil(game.waveTimer));
  Object.keys(GAME_CONFIG.resources).forEach(resourceKey => {
    const resourceElement = document.getElementById(resourceHudId(resourceKey));
    if (resourceElement) resourceElement.innerText = String(Math.floor(getResourceAmount(resourceKey)));
  });
  syncFoodMix();
  for (const kind of Object.keys(GAME_CONFIG.foodKinds)) {
    const el = document.getElementById(`food-kind-${kind}-txt`);
    if (el) el.innerText = String(Math.floor(game.foodMix[kind] || 0));
  }
  for (const group of GAME_CONFIG.resourceGroups.filter(g => g.held)) {
    let total = 0;
    for (const [category, id] of getHeldItems(group)) {
      const count = countHeld(category, id);
      total += count;
      const el = document.getElementById(`held-${category}-${id}-txt`);
      if (el) el.innerText = String(count);
    }
    const totalEl = document.getElementById(`group-${group.id}-txt`);
    if (totalEl) totalEl.innerText = String(total);
  }
  for (const group of GAME_CONFIG.resourceGroups.filter(g => !g.held)) {
    const total = document.getElementById(`group-${group.id}-txt`);
    let sum = 0;
    for (const id of group.members) sum += getResourceAmount(id);
    if (total) total.innerText = String(Math.floor(sum));
  }
  document.getElementById('pop-txt').innerText = `${getCurrentPop()}/${getMaxPop()}`;
  document.getElementById('base-hp-txt').innerText = `${Math.max(0, Math.ceil(townHall.hp))}/${townHall.maxHp}`;

  let btnUpgrade = document.getElementById('btn-upgrade-big');

  if (getSelectedSettler()) {
    const type = GAME_CONFIG.settlerTypes[game.selectedSettler.type] || GAME_CONFIG.settlerTypes.normal;
    let name = `[[${type.icon}]] ${type.label}`;
    let wName = getDefinition('weapons', game.selectedSettler.weapon)?.label || game.selectedSettler.weapon;
    let tName = game.selectedSettler.tool === 'none' ? '' : ' / ' + (getDefinition('tools', game.selectedSettler.tool)?.label || game.selectedSettler.tool);
    let aName = game.selectedSettler.armor === 'iron' ? ` / ${t('hud.ironArmor')}` : '';
    let qName = game.selectedSettler.quiver ? ` / ${t('hud.quiver', { n: game.selectedSettler.arrows || 0 })}` : '';
    // the rest of what it wears
    const gear = ['shield', 'backpack', 'wateringCan'].filter(id => hasGear(game.selectedSettler, id)).map(id => ` / [[${GAME_CONFIG.gear[id].icon}]]`).join('');
    setRichText(document.getElementById('selected-settler-txt'), `${name} (${wName}${tName}${aName}${qName}${gear})`);
    renderSettlerInfo(game.selectedSettler);
    document.getElementById('btn-deselect').style.display = 'inline-block';
    if (btnUpgrade) {
      btnUpgrade.style.display = getUpgrade() && game.selectedSettler.type === getUpgrade().from ? 'block' : 'none';
    }
  } else {
    game.selectedSettler = null;
    document.getElementById('selected-settler-txt').innerText = t('hud.nobody');
    document.getElementById('selected-info').hidden = true;
    document.getElementById('selected-bar').classList.remove('has-settler');
    document.getElementById('btn-deselect').style.display = 'none';
    if (btnUpgrade) {
      btnUpgrade.style.display = 'none';
    }
  }

}

export function resourceHudId(resourceKey) {
  return `resource-${resourceKey}-txt`;
}

// Open a resource group's row (closing any other), or close it if it's open
export function toggleResourceGroup(groupId) {
  for (const group of GAME_CONFIG.resourceGroups) {
    const row = document.getElementById(`group-${group.id}-members`);
    const tile = document.getElementById(`group-${group.id}`);
    if (!row) continue;
    row.hidden = group.id === groupId ? !row.hidden : true;
    if (tile) tile.classList.toggle('open', !row.hidden);
  }
}

export function updateSeedHud() {
  const seedElem = document.getElementById('hud-seed');
  if (seedElem && game.worldSeed) {
    seedElem.innerText = game.worldSeed.value;
  }
}
