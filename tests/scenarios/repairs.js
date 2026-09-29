// Building repairs ordered by the player (#24)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, placeBuilding } } = window.sim;

  // A half-broken stone wall and one worker with plenty of stone. The wall is left alone until its
  // repair is ordered, then mended to full. Returns hp shares and the stone it cost.
  function wallRepair({ seed = 'repair-test' }) {
    start(seed);
    window.showNotification = () => {};
    const wall = placeBuilding('wall_stone', townHall.x + 90, townHall.y + 90);
    wall.hp = wall.maxHp / 2;
    settlers = [makeSettler(1, townHall.x - 40, townHall.y)];
    stock.stone = 100;
    run(10);
    const beforeOrder = wall.hp / wall.maxHp;
    toggleBuildingRepair(wall);
    run(20);
    return { beforeOrder, after: wall.hp / wall.maxHp, stillOrdered: !!wall.repairRequested, stoneSpent: 100 - stock.stone,
      stepCost: getRepairStep(wall).cost };
  }

  // Damaged walls, a door and the town hall; Repair all, then two workers mend everything
  function repairAll({ seed = 'repair-all-test', seconds = 60 }) {
    start(seed);
    window.showNotification = () => {};
    const damaged = [
      placeBuilding('wall_wood', townHall.x + 90, townHall.y + 90),
      placeBuilding('wall_stone', townHall.x - 90, townHall.y + 90),
      placeBuilding('door', townHall.x + 90, townHall.y - 90)
    ];
    for (const b of damaged) b.hp = 10;
    townHall.hp = townHall.maxHp - 30;
    settlers = [makeSettler(1, townHall.x - 40, townHall.y), makeSettler(2, townHall.x + 40, townHall.y)];
    stock.wood = stock.stone = 200;
    document.getElementById('btn-repair-all').click();
    const ordered = damaged.every(b => b.repairRequested) && townHall.repairRequested;
    run(seconds);
    return { ordered, allMended: damaged.every(b => b.hp >= b.maxHp) && townHall.hp >= townHall.maxHp };
  }

  return { wallRepair, repairAll };
})());
