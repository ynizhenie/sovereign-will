function updateUI() {
  document.getElementById('wave-num').innerText = waveNum;
  document.getElementById('wave-timer').innerText = Math.ceil(waveTimer);
  Object.keys(GAME_CONFIG.resources).forEach(resourceKey => {
    const resourceElement = document.getElementById(resourceHudId(resourceKey));
    if (resourceElement) resourceElement.innerText = Math.floor(getResourceAmount(resourceKey));
  });
  document.getElementById('pop-txt').innerText = `${getCurrentPop()}/${getMaxPop()}`;
  document.getElementById('base-hp-txt').innerText = `${Math.max(0, Math.ceil(townHall.hp))}/${townHall.maxHp}`;

  let btnUpgrade = document.getElementById('btn-upgrade-big');

  if (getSelectedSettler()) {
    let name = selectedSettler.type === 'big' ? '🧌 Богатырь' : '👨‍🌾 Рабочий';
    let wName = getDefinition('weapons', selectedSettler.weapon)?.label || selectedSettler.weapon;
    let tName = selectedSettler.tool === 'none' ? '' : ' / ' + (getDefinition('tools', selectedSettler.tool)?.label || selectedSettler.tool);
    let aName = selectedSettler.armor === 'iron' ? ' / Железная броня' : '';
    let qName = selectedSettler.quiver ? ` / Колчан ${selectedSettler.arrows || 0}/12` : '';
    document.getElementById('selected-settler-txt').innerText = `${name} (${wName}${tName}${aName}${qName})`;
    document.getElementById('btn-deselect').style.display = 'inline-block';
    if (btnUpgrade) {
      btnUpgrade.style.display = selectedSettler.type === 'normal' ? 'block' : 'none';
    }
  } else {
    selectedSettler = null;
    document.getElementById('selected-settler-txt').innerText = 'Никто';
    document.getElementById('btn-deselect').style.display = 'none';
    if (btnUpgrade) {
      btnUpgrade.style.display = 'none';
    }
  }

}
