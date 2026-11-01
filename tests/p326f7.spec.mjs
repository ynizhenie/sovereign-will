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

test('enemies say their hurt phrase below 30% even just after a player speaks', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    isPaused = true;
    const speaker = createSettler('normal', 1, 300, 300);
    const playerSpoke = says(speaker, 'hired', true);
    const enemy = createConfiguredEnemy({ x: townHall.x + 200, y: townHall.y }, 'raider');
    const enemySpoke = speak(enemy, 'humans', 'taunt', true);
    enemy.hp = enemy.maxHp * 0.31;
    damageEnemy(enemy, enemy.maxHp * 0.02);
    const first = { text: enemy.say?.text, spokeAt: enemy.spokeAt };
    damageEnemy(enemy, enemy.maxHp * 0.02);
    const alreadyLow = createConfiguredEnemy({ x: townHall.x + 240, y: townHall.y }, 'raider');
    alreadyLow.hp = alreadyLow.maxHp * 0.29;
    tickEnemy(alreadyLow, 0);
    return {
      playerSpoke,
      enemySpoke,
      firstPhrase: t('voice.humans.hurt').split('|').includes(first.text),
      spokeOnce: enemy.spokeAt === first.spokeAt,
      catchesAlreadyLow: t('voice.humans.hurt').split('|').includes(alreadyLow.say?.text)
    };
  });
  expect(result).toEqual({ playerSpoke: true, enemySpoke: true, firstPhrase: true, spokeOnce: true, catchesAlreadyLow: true });
  expect(errors).toEqual([]);
});
