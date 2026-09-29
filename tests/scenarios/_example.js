// Smallest possible scenario file (see tests/helpers.mjs); checked by tests/scenarios.spec.mjs.
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler } } = window.sim;
  function scenarioFilesLoad({ seed = 'scenario-files-test' }) {
    start(seed);
    settlers = [makeSettler(1, townHall.x, townHall.y)];
    return { settlers: settlers.length };
  }
  return { scenarioFilesLoad };
})());
