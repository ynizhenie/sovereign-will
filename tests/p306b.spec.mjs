import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #306, part B: zombies' attacks (4), archers drawing an arrow (8), boars digging and resting (9)

test('a zombie reaches out and lunges as it strikes; an archer goes to its quiver, nocks and draws (#306, 4, 8)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    const z = makeSettler(1, 0, 0, { type: 'zombie' }); z.facing = 0;
    const calm = zombieReach(z);
    z.swingLen = 0.3; z.swingT = 0.15;
    const striking = zombieReach(z);
    const armed = zombieReach(makeSettler(2, 0, 0, { type: 'zombie', weapon: 'sword' }));
    const human = zombieReach(makeSettler(3, 0, 0, {}));
    const enemyZombie = zombieReach(createConfiguredEnemy({ x: 0, y: 0 }, 'undead_zombie'));
    const a = makeSettler(4, 0, 0, { weapon: 'bow', role: 'archer', quiver: true }); a.facing = 0; a.shotLen = 0.8;
    const phase = since => { a.shotAt = pathTick - since * 60; return bowDraw(a); };
    const q = phase(0.1), nock = phase(0.4), drawn = phase(0.79), rest = phase(10);
    const enArcher = createConfiguredEnemy({ x: 0, y: 0 }, 'raider_archer'); enArcher.shotAt = pathTick; enArcher.shotLen = 1;
    for (let f = 0; f < 3; f++) render();
    return {
      calmReach: Math.round(calm.hand.x), strikeReach: Math.round(striking.hand.x), lunge: striking.lunge > 1, armed, human, enemyZombie: !!enemyZombie,
      quiverBehind: q.pull === 0 && q.other.x < 0, nocking: nock.pull === 0 && nock.other.x > q.other.x, drawn: drawn.pull > 0.9, rest, enemyBow: !!bowDraw(enArcher)
    };
  });
  expect(r.strikeReach).toBeGreaterThan(r.calmReach);
  expect(r).toMatchObject({ lunge: true, armed: null, human: null, enemyZombie: true, quiverBehind: true, nocking: true, drawn: true, rest: null, enemyBow: true });
  expect(errors).toEqual([]);
});

test('a boar left be digs, lies in what it dug, the ground darker there; scared, it\'s up and off (#306, 9)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const { clearResources } = window.sim.helpers;
    clearResources(); settlers = [];
    const c = GAME_CONFIG.mapResources.boar; const chance = c.restChance; c.restChance = 1;
    const b = { x: townHall.x + 300, y: townHall.y, hp: 30, maxHp: 30, priority: 0, wanderTimer: 99, wanderInterval: 1 };
    boars = [b]; boarRespawnTimer = 999;
    const seen = new Set(); let wallow = false;
    const x0 = b.x, y0 = b.y;
    for (let f = 0; f < 60 * 6; f++) { update(1 / 60); waveTimer = 999; if (b.rest) seen.add(b.rest.stage); if (boarWallows.some(w => w.boar === b)) wallow = true; }
    const still = Math.hypot(b.x - x0, b.y - y0) < 3;
    render();
    makeBoarFlee(b, b.x - 50, b.y);
    c.restChance = chance;
    return { dug: seen.has('dig'), lay: seen.has('lie'), wallow, still, upAfterScare: b.rest === null, wallowLeft: boarWallows.some(w => !w.boar) };
  });
  expect(r).toEqual({ dug: true, lay: true, wallow: true, still: true, upAfterScare: true, wallowLeft: true });
  expect(errors).toEqual([]);
});

test('the ground a boar dug belongs to its world: a new game and the battle field start without it (#306, 9)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    // a boar may have dug one already in the seconds this world has been running: only the ones dug from here on
    boarWallows.length = 0;
    const dig = () => { boarWallows.push({ x: townHall.x + 300, y: townHall.y + 4, boar: null, age: 0 }); return boarWallows.length; };
    const dug = dig();
    resetGame(); // a new game (the pit of the world before it doesn't come along)
    const afterReset = boarWallows.length;
    dig();
    startBattleMode(); // the battle field's setup takes no world ticks: a pit left in it never fades
    return { dug, afterReset, afterBattle: boarWallows.length, mode: game.gameMode };
  });
  expect(r).toEqual({ dug: 1, afterReset: 0, afterBattle: 0, mode: 'battle' });
  expect(errors).toEqual([]);
});
