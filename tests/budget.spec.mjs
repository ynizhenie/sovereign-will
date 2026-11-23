import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// (#425) The frame's budget: on a weak device (a Mi Pad 4) what a frame cost was how many things the canvas was told to
// do, each its own command to the graphics card, and work redone every step. A new feature that draws something from
// scratch every frame (not through a kept picture: drawThingPicture, drawUnitPicture, the ground's pieces), or makes a
// list anew every step, should fail here, not be found a month later on a phone.

// A busy base: a wall with a door, six buildings, 16 settlers at work and 6 enemies held where they stand; settled
// (the ground's pieces and the pictures painted once), then counted for two seconds
async function busyBase(page, measure) {
  await openGame(page);
  return page.evaluate(measure => {
    const { makeSettler, placeBuilding, tileCenter } = window.sim.helpers;
    window.sim.start('frame-budget');
    game.gameStarted = true; game.gameMode = 'endless';
    const g = getGridPos(townHall.x, townHall.y);
    for (let i = 0; i < 8; i++) { const p = tileCenter(g.gx - 4 + i, g.gy - 4); placeBuilding(i === 4 ? 'door' : 'wall_wood', p.x, p.y); }
    ['tent', 'workshop', 'smithy', 'watchtower', 'campfire', 'dummy'].forEach((k, i) => { const p = tileCenter(g.gx - 5 + i * 2, g.gy + 4); placeBuilding(k, p.x, p.y); });
    for (const b of buildings) { delete b.progress; b.built = true; }
    for (let i = 0; i < 16; i++) settlers.push(makeSettler(700 + i, townHall.x - 120 + (i % 8) * 30, townHall.y + 60 + Math.floor(i / 8) * 30, { weapon: i % 2 ? 'sword' : 'bow', role: i % 2 ? 'soldier' : 'archer' }));
    for (let i = 0; i < 6; i++) enemies.push(Object.assign(createConfiguredEnemy({ x: townHall.x + 260 + i * 25, y: townHall.y }, 'raider'), { trapped: true, speed: 0 }));
    camera.x = townHall.x; camera.y = townHall.y; setZoom(1);
    const frame = () => { waveTimer = 999; update(1 / 60); render(); };
    for (let f = 0; f < 600; f++) frame();
    return measure === 'draw' ? (() => {
      const proto = CanvasRenderingContext2D.prototype, names = ['fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'clearRect', 'clip'];
      const real = {}, count = { n: 0 }, frames = [];
      for (const k of names) { real[k] = proto[k]; proto[k] = function (...a) { count.n++; return real[k].apply(this, a); }; }
      try { for (let f = 0; f < 120; f++) { count.n = 0; frame(); frames.push(count.n); } } finally { for (const k of names) proto[k] = real[k]; }
      frames.sort((a, b) => a - b);
      return { median: frames[60], units: settlers.length + enemies.length };
    })() : (() => {
      const lists = () => Object.entries(game).filter(([, v]) => Array.isArray(v));
      const seen = new Map(lists()), made = {};
      for (let f = 0; f < 120; f++) {
        frame();
        for (const [k, v] of lists()) { if (seen.get(k) !== v) made[k] = (made[k] || 0) + 1; seen.set(k, v); }
      }
      return made;
    })();
  }, measure);
}

test('a frame of a busy base stays within its drawing budget (#425)', async ({ page }) => {
  const r = await busyBase(page, 'draw');
  expect(r.units).toBe(24);
  // ~485 canvas calls a frame when this was written; every unit and building drawn from scratch each frame was ~1030.
  // Over the budget: draw what's new through a kept picture, or (if it's worth it) raise this with the reason
  expect(r.median).toBeLessThan(650);
});

test('the world\'s lists are kept from step to step, not made anew (#425)', async ({ page }) => {
  const made = await busyBase(page, 'lists');
  // a list made anew every step ("list = list.filter(...)" with nothing to take out) undoes every cache kept by it:
  // keepWhere(list, keep) instead. (The selected group is the panels', not the world's.)
  delete made.selectedGroup;
  expect(Object.entries(made).filter(([, times]) => times > 60)).toEqual([]);
});
