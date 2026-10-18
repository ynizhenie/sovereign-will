// Arrows are made (#249): ordered with no archer about, a worker makes them; with an archer, the archer;
// three quick jobs of 2 for an order of 6
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;
  function arrowsMade({ seed = 'arrows-made', archer = false } = {}) {
    start(seed); clearResources();
    const w = makeSettler(1, townHall.x + 40, townHall.y + 40);
    const a = makeSettler(2, townHall.x - 40, townHall.y + 40, { weapon: 'bow', role: 'archer', quiver: true, arrows: 12 });
    settlers = archer ? [w, a] : [w];
    window.sim.helpers.placeWorkshop(); // made at a workshop (#248)
    Object.assign(stock, { wood: 10, stone: 10, arrows: 0 });
    craftArrows();
    const orders = craftOrders.length, instant = stock.arrows;
    const makers = new Set();
    run(20, { each: () => { settlers.forEach(s => { s.hunger = 999; if (s.activity === 'craftItem') makers.add(s.role); }); } });
    return { orders, instant, arrows: stock.arrows, makers: [...makers] };
  }
  return { arrowsMade };
})());
