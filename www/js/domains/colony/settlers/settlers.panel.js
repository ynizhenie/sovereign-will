// The settlers in the panel: how many of each, and the selected one's info line

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { getResourceIconName, labelButton, makeTile, setRichText, setText } from '../../../ui/index.js';
import { camera, clampCamera, onTap, t } from '../../../engine/platform/index.js';
import { game } from '../../../engine/world/index.js';
import { getPlayerFaction } from '../../factions/index.js';
import { getPossessed, getUpgrade, spawnSettler, upgradeToBig } from './settlers.rules.js';
import { formatCost } from '../storage/index.js';
import { getMorale } from '../../conflict/morale/index.js';
import { getUnitDisplayProgressionTrack, getUnitExperience, getUnitExperienceForLevel, getUnitLevel, UNIT_PROGRESSION_TRACKS } from './settlers.progression.js';

let progressionViewSettler = null;
let possessionCameraUnit = null;
let possessionCameraPan = null;
const POSSESSION_CAMERA_PAN_SECONDS = 0.45;
const POSSESSION_CAMERA_FOLLOW_SECONDS = 0.12;

// The selected settler's info: what it's doing, when it's next hungry, what it carries (#326: a line each, all of it)
export function renderSettlerInfo(s) {
  if (progressionViewSettler && progressionViewSettler !== s) progressionViewSettler = null;
  const info = document.getElementById('selected-info');
  info.hidden = false;
  if (progressionViewSettler === s) {
    renderProgressionView(info, s);
    return;
  }
  const activity = `activity.${s.activity || 'patrol'}`;
  const beforeProgression = [t(activity) === activity ? t('activity.patrol') : t(activity)];
  beforeProgression.push(getPlayerFaction().eats ? t('info.hungry', { seconds: Math.max(0, Math.ceil(getHungerSeconds(s))) }) : t('info.noHunger'));
  if (s.temporary !== undefined) beforeProgression.push(t('info.crumbles', { seconds: Math.ceil(s.temporary) }));
  const activeTrack = getUnitDisplayProgressionTrack(s);
  const visibleTracks = UNIT_PROGRESSION_TRACKS.filter(track =>
    track === activeTrack || getUnitExperience(s, track) > 0
  );
  const progressionRows = visibleTracks.map(track => {
    const experience = Math.floor(getUnitExperience(s, track));
    const level = getUnitLevel(s, track);
    return level < 3
      ? t('info.progression', { skill: t(`progression.${track}`), level, experience, next: getUnitExperienceForLevel(level + 1, track) })
      : t('info.progressionMax', { skill: t(`progression.${track}`), level, experience: getUnitExperienceForLevel(level, track) });
  });
  const afterProgression = [{ text: s.panic ? t('info.panic') : t('info.morale', { n: Math.round(getMorale(s)) }), className: '' }]; // (#207)
  const items = s.carrying ? (s.carrying.items || [s.carrying]) : [];
  const carried = items.filter(item => item.amount > 0).map(item => `${Math.round(item.amount)}[[${getResourceIconName(item.type)}]]`).join(' ');
  afterProgression.push({ text: carried ? `${t('info.carries')} ${carried}` : '', className: 'selected-carrying-line' });
  if (s.orderTarget || s.orderSpot) afterProgression.push({ text: t(s.orderTarget ? 'info.orderedAttack' : s.holdOrder ? 'info.orderedStill' : 'info.orderedHold'), className: '' }); // (#326)
  const text = JSON.stringify(['details', beforeProgression, activeTrack, progressionRows, afterProgression]);
  if (info.dataset.text === text) return;
  info.dataset.text = text;
  info.dataset.view = 'details';
  info.innerHTML = '';
  for (const part of beforeProgression) { const line = document.createElement('div'); setRichText(line, part); info.appendChild(line); }
  if (activeTrack) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'progression-button';
    open.textContent = t('info.progressionShow');
    onTap(open, () => {
      progressionViewSettler = s;
      renderSettlerInfo(s);
    });
    info.appendChild(open);
    const list = document.createElement('div');
    list.className = 'progression-list';
    for (const rowText of progressionRows) {
      const row = document.createElement('div');
      row.className = 'progression-row';
      setRichText(row, rowText);
      list.appendChild(row);
    }
    info.appendChild(list);
  }
  for (const part of afterProgression) {
    const line = document.createElement('div');
    if (part.className) line.className = part.className;
    if (part.text) setRichText(line, part.text);
    info.appendChild(line);
  }
}

function renderProgressionView(info, s) {
  const rows = UNIT_PROGRESSION_TRACKS.map(track => {
    const experience = Math.floor(getUnitExperience(s, track));
    const level = getUnitLevel(s, track);
    return level < 3
      ? t('info.progression', { skill: t(`progression.${track}`), level, experience, next: getUnitExperienceForLevel(level + 1, track) })
      : t('info.progressionMax', { skill: t(`progression.${track}`), level, experience: getUnitExperienceForLevel(level, track) });
  });
  const text = JSON.stringify(['progression', rows]);
  if (info.dataset.text === text) return;
  info.dataset.text = text;
  info.dataset.view = 'progression';
  info.innerHTML = '';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'progression-button';
  back.textContent = t('info.progressionBack');
  onTap(back, () => {
    progressionViewSettler = null;
    renderSettlerInfo(s);
  });
  info.appendChild(back);
  const title = document.createElement('div');
  title.className = 'progression-view-title';
  title.textContent = t('info.progressionTitle');
  info.appendChild(title);
  const list = document.createElement('div');
  list.className = 'progression-list';
  for (const rowText of rows) {
    const row = document.createElement('div');
    row.className = 'progression-row';
    setRichText(row, rowText);
    list.appendChild(row);
  }
  info.appendChild(list);
}

// Seconds until this settler eats next
export function getHungerSeconds(s) {
  return s.hunger !== undefined ? s.hunger : GAME_CONFIG.meals.seconds;
}

// While possessing: the camera follows the possessed settler
export function updatePossessionView(dt = 1 / 60) {
  const possessed = getPossessed();
  if (!possessed) {
    possessionCameraUnit = null;
    possessionCameraPan = null;
    return;
  }
  if (possessionCameraUnit !== possessed) {
    possessionCameraUnit = possessed;
    possessionCameraPan = { fromX: camera.x, fromY: camera.y, elapsed: 0 };
  }
  if (possessionCameraPan) {
    possessionCameraPan.elapsed = Math.min(POSSESSION_CAMERA_PAN_SECONDS, possessionCameraPan.elapsed + dt);
    const progress = possessionCameraPan.elapsed / POSSESSION_CAMERA_PAN_SECONDS;
    const eased = progress * progress * (3 - 2 * progress);
    camera.x = possessionCameraPan.fromX + (possessed.x - possessionCameraPan.fromX) * eased;
    camera.y = possessionCameraPan.fromY + (possessed.y - possessionCameraPan.fromY) * eased;
    if (progress === 1) possessionCameraPan = null;
  } else {
    const follow = 1 - Math.exp(-dt / POSSESSION_CAMERA_FOLLOW_SECONDS);
    camera.x += (possessed.x - camera.x) * follow;
    camera.y += (possessed.y - camera.y) * follow;
  }
  clampCamera();
}

export function isPossessionCameraFollowing() {
  return possessionCameraUnit !== null;
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
