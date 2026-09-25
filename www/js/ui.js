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

  if (selectedSettler && settlers.includes(selectedSettler)) {
    let name = selectedSettler.type === 'big' ? '🧌 Богатырь' : '👨‍🌾 Рабочий';
    let wName = selectedSettler.weapon === 'fist' ? 'Кулаки' : (selectedSettler.weapon === 'sword' ? 'Меч' : (selectedSettler.weapon === 'spear' ? 'Копье' : (selectedSettler.weapon === 'iron_sword' ? 'Железный меч' : (selectedSettler.weapon === 'iron_spear' ? 'Железное копье' : 'Лук'))));
    let tName = selectedSettler.tool === 'none' ? '' : (selectedSettler.tool === 'axe' ? ' / Топор' : (selectedSettler.tool === 'pickaxe' ? ' / Кирка' : (selectedSettler.tool === 'iron_axe' ? ' / Железный топор' : (selectedSettler.tool === 'iron_pickaxe' ? ' / Железная кирка' : ' / Удочка'))));
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
