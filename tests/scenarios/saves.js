// Saving and loading (#156)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const snapshot = () => JSON.stringify({
    settlers: settlers.map(s => [s.type, Math.round(s.x), Math.round(s.y), Math.round(s.hp), s.weapon, s.tool, s.carrying && s.carrying.type]),
    enemies: enemies.map(en => [en.enemyKey, Math.round(en.x), Math.round(en.y), Math.round(en.hp)]),
    stock: { ...stock }, waveNum, waveTimer: Math.round(waveTimer), buildings: buildings.map(b => [b.type, b.x, b.y, Math.round(b.hp)]),
    trees: trees.length, rand: rand()
  });

  // A game some way in, with a tower and its archer; saved (through JSON, as on the device), then a
  // different game, then the save loaded: the same game, pointers and all, and it goes on the same way
  function roundTrip({ seed = 'save-test' } = {}) {
    start(seed);
    const tower = placeBuilding('watchtower', nearHall(4, 0).x, nearHall(4, 0).y);
    const archer = makeSettler(900, townHall.x - 40, townHall.y + 40, { weapon: 'bow', role: 'archer', quiver: true, arrows: 12 });
    settlers.push(archer);
    stock.wood = 77;
    run(15, { holdWaves: false });
    tower.guards = [archer]; archer.towerAssignment = tower; // pointers both ways, as the save is made
    const saved = JSON.parse(JSON.stringify(serializeGame()));
    const before = snapshot();
    // how it goes on without saving
    run(5, { holdWaves: false });
    const goesOn = snapshot();

    document.getElementById('seed-input').value = 'another-game';
    applySeedFromUI(); resetGame();
    loadGame(saved);
    const after = snapshot();
    const savedTower = buildings.find(b => b.type === 'watchtower');
    const savedArcher = settlers.find(s => s.id === 900);
    const pointers = savedTower.guards.length === 1 && savedTower.guards[0] === savedArcher && savedArcher.towerAssignment === savedTower;
    run(5, { holdWaves: false });
    return { same: before === after, pointers, sameAfterwards: snapshot() === goesOn };
  }

  return { saveRoundTrip: roundTrip };
})());
