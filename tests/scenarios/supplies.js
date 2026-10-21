// Rope is made automatically when another item needs it; crafted torches can be taken apart.
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  function supplies({ seed = 'supplies-test' } = {}) {
    start(seed); clearResources();
    settlers = [makeSettler(1, townHall.x + 40, townHall.y + 40)];
    Object.assign(stock, { wood: 20, herbs: 10, rope: 0, torches: 0 });
    const orderedRod = makeToStore('tools', 'rod');
    const queuedRope = craftOrders.some(order => order.category === 'recipes' && order.id === 'rope');
    run(20, { each: () => { settlers[0].hunger = 999; } });
    const rodStored = game.armory['tools:rod'] === 1;
    const leftoverRope = stock.rope;

    craftRecipe('torch');
    run(10, { each: () => { settlers[0].hunger = 999; } });
    const torchCrafted = stock.torches === 1;
    const dismantled = takeApartRecipe('torch');
    return { orderedRod, queuedRope, rodStored, leftoverRope, torchCrafted, dismantled, torches: stock.torches, rope: stock.rope };
  }

  return { supplies };
})());
