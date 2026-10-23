// A woodcutter gathers logs from a felled tree before chopping another tree.
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler, clearResources } } = window.sim;

  function logsBeforeTrees({ seed = 'woodcutting-logs' } = {}) {
    start(seed);
    clearResources();
    const s = makeSettler(1, townHall.x, townHall.y, { tool: 'axe' });
    settlers = [s];
    const log = { x: townHall.x + 30, y: townHall.y, hp: 1, maxHp: 1, yield: { wood: 2 } };
    const tree = { x: townHall.x + 90, y: townHall.y, hp: 3, maxHp: 3, isGrowing: false };
    logs.push(log);
    trees.push(tree);
    const tick = createSettlerTick(1 / 60);
    return pickResourceToHarvest(s, tick) === log;
  }

  return { woodcutterLogsBeforeTrees: logsBeforeTrees };
})());
