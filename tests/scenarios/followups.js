// Follow-ups to the UI batch: blight zones (#186), the bottom panel (#188)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { clearResources } } = window.sim;

  function asUndead(seed) {
    sides.player.faction = 'undead';
    sides.player.color = '#9b59b6';
    sides.enemy.color = '#e8572a';
    start(seed);
  }

  // Blight round the graveyard reaches as far on every side; marking toggles; blighted ground takes no
  // mark; a blighted zone taken away fades
  function blightZonesFollowup({ seed = 'blight-186' }) {
    const notes = [];
    asUndead(seed);
    window.showNotification = text => notes.push(text);
    clearResources();
    const hx = Math.round(townHall.x / TILE_SIZE), hy = Math.round(townHall.y / TILE_SIZE);
    const blighted = (gx, gy) => isBlighted(gx * TILE_SIZE + 15, gy * TILE_SIZE + 15);
    // the hall is on tiles hx-1..hx, hy-1..hy: 2 more on every side
    const reach = {
      left: blighted(hx - 3, hy) && !blighted(hx - 4, hy), right: blighted(hx + 2, hy) && !blighted(hx + 3, hy),
      up: blighted(hx, hy - 3) && !blighted(hx, hy - 4), down: blighted(hx, hy + 2) && !blighted(hx, hy + 3)
    };
    const tap = (gx, gy, mode = 'blight') => { buildMode = mode; mouse.x = gx * TILE_SIZE + 15; mouse.y = gy * TILE_SIZE + 15; handleCanvasClick(); };
    // a tile already blighted round the hall: refused
    tap(hx + 1, hy);
    const refused = blightZones.length === 0 && notes.includes(t('blight.already'));
    // marked, and the same tile again: unmarked at once (not blighted yet)
    tap(hx + 6, hy); const marked = blightZones.length === 1;
    tap(hx + 6, hy); const unmarked = blightZones.length === 0;
    // blighted by a necromancer, then taken away: still blighted a while, then gone
    blightZones.push({ x: (hx + 6) * TILE_SIZE + 15, y: hy * TILE_SIZE + 15, done: true });
    tap(hx + 6, hy);
    run(1);
    const stillAfter1s = blighted(hx + 6, hy) && blightZones.length === 1;
    run(GAME_CONFIG.blight.clearSeconds);
    const goneLater = !blighted(hx + 6, hy) && blightZones.length === 0;
    buildMode = 'interact';
    return { reach, refused, marked, unmarked, stillAfter1s, goneLater };
  }

  return { blightZonesFollowup, asUndeadForHud: ({ seed = 'hud-188' }) => { asUndead(seed); return true; } };
})());
