import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('strikes swing the weapon once, work keeps the tool moving, and both settle back (#25)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler, clearResources, tileCenter } = window.sim.helpers;
    window.sim.start('animation-test');
    clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const treeAt = tileCenter(g.gx + 4, g.gy + 2);
    trees.push({ ...treeAt, hp: 100, isGrowing: false, growProgress: 0 });
    invalidateAllPaths();
    const soldier = makeSettler(1, townHall.x - 80, townHall.y, { weapon: 'sword', role: 'soldier', isPossessed: true });
    const spear = makeSettler(2, townHall.x - 80, townHall.y + 40, { weapon: 'spear', role: 'soldier', isPossessed: true });
    const cutter = makeSettler(3, treeAt.x - 30, treeAt.y, { tool: 'axe' });
    settlers = [soldier, spear, cutter];
    const poses = { sword: [], spear: [], axe: [] };
    performAttack(soldier, soldier.x + 20, soldier.y);
    performAttack(spear, spear.x + 20, spear.y);
    for (let f = 0; f < 60; f++) {
      window.sim.run(1 / 60);
      poses.sword.push(getHeldItemPose(soldier));
      poses.spear.push(getHeldItemPose(spear));
      poses.axe.push(getHeldItemPose(cutter));
      if (f % 10 === 0) render();
    }
    const range = (list, key) => Math.max(...list.map(p => p[key])) - Math.min(...list.map(p => p[key]));
    return {
      swordArc: range(poses.sword, 'angle'), swordRestsAfter: poses.sword.at(-1),
      spearThrust: Math.max(...poses.spear.map(p => p.push)), spearAngle: range(poses.spear, 'angle'),
      axeMoving: range(poses.axe, 'angle') > 0.5, axeWorking: cutter.working > 0
    };
  });
  expect(r.swordArc).toBeGreaterThan(1);
  expect(r.swordRestsAfter).toEqual({ angle: 0, push: 0 });
  expect(r.spearThrust).toBeGreaterThan(5);
  expect(r.spearAngle).toBeLessThan(0.15); // (a thrust, hardly turned, #279)
  expect(r.axeMoving).toBe(true);
  expect(r.axeWorking).toBe(true);
  expect(errors).toEqual([]);
});

test('a bare-handed human in a fight boxes: a guard up, a punch out, a step into it', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler, clearResources } = window.sim.helpers;
    window.sim.start('boxing-test');
    clearResources();
    const man = makeSettler(1, 300, 300, { isPossessed: true });
    const woman = makeSettler(2, 340, 300, { isPossessed: true, look: { female: true, style: 0, shade: 0 } });
    settlers = [man, woman];
    const atRest = humanPunch(man); // (they've not fought yet: nothing to box)
    // a blow at something in front of it (performAttack sets its strike and struckAt)
    performAttack(man, man.x + 20, man.y);
    performAttack(woman, woman.x + 20, woman.y);
    const fists = [], guards = [], leans = [], hers = [];
    for (let f = 0; f < 30; f++) {
      const p = humanPunch(man), q = humanPunch(woman);
      fists.push(p.hand.x); guards.push(p.guard); leans.push(p.lean); hers.push(q.hand.x);
      tickAnimation(man, 1 / 60); tickAnimation(woman, 1 / 60);
      render();
    }
    // an armed settler, one with a tool, a shielded one, an undead and a demon, all striking: none of them boxes
    const others = [makeSettler(3, 300, 300, { weapon: 'sword', role: 'soldier' }), makeSettler(4, 300, 300, { tool: 'axe' }),
      makeSettler(5, 300, 300, { shield: true, role: 'soldier' }), makeSettler(6, 300, 300, { type: 'zombie' }), makeSettler(7, 300, 300, { type: 'imp' })];
    for (const u of others) { startSwing(u, 0.3); u.struckAt = game.pathTick; }
    const noOthers = others.map(u => humanPunch(u));
    window.sim.run(4); // (the fight over, it settles back to its hands down)
    const after = humanPunch(man);
    return {
      atRest, r: man.visualRadius,
      out: Math.max(...fists), back: Math.min(...fists), leanIn: Math.max(...leans),
      guardUp: guards.every(g => g.y < -man.visualRadius * 0.3), guardIn: Math.max(...guards.map(g => Math.abs(g.x))),
      herOut: Math.max(...hers),
      noOthers: noOthers.map(p => p === null), after
    };
  });
  expect(r.atRest).toBe(null);
  expect(r.out).toBeGreaterThan(r.r * 1.3); // (the fist thrown out in front of it)
  expect(r.back).toBeLessThan(r.r * 0.6); // (and drawn back again at the start of the blow)
  expect(r.leanIn).toBeGreaterThan(1.5); // (the body stepping into the punch)
  expect(r.guardUp).toBe(true); // (the other fist held up by its chin)
  expect(r.guardIn).toBeLessThan(r.r * 0.5);
  expect(r.herOut).toBeGreaterThan(r.r); // (a woman boxes too)
  expect(r.noOthers).toEqual([true, true, true, true, true]);
  expect(r.after).toBe(null);
  expect(errors).toEqual([]);
});

