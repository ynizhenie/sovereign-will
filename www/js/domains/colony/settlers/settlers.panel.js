// The settlers in the panel: how many of each, and the selected one's info line

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { escapeHtml, getResourceIconName, iconHtml, labelButton, richText, setRichText } from '../../../ui/index.js';
import { camera, clampCamera, isTouchScreen, onTap, t } from '../../../engine/platform/index.js';
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

  if (workersElem) workersElem.innerText = String(workers);
  if (warriorsElem) warriorsElem.innerText = String(warriors);
}

// The selected settler's info line: what it's doing, when it's next hungry, what it carries
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
  const info = document.getElementById('selected-info');
  info.hidden = false;
  document.getElementById('selected-bar').classList.add('has-settler'); // a fixed size, whatever it carries
  setRichText(info, parts.join(' · '));
}

// Seconds until this settler eats next
export function getHungerSeconds(s) {
  return s.hunger !== undefined ? s.hunger : GAME_CONFIG.meals.seconds;
}

// While possessing: the camera follows the possessed settler; the joystick shows on a touch screen
export function updatePossessionView() {
  const possessed = getPossessed();
  const joystickEl = document.getElementById('mobile-joystick');

  if (possessed) {
    camera.x = possessed.x;
    camera.y = possessed.y;
    clampCamera();

    const shown = isTouchScreen() ? 'block' : 'none';
    if (joystickEl.style.display !== shown) joystickEl.style.display = shown;
  } else {
    if (joystickEl.style.display !== 'none') joystickEl.style.display = 'none';
  }
}

// Hiring at the town hall (#248): a list like the craft lists, a row each: the unit in its tile (icon, name,
// cost) and on its right its description and Hire; the upgrade the same
export function renderRecruitRow() {
  const recruit = document.getElementById('recruit-row');
  recruit.classList.add('craft-list');
  const row = (id, infoKey, tileHtml, buttonIcon, buttonTitle, action) => {
    const r = document.createElement('div');
    r.className = 'craft-row';
    const tile = document.createElement('div');
    tile.className = 'craft-tile';
    tile.dataset.info = infoKey;
    tile.innerHTML = tileHtml;
    const info = document.createElement('button');
    info.className = 'btn row-btn row-info';
    info.title = t('craft.info');
    info.dataset.info = infoKey;
    setRichText(info, '[[hint]]');
    const go = document.createElement('button');
    go.className = 'btn row-btn row-make';
    go.id = id;
    go.title = buttonTitle;
    setRichText(go, `[[${buttonIcon}]]`);
    onTap(go, action);
    r.append(tile, info, go);
    recruit.appendChild(r);
  };
  for (const type of getPlayerFaction().units) {
    const unit = GAME_CONFIG.settlerTypes[type];
    row(`btn-hire-${type}`, `settlerTypes:${type}`, `${iconHtml(unit.icon)} <b>${escapeHtml(unit.label)}</b> <span class="craft-cost">${richText(formatCost(unit.hireCost))}</span>`, 'plus', t('hire.hire'), () => spawnSettler(type));
  }
  const upgrade = getUpgrade();
  if (upgrade) {
    row('btn-upgrade', `settlerTypes:${upgrade.big.id}`, richText(t('btn.upgrade', { icon: upgrade.big.icon, cost: formatCost(upgrade.big.upgradeCost) })), 'plus', t('btn.upgrade', { icon: upgrade.big.icon, cost: formatCost(upgrade.big.upgradeCost) }).replace(/\[\[[^\]]*\]\]/g, ''), () => upgradeToBig());
    labelButton('btn-upgrade-big', t('btn.upgradeWorker', { icon: upgrade.big.icon, cost: formatCost(upgrade.big.upgradeCost) }));
  }
}
