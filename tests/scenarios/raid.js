// A raid on an enemy camp (#255)
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler } } = window.sim;
  const step = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { update(1 / 60); if (each && each(f)) return true; } return false; };

  // A colony with an army; two waves beaten: the camp opens
  function campOpens({ seed = 'raid-test', soldiers = 4, gear = {} } = {}) {
    start(seed);
    settlers.push(...Array.from({ length: soldiers }, (_, i) => makeSettler(500 + i, townHall.x - 40 + i * 20, townHall.y + 60, { weapon: 'iron_sword', role: 'soldier', ...gear })));
    waveNum = 3; waveTimer = 100;
    step(0.1);
    return { camp: raidCamp && { ...raidCamp }, bar: document.querySelector('#raid-bar [data-raid-act="open"]')?.textContent || null };
  }

  // The party set out and in the camp
  function intoCamp(opts = {}) {
    const opened = campOpens(opts);
    raidCamp.layout = opts.layout || 'square';
    const homeBefore = settlers.length;
    openRaidPicker();
    const preselected = document.querySelectorAll('#raid-picker .raid-unit.on').length;
    document.querySelector('#raid-picker [data-raid="go"]').click();
    const party = raid.raiders.length;
    const timerBefore = waveTimer;
    // they walk to the edge; the rest rest; the wave clock stands
    const got = step(60, () => document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'));
    const timerAfter = waveTimer;
    const resting = settlers.filter(s => !s.raider).every(s => s.activity === 'restWhileRaid');
    document.querySelector('#raid-bar [data-raid-act="attack"]').click();
    return {
      opened, preselected, party, homeBefore, got, timerHeld: timerAfter === timerBefore, resting,
      phase: raid.phase, cols: COLS, settlers: settlers.length, hallAway: townHall.x < 0,
      outpost: enemyTents.filter(et => et.outpost).length, tents: enemyTents.length,
      defenders: enemies.length, guarded: enemies.every(en => en.guard), armored: enemies.filter(en => en.armor).length,
      walls: buildings.filter(b => b.type.startsWith('wall')).length,
      saveHidden: (setPaused(true), document.getElementById('save-game-button').hidden && (setPaused(false), true))
    };
  }

  // The camp fought out: by auto battle, or the party all down
  function raidOutcome({ win = true, seed = 'raid-test' } = {}) {
    const inCamp = intoCamp({ seed, soldiers: win ? 8 : 2, gear: win ? { armor: 'iron', hp: 150, maxHp: 150 } : {} });
    const homeSettlers = inCamp.homeBefore - inCamp.party;
    const waveBefore = waveTimer, stockBefore = stock.wood;
    // held without orders: nobody walks off to fight
    step(3);
    const held = settlers.every(s => Math.hypot(s.x - s.orderSpot.x, s.y - s.orderSpot.y) < 12);
    if (win) {
      raidAction('auto');
      step(240, () => raid.phase !== 'fight');
    } else {
      settlers.forEach(s => { s.hp = 0; });
      step(0.2);
    }
    const back = { phase: raid.phase, cols: COLS, hallHome: townHall.x > 0, wood: stock.wood - stockBefore, homeSettlers: settlers.filter(s => !s.raider).length, survivors: settlers.filter(s => s.raider).length, waveTimer };
    let homeIn = 0;
    if (win) step(70, () => { homeIn += 1 / 60; return raid.phase === null; });
    return { inCamp, held, homeSettlers, waveBefore, back, homeIn, end: { phase: raid.phase, camp: raidCamp, waveTimer, raiders: settlers.filter(s => s.raider).length } };
  }

  return { campOpens, intoCamp, raidOutcome };
})());
