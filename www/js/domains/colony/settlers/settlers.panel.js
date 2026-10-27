// The settlers in the panel: how many of each, and the selected one's info line

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { getResourceIconName, labelButton, makeTile, setRichText, setText } from '../../../ui/index.js';
import { camera, clampCamera, onTap, t } from '../../../engine/platform/index.js';
import { game } from '../../../engine/world/index.js';
import { getPlayerFaction } from '../../factions/index.js';
import { getPossessed, getUpgrade, spawnSettler, upgradeToBig } from './settlers.rules.js';
import { formatCost } from '../storage/index.js';
import { getMorale } from '../../conflict/morale/index.js';

export function updateUnitCounts() {
  const workers = game.settlers.filter(s => s.role === 'worker').length;
  const warriors = game.settlers.filter(s => s.role === 'soldier' || s.role === 'archer').length;

  const workersElem = document.getElementById('workers-cnt');
  const warriorsElem = document.getElementById('warriors-cnt');

  setText(workersElem, String(workers));
  setText(warriorsElem, String(warriors));
}

// The selected settler's info: what it's doing, when it's next hungry, what it carries (#326: a line each, all of it)
export function renderSettlerInfo(s) {
  const activity = `activity.${s.activity || 'patrol'}`;
  const parts = [t(activity) === activity ? t('activity.patrol') : t(activity)];
  parts.push(getPlayerFaction().eats ? t('info.hungry', { seconds: Math.max(0, Math.ceil(getHungerSeconds(s))) }) : t('info.noHunger'));
  if (s.temporary !== undefined) parts.push(t('info.crumbles', { seconds: Math.ceil(s.temporary) }));
  if ((s.trained || 0) >= 0.01) parts.push(t('info.trained', { n: Math.round(s.trained * 100) })); // (#199)
  parts.push(s.panic ? t('info.panic') : t('info.morale', { n: Math.round(getMorale(s)) })); // (#207)
  const items = s.carrying ? (s.carrying.items || [s.carrying]) : [];
  const carried = items.filter(item => item.amount > 0).map(item => `${Math.round(item.amount)}[[${getResourceIconName(item.type)}]]`).join(' ');
  if (carried) parts.push(`${t('info.carries')} ${carried}`);
  if (s.orderTarget || s.orderSpot) parts.push(t(s.orderTarget ? 'info.orderedAttack' : 'info.orderedHold')); // (#326)
  const info = document.getElementById('selected-info');
  info.hidden = false;
  document.getElementById('selected-bar').classList.add('has-settler');
  const text = parts.join('\n');
  if (info.dataset.text === text) return;
  info.dataset.text = text;
  info.innerHTML = '';
  for (const part of parts) { const line = document.createElement('div'); setRichText(line, part); info.appendChild(line); }
}

// Seconds until this settler eats next
export function getHungerSeconds(s) {
  return s.hunger !== undefined ? s.hunger : GAME_CONFIG.meals.seconds;
}

// While possessing: the camera follows the possessed settler
export function updatePossessionView() {
  const possessed = getPossessed();
  if (!possessed) return;
  camera.x = possessed.x;
  camera.y = possessed.y;
  clampCamera();
}

// Hiring at the town hall (#248, #261): a tile a unit, like every tab's (its icon, name and cost; a tap
// hires one); the upgrade the same
export function renderRecruitRow() {
  const recruit = document.getElementById('recruit-row');
  recruit.classList.add('tile-grid');
  const tile = (id, infoKey, item, action) => {
    const b = makeTile(item);
    b.id = id;
    b.dataset.info = infoKey;
    onTap(b, action);
    recruit.appendChild(b);
  };
  for (const type of getPlayerFaction().units) {
    const unit = GAME_CONFIG.settlerTypes[type];
    tile(`btn-hire-${type}`, `settlerTypes:${type}`, { icon: unit.icon, label: unit.label, cost: unit.hireCost }, () => spawnSettler(type));
  }
  const upgrade = getUpgrade();
  if (upgrade) {
    tile('btn-upgrade', `settlerTypes:${upgrade.big.id}`, { icon: upgrade.big.icon, label: t('hire.upgrade', { name: upgrade.big.label }), cost: upgrade.big.upgradeCost }, () => upgradeToBig());
    labelButton('btn-upgrade-big', t('btn.upgradeWorker', { icon: upgrade.big.icon, cost: formatCost(upgrade.big.upgradeCost) }));
  }
}
