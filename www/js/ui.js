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
    setRichText(document.getElementById('selected-settler-txt'), `${name} (${wName}${tName}${aName}${qName})`);
    document.getElementById('btn-deselect').style.display = 'inline-block';
    if (btnUpgrade) {
      btnUpgrade.style.display = selectedSettler.type === 'normal' ? 'block' : 'none';
    }
  } else {
    selectedSettler = null;
    document.getElementById('selected-settler-txt').innerText = t('hud.nobody');
    document.getElementById('btn-deselect').style.display = 'none';
    if (btnUpgrade) {
      btnUpgrade.style.display = 'none';
    }
  }

}
