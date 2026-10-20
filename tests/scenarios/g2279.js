// The friend's batch of fixes (#279), comment 1, part G2: the enemy camp and scouts
Object.assign(window.sim, (() => {
  const { helpers: { makeSettler } } = window.sim;
  const step = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { update(1 / 60); waveTimer = 999; if (each && each(f)) return true; } return false; };
  const sig = () => enemies.map(en => `${en.enemyKey}@${Math.round(en.guard ? en.guard.x : en.x)},${Math.round(en.guard ? en.guard.y : en.y)}`).sort().join(' ');
  const toEdge = () => step(60, () => !!document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'));

  // A scout's look, then the army changes, then the raid: the same camp, made for the army there was when it
  // appeared (14)
  function campFixed({ seed = 'camp-fixed' } = {}) {
    window.sim.campOpens({ seed, soldiers: 3 });
    raidCamp.layout = 'square';
    sendScout();
    step(60, () => raid.phase === 'fight');
    const seen = sig(), count = enemies.length;
    leaveCamp(false); endRaid(false);
    // more of them armed after the scout came back
    settlers.push(...[0, 1, 2].map(i => makeSettler(800 + i, townHall.x + 30 * i, townHall.y + 80, { weapon: 'iron_spear', role: 'soldier' })));
    const army = raidCamp.army.length;
    startRaid(settlers.filter(s => s.role === 'soldier'));
    toEdge(); enterCamp();
    const same = sig() === seen;
    return { scouted: count > 0, same, army };
  }

  // Retreat: not at once; they run to the edge they came in by, then out (15)
  function retreatWalks({ seed = 'retreat-walks' } = {}) {
    window.sim.intoCamp({ seed, soldiers: 3 });
    const at = settlers.map(s => ({ x: s.x, y: s.y }));
    enemies.forEach(en => { en.damage = 0; });
    settlers.forEach(s => { s.x = WORLD_WIDTH / 2; s.y = WORLD_HEIGHT / 2 + 40; s.hp = s.maxHp = 1e5; });
    raidAction('retreat');
    const stillIn = raid.phase === 'fight' && raid.retreating;
    let took = 0;
    step(40, () => { took += 1 / 60; return raid.phase !== 'fight'; });
    return { stillIn, walked: took > 1, out: raid.phase === 'return', home: settlers.filter(s => s.raider).length, entry: at.length };
  }

  // The scout's picker: one picked, another tapped instead; sent, it's that one. In the camp it isn't seen at
  // once (13)
  function scoutPicked({ seed = 'scout-picked' } = {}) {
    window.sim.campOpens({ seed, soldiers: 2 });
    raidAction('scout');
    const units = [...document.querySelectorAll('#raid-picker .raid-unit')];
    const firstOn = units.filter(b => b.classList.contains('on')).length;
    const other = units.find(b => !b.classList.contains('on'));
    other.click();
    const on = units.filter(b => b.classList.contains('on'));
    document.querySelector('#raid-picker [data-raid="go"]').click();
    const scout = raid.raiders[0];
    step(60, () => raid.phase === 'fight');
    step(5);
    return { firstOn, oneOn: on.length, chosen: !!scout && String(scout.id) === other.dataset.unit, unseen: raid.phase === 'fight' && !raid.retreating };
  }

  // An enemy tapped twice in the camp: the order's off again (6)
  function orderOff({ seed = 'order-off' } = {}) {
    window.sim.intoCamp({ seed, soldiers: 2 });
    const en = enemies[0];
    raidTap(en.x, en.y);
    const on = settlers.every(s => s.orderTarget === en) && en.markedTarget;
    raidTap(en.x, en.y);
    return { on, off: settlers.every(s => !s.orderTarget) && !en.markedTarget };
  }

  // A shelter pitched in the camp: built, the hurt mend by it, an archer fills its quiver there from the
  // arrows taken (7)
  function campShelter({ seed = 'camp-shelter' } = {}) {
    window.sim.campOpens({ seed, soldiers: 2 });
    settlers.push(makeSettler(850, townHall.x, townHall.y + 90, { weapon: 'bow', role: 'archer', quiver: true, arrows: 0 }));
    Object.assign(stock, { wood: 100, leather: 10, herbs: 10, stone: 50, arrows: 30 });
    raidAction('open');
    const offered = document.querySelector('#raid-picker .raid-arrow-count').textContent.trim();
    document.querySelector('#raid-picker [data-raid="go"]').click();
    const took = raid.arrows, left = stock.arrows;
    toEdge(); enterCamp();
    enemies.forEach(en => { en.speed = 0; en.damage = 0; });
    const archer = settlers.find(s => s.id === 850);
    archer.arrows = 0;
    const spot = { x: archer.x + (archer.x < WORLD_WIDTH / 2 ? 40 : -40), y: archer.y };
    raidAction('shelter');
    raidTap(spot.x, spot.y);
    const site = blueprints.some(bp => bp.raidShelter);
    step(20, () => buildings.some(b => b.raidShelter));
    const built = buildings.some(b => b.raidShelter);
    const hurt = settlers.find(s => s.id !== 850);
    const b = buildings.find(o => o.raidShelter);
    hurt.x = b.x + 20; hurt.y = b.y; hurt.hp = 20; hurt.orderSpot = { x: hurt.x, y: hurt.y };
    archer.orderSpot = { x: archer.x, y: archer.y };
    step(3);
    return { offered, took, left, site, built, mended: hurt.hp > 40, quiver: archer.arrows > 0, kept: raid.arrows < took };
  }

  return { campFixed, retreatWalks, scoutPicked, orderOff, campShelter };
})());
