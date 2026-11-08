import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// (#397, 6) At night an enemy camp's torches and fire lit up the fog round them: a light where the colony sees
// nothing now isn't drawn, as an enemy's own torch wasn't (#326)
test('at night an enemy camp\'s lights in the fog aren\'t seen; once it\'s in sight they are', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const c = GAME_CONFIG.daytime;
    dayTime = c.morning + c.day + c.evening + 20;
    const lit = buildings.filter(b => b.enemyCampStructure && ((b.type === 'torch' && b.lit) || b.type === 'campfire'));
    lit.forEach(b => { if (b.type === 'campfire') b.fuelLeft = 100; });
    const near = (l, b) => Math.hypot(l.x - b.x, l.y - b.y) < 1;
    const shown = () => lit.filter(b => getLights().some(l => near(l, b))).length;
    tickFog(GAME_CONFIG.fog.everySeconds);
    const hidden = lit.every(b => !isVisible(b.x, b.y));
    const inFog = shown();
    // a settler goes up to the camp: in sight now
    const s = settlers[0], at = { x: s.x, y: s.y };
    s.x = lit[0].x - 40; s.y = lit[0].y; s.torchInHand = true;
    tickFog(GAME_CONFIG.fog.everySeconds);
    const inSight = getLights().some(l => near(l, lit[0])) && isVisible(lit[0].x, lit[0].y);
    s.x = at.x; s.y = at.y; s.torchInHand = false;
    // gone again: explored, not seen
    tickFog(GAME_CONFIG.fog.everySeconds);
    const explored = isExplored(lit[0].x, lit[0].y) && !isVisible(lit[0].x, lit[0].y);
    return { lights: lit.length > 0, hidden, inFog, inSight, explored, afterwards: shown() };
  });
  expect(r).toEqual({ lights: true, hidden: true, inFog: 0, inSight: true, explored: true, afterwards: 0 });
  expect(errors).toEqual([]);
});
