function updateUI() {
  document.getElementById('wave-num').innerText = waveNum;
  document.getElementById('wave-timer').innerText = Math.ceil(waveTimer);
  Object.keys(GAME_CONFIG.resources).forEach(resourceKey => {
    const resourceElement = document.getElementById(resourceHudId(resourceKey));
    if (resourceElement) resourceElement.innerText = Math.floor(getResourceAmount(resourceKey));
  });
  syncFoodMix();
  for (const kind of Object.keys(GAME_CONFIG.foodKinds)) {
    const el = document.getElementById(`food-kind-${kind}-txt`);
    if (el) el.innerText = Math.floor(foodMix[kind] || 0);
  }
  for (const group of GAME_CONFIG.resourceGroups.filter(g => g.held)) {
    let total = 0;
    for (const [category, id] of getHeldItems(group)) {
      const count = countHeld(category, id);
      total += count;
      const el = document.getElementById(`held-${category}-${id}-txt`);
      if (el) el.innerText = count;
    }
    const totalEl = document.getElementById(`group-${group.id}-txt`);
    if (totalEl) totalEl.innerText = total;
  }
  for (const group of GAME_CONFIG.resourceGroups.filter(g => !g.held)) {
    const total = document.getElementById(`group-${group.id}-txt`);
    if (total) total.innerText = Math.floor(group.members.reduce((sum, id) => sum + getResourceAmount(id), 0));
  }
  document.getElementById('pop-txt').innerText = `${getCurrentPop()}/${getMaxPop()}`;
  document.getElementById('base-hp-txt').innerText = `${Math.max(0, Math.ceil(townHall.hp))}/${townHall.maxHp}`;

  let btnUpgrade = document.getElementById('btn-upgrade-big');

  if (getSelectedSettler()) {
    const type = GAME_CONFIG.settlerTypes[selectedSettler.type] || GAME_CONFIG.settlerTypes.normal;
    let name = `[[${type.icon}]] ${type.label}`;
    let wName = getDefinition('weapons', selectedSettler.weapon)?.label || selectedSettler.weapon;
    let tName = selectedSettler.tool === 'none' ? '' : ' / ' + (getDefinition('tools', selectedSettler.tool)?.label || selectedSettler.tool);
    let aName = selectedSettler.armor === 'iron' ? ` / ${t('hud.ironArmor')}` : '';
    let qName = selectedSettler.quiver ? ` / ${t('hud.quiver', { n: selectedSettler.arrows || 0 })}` : '';
    // the rest of what it wears (#180)
    const gear = ['shield', 'backpack', 'wateringCan'].filter(id => hasGear(selectedSettler, id)).map(id => ` / [[${GAME_CONFIG.gear[id].icon}]]`).join('');
    setRichText(document.getElementById('selected-settler-txt'), `${name} (${wName}${tName}${aName}${qName}${gear})`);
    renderSettlerInfo(selectedSettler);
    document.getElementById('btn-deselect').style.display = 'inline-block';
    if (btnUpgrade) {
      btnUpgrade.style.display = getUpgrade() && selectedSettler.type === getUpgrade().from ? 'block' : 'none';
    }
  } else {
    selectedSettler = null;
    document.getElementById('selected-settler-txt').innerText = t('hud.nobody');
    document.getElementById('selected-info').hidden = true;
    document.getElementById('selected-bar').classList.remove('has-settler');
    document.getElementById('btn-deselect').style.display = 'none';
    if (btnUpgrade) {
      btnUpgrade.style.display = 'none';
    }
  }

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

// Buttons with a price (#UI): what the stock is short of shows in red, and a button that can't be paid
// for is dimmed, as the stock changes (a few times a second)
let affordabilityTick = 0;
function refreshAffordability(force = false) {
  if (!force && ++affordabilityTick % 8 !== 0) return;
  for (const button of document.querySelectorAll('#bottom-panel button, #selected-bar button')) {
    const parts = button.querySelectorAll('.cost-part');
    if (!parts.length) continue;
    let short = false;
    for (const part of parts) {
      const missing = Number(stock[part.dataset.res] || 0) < Number(part.dataset.amount);
      part.classList.toggle('short', missing);
      if (missing) short = true;
    }
    button.classList.toggle('cant-afford', short);
  }
}

// A button's answer (#UI): the one just pressed flashes green when what it did worked (a green notice) and
// shakes when it didn't (a red one), within a moment of the press
let pressedButton = null, pressedAt = 0;
document.addEventListener('pointerdown', e => {
  const button = e.target.closest && e.target.closest('button');
  if (button) { pressedButton = button; pressedAt = performance.now(); }
}, true);
function answerPressedButton(ok) {
  if (!pressedButton || performance.now() - pressedAt > 600) return;
  const button = pressedButton, name = ok ? 'btn-ok' : 'btn-no';
  pressedButton = null;
  button.classList.remove('btn-ok', 'btn-no');
  void button.offsetWidth; // restart the animation
  button.classList.add(name);
  setTimeout(() => button.classList.remove(name), 500);
}