test('a hand with nothing in it rests down at its side; what it holds is held at the grip', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('empty-hand-test');
    // the hands as drawn: each arm ends in a circle of r * 0.15 round the hand (settlers.draw.js, arm), so
    // where those circles are is where its hands are: how far out, in radii, from the middle of the figure
    const hands = unit => {
      const found = [], original = ctx.arc;
      ctx.arc = function (x, y, rad, ...rest) {
        // (drawFigure translates to unit.x, unit.y first, so x, y are how far out from its middle the hand is)
        if (Math.abs(rad - unit.visualRadius * 0.15) < 0.001) found.push([+(Math.abs(x) / unit.visualRadius).toFixed(2), +(y / unit.visualRadius).toFixed(2)]);
        return original.call(this, x, y, rad, ...rest);
      };
      try {
        drawFigure(unit, { x: unit.x, y: unit.y, r: unit.visualRadius, body: '#b8a04a', skin: '#f5cba7', hand: true, shield: !!unit.shield });
      } finally { ctx.arc = original; }
      return found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    };
    const at = extra => hands(makeSettler(1, 300, 300, { facing: 0, ...extra }));
    return {
      bare: at({}), // (a worker with nothing in hand: the default settler)
      armed: at({ weapon: 'club' }),
      resting: at({ weapon: 'club', isIdle: true, idle: { act: 'sit' } }), // (its club lies on its back while it rests)
      shielded: at({ shield: true }),
      spear: at({ weapon: 'spear' }), // (long: carried in both hands)
      spearShield: at({ weapon: 'spear', shield: true }) // (its other arm's the shield's: one hand on it)
    };
  });
  expect(r.bare).toEqual([[0.72, 0.2], [0.72, 0.25]]); // (both hands down at its sides, not crossed over its belly)
  expect(r.armed).toEqual([[0.72, 0.25], [0.72, 0.5]]); // (its club's hand down at its side too, lower: at the grip)
  expect(r.resting).toEqual([[0.72, 0.2], [0.72, 0.25]]); // (nothing in hand: both at its sides)
  expect(r.shielded).toEqual([[0.72, 0.2], [0.91, 0.27]]); // (the free hand at its side, the shield arm out to the shield)
  expect(r.spear).toEqual([[0.19, 0.5], [0.72, 0.5]]); // (both hands on the shaft: the back one near its middle)
  expect(r.spearShield).toEqual([[0.72, 0.5], [0.91, 0.27]]);
  expect(errors).toEqual([]);
});

test('a zombie reaches with both arms straight out in front of it; eating, facing away, the food goes behind it (#306)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('zombie-reach-test');
    const zombie = makeSettler(1, 300, 300, { facing: 0, type: 'zombie' }); // (the undead's own: bare hands)
    // the figure as drawn: its body's fill and its arms' hand circles, in the order they're drawn — a hand
    // drawn before the body's fill is an arm behind its body (#298)
    const drawn = unit => {
      const seq = [], arc = ctx.arc, fill = ctx.fill;
      ctx.arc = function (x, y, rad, ...rest) {
        if (Math.abs(rad - unit.visualRadius * 0.15) < 0.001) seq.push(`hand${+(y / unit.visualRadius).toFixed(2)}`);
        return arc.call(this, x, y, rad, ...rest);
      };
      ctx.fill = function (...a) { if (ctx.fillStyle === '#9b59b6') seq.push('body'); return fill.apply(this, a); };
      try { drawFigure(unit, { x: unit.x, y: unit.y, r: unit.visualRadius, body: '#9b59b6', skin: '#9fb38a', hand: true }); }
      finally { ctx.arc = arc; ctx.fill = fill; }
      return seq;
    };
    const eater = makeSettler(2, 300, 300, {});
    const withFood = facing => heldBehind({ ...eater, facing, eating: { icon: 'wheat' } });
    return {
      reach: zombieReach(zombie), // (facing sideways)
      right: drawn(zombie),
      away: drawn({ ...zombie, facing: -Math.PI / 2 }),
      eatingAway: withFood(-Math.PI / 2), eatingUs: withFood(Math.PI / 2), eatingRight: withFood(0)
    };
  });
  // both hands out at arm's length in front of it, a hand's width apart, at its shoulders' height: they
  // used to spread a load's width, so the lower one hung at its hip and that arm pointed down at the ground
  expect(r.reach.hand.x).toBeCloseTo(0.75 * 11);
  expect(r.reach.other.x).toBeCloseTo(0.75 * 11);
  expect(r.reach.hand.y).toBeLessThan(-0.05 * 11);
  expect(r.reach.other.y).toBeLessThan(-0.05 * 11);
  expect(Math.abs(r.reach.hand.y - r.reach.other.y)).toBeLessThan(0.4 * 11);
  expect(r.right[0]).toBe('body'); // (facing a side: both arms in front of its body)
  expect(r.right.filter(e => e === 'body').length).toBe(1);
  expect(r.right.filter(e => e !== 'body').length).toBe(2);
  expect(r.away.at(-1)).toBe('body'); // (facing away: both arms behind its body)
  expect(r.away.filter(e => e !== 'body').length).toBe(2);
  expect(r.eatingAway).toBe(true); // (eating, its food's in front of it: behind only when its face is turned away)
  expect(r.eatingUs).toBe(false);
  expect(r.eatingRight).toBe(false);
  expect(errors).toEqual([]);
});
