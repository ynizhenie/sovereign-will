// The settlers in the panel: how many of each, and the selected one's info line

function updateUnitCounts() {
  const workers = settlers.filter(s => s.role === 'worker').length;
  const warriors = settlers.filter(s => s.role === 'soldier' || s.role === 'archer').length;

  const workersElem = document.getElementById('workers-cnt');
  const warriorsElem = document.getElementById('warriors-cnt');

  if (workersElem) workersElem.innerText = workers;
  if (warriorsElem) warriorsElem.innerText = warriors;
}

// The selected settler's info line (#180): what it's doing, when it's next hungry, what it carries
function renderSettlerInfo(s) {
  const activity = `activity.${s.activity || 'patrol'}`;
  const parts = [t(activity) === activity ? t('activity.patrol') : t(activity)];
  parts.push(getPlayerFaction().eats ? t('info.hungry', { seconds: Math.max(0, Math.ceil(getHungerSeconds(s))) }) : t('info.noHunger'));
  if (s.temporary !== undefined) parts.push(t('info.crumbles', { seconds: Math.ceil(s.temporary) }));
  const items = s.carrying ? (s.carrying.items || [s.carrying]) : [];
  const carried = items.filter(item => item.amount > 0).map(item => `${Math.round(item.amount)}[[${getResourceIconName(item.type)}]]`).join(' ');
  if (carried) parts.push(`${t('info.carries')} ${carried}`);
  const info = document.getElementById('selected-info');
  info.hidden = false;
  document.getElementById('selected-bar').classList.add('has-settler'); // a fixed size, whatever it carries (#188)
  setRichText(info, parts.join(' · '));
}

// Seconds until this settler eats next
function getHungerSeconds(s) {
  return s.hunger !== undefined ? s.hunger : GAME_CONFIG.meals.seconds;
}
