import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #298, part 3 (1): what's held and worn drawn behind or in front of the body by the way it faces
test('facing away, what\'s in its hands is behind it and its back in front; facing us, the other way; the shield on the other arm (#298, 1)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    const at = (facing, extra = {}) => { const s = makeSettler(1, 0, 0, { weapon: 'sword', role: 'soldier', ...extra }); s.facing = facing; return s; };
    const up = at(-Math.PI / 2), down = at(Math.PI / 2), left = at(Math.PI), right = at(0);
    const carrierUp = at(-Math.PI / 2, { carrying: { type: 'stone', amount: 3, loads: 1 } }), carrierDown = at(Math.PI / 2, { carrying: { type: 'stone', amount: 3, loads: 1 } });
    // every way, every kind of thing, drawn with no error
    const { clearResources } = window.sim.helpers;
    clearResources();
    settlers = [];
    for (let i = 0; i < 8; i++) {
      for (const extra of [{ weapon: 'sword', shield: true, backpack: true }, { weapon: 'bow', role: 'archer', quiver: true, arrows: 9 }, { tool: 'axe', working: 0.1 }, { carrying: { type: 'corpse', amount: 1 } }, { wateringCan: true, tool: 'hoe' }]) {
        const s = makeSettler(settlers.length + 1, townHall.x + 80 + i * 30, townHall.y + 60 + settlers.length % 5 * 30, extra); s.facing = i * Math.PI / 4; settlers.push(s);
      }
      const en = createConfiguredEnemy({ x: townHall.x + 80 + i * 30, y: townHall.y - 60 }, 'raider_archer'); en.facing = i * Math.PI / 4; enemies.push(en);
    }
    for (let f = 0; f < 3; f++) render();
    return {
      held: { up: heldBehind(up), down: heldBehind(down), left: heldBehind(left), right: heldBehind(right) },
      back: { up: backBehind(up), down: backBehind(down) },
      carried: { up: heldBehind(carrierUp), down: heldBehind(carrierDown) },
      shield: { right: handSide(right), left: handSide(left) },
      away: facesAway(up)
    };
  });
  expect(r.held).toEqual({ up: true, down: false, left: true, right: false });
  expect(r.back).toEqual({ up: false, down: true });
  expect(r.carried).toEqual({ up: true, down: false });
  expect(r.shield).toEqual({ right: 1, left: -1 });
  expect(r.away).toBe(true);
  expect(errors).toEqual([]);
});
