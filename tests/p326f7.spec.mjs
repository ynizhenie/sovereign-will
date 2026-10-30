import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), phrases between the factions (24)

test('the undead against the undead want no brains, demons against them no fresh meat; walls are named only when the colony has some (#326, 27.10, 24)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const all = (faction, event, enemy) => phrasesFor(enemy ? { enemyKey: 'x' } : {}, faction, event).join('|');
    const brains = /мозг|живы|плоть|свеж/i;
    setSideFaction('player', 'undead'); setSideFaction('enemy', 'undead');
    const undeadBoth = ['wave', 'charge', 'taunt', 'kill'].map(e => all('undead', e, e === 'charge' || e === 'taunt')).join('|');
    setSideFaction('player', 'humans');
    const undeadVsHumans = all('undead', 'taunt', true) + '|' + all('undead', 'wave', false);
    setSideFaction('player', 'demons');
    const demonsVsUndead = all('demons', 'wave', false);
    // walls: none built, none named; a wall built, named
    setSideFaction('player', 'humans'); setSideFaction('enemy', 'humans');
    buildings = buildings.filter(b => !['wall_wood', 'wall_stone', 'door', 'iron_door'].includes(b.type));
    const noWalls = all('humans', 'taunt', true) + '|' + all('humans', 'wave', false);
    buildings.push({ type: 'wall_wood', x: townHall.x + 90, y: townHall.y, hp: 100, maxHp: 100 });
    const walls = all('humans', 'taunt', true) + '|' + all('humans', 'wave', false);
    return { undeadBoth: brains.test(undeadBoth), undeadVsHumans: brains.test(undeadVsHumans), demonsVsUndead: /свеж/i.test(demonsVsUndead),
      noWalls: /стен/i.test(noWalls), walls: /стен/i.test(walls) };
  });
  expect(r).toEqual({ undeadBoth: false, undeadVsHumans: true, demonsVsUndead: false, noWalls: false, walls: true });
  expect(errors).toEqual([]);
});
