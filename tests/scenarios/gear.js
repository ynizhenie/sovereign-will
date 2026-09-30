// Gear picked up at and handed back to the town hall (#94)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler } } = window.sim;

  // An archer, a swordsman and a worker, all a way off the town hall. Orders one piece of gear with its
  // button and follows who gets it: not worn at once, worn once they've been to the town hall.
  function orderGearFor({ seed = 'gear-test', id, only }) {
    start(seed);
    window.showNotification = () => {};
    boars.length = 0; // a hunt would bring leather in and blur what was paid
    const hx = townHall.x, hy = townHall.y;
    const all = {
      archer: makeSettler(1, hx - 150, hy, { weapon: 'bow', role: 'archer', quiver: true, isPossessed: false }),
      soldier: makeSettler(2, hx + 150, hy, { weapon: 'sword', role: 'soldier' }),
      worker: makeSettler(3, hx, hy + 150)
    };
    settlers = only ? only.map(k => all[k]) : Object.values(all);
    selectedSettler = null;
    stock.iron = 20; stock.leather = 20; stock.wood = 20;
    const before = { iron: stock.iron, leather: stock.leather };
    document.getElementById(`btn-${id}`).click();
    const who = Object.keys(all).find(k => all[k].targetEquipment && all[k].targetEquipment.gear === id) || null;
    const wornAtOnce = who ? hasGear(all[who], id) : false;
    run(10);
    return { who, wornAtOnce, worn: who ? hasGear(all[who], id) : false, maxHp: who ? all[who].maxHp : null,
      paid: { iron: before.iron - stock.iron, leather: before.leather - stock.leather } };
  }

  // A swordsman in armour: disarming the weapon keeps the armour; Take off armour hands it back
  function armorOff({ seed = 'armor-off-test' }) {
    start(seed);
    window.showNotification = () => {};
    const s = makeSettler(1, townHall.x + 120, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    putOnGear(s, 'armor');
    stock.iron = 0;
    selectedSettler = s;
    disarmSettler('weapon');
    run(10);
    const afterDisarm = { armor: s.armor, maxHp: s.maxHp };
    orderGearOff('armor');
    run(10);
    return { afterDisarm, armor: s.armor, maxHp: s.maxHp, ironBack: stock.iron };
  }

  return { orderGearFor, armorOff };
})());
