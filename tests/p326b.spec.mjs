import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, Battles: in the page

async function openBattle(page) {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  return errors;
}
const at = (gx, gy) => ({ x: gx * 30 + 15, y: gy * 30 + 15 });

test('an enemy strikes a blow at a time, as yours do, not hp drained every tick (#326)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    window.sim.helpers.clearResources();
    const s = window.sim.helpers.makeSettler(1, townHall.x + 200, townHall.y);
    settlers = [s]; s.speed = 0;
    const en = createNormalEnemy({ x: s.x + 22, y: s.y }, 'raider'); en.speed = 0; enemies = [en];
    waveTimer = 999;
    const hits = [];
    let last = s.hp;
    for (let f = 0; f < 120; f++) { update(1 / 60); if (s.hp !== last) { hits.push(Math.round((last - s.hp) * 10) / 10); last = s.hp; } }
    return { hits, cooldown: GAME_CONFIG.weapons.sword.combat.cooldown };
  });
  // a sword every 0.4 s: five blows in two seconds, each a whole hit
  expect(r.hits.length).toBeGreaterThanOrEqual(4);
  expect(r.hits.length).toBeLessThanOrEqual(6);
  expect(Math.min(...r.hits)).toBeGreaterThan(5);
});

test('pets wear nothing: not in Battles, not in a wave, not among a camp\'s defenders (#326)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    battle.category = 'units'; battle.armor = 'iron'; battle.shield = true; battle.lineup = [];
    battle.preset = 'humans:pet'; battleTap(...Object.values({ x: 10 * 30 + 15, y: 10 * 30 + 15 })); battleTap(30 * 30 + 15, 10 * 30 + 15);
    const battleDogs = [settlers[0], enemies[0]].map(u => [u.armor || null, !!u.shield]);
    // a camp's soldiers are never pets (a dog came first for "raider")
    const soldiers = campDefenders([{ weapon: 'sword', type: 'normal' }]).map(k => GAME_CONFIG.enemies[k.id].pet || null);
    return { battleDogs, soldiers };
  });
  expect(r.battleDogs).toEqual([[null, false], [null, false]]);
  expect(r.soldiers.every(p => p === null)).toBe(true);
});

test('Battles: off the red strip but for one fleeing; ten colours, the winner named by its colour, the brooms on the sides\' colours; the music theme picked (#326)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    battle.lineup = []; battle.category = 'units'; battle.preset = 'humans:sword';
    battleTap(at(10, 10).x, at(10, 10).y);
    const s = settlers[0];
    s.x = 5; s.y = 5; clampEntityToBounds(s);
    const kept = [s.x, s.y];
    s.panic = true; s.x = 5; s.y = 5; clampEntityToBounds(s);
    const fled = [s.x, s.y];
    battle.winner = 'red'; battle.phase = 'result'; battle.resultTimer = 99; renderBattlePanel();
    const won = document.getElementById('battle-phase-label').textContent;
    battle.phase = 'setup'; renderBattlePanel();
    return { kept, fled, won, colors: GAME_CONFIG.factionColors.length, next: freeColor('#e8572a', '#e8572a'), broom: getComputedStyle(document.getElementById('battle-clear-red')).backgroundColor };
    function at(gx, gy) { return { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 }; }
  });
  expect(r.kept[0]).toBeGreaterThanOrEqual(60 + 11);
  expect(r.fled[0]).toBeLessThan(60);
  expect(r.won).toBe('Победили оранжевые!');
  expect(r.colors).toBe(10);
  expect(r.next).toBe('#c0392b'); // (the next one along the wheel, not the first free)
  expect(r.broom).toBe('rgb(232, 87, 42)');
  await page.click('[data-dock="battle-settings"]');
  await page.click('#battle-music [data-theme="demons"]');
  expect(await page.evaluate(() => battle.theme)).toBe('demons');
  expect(await page.evaluate(() => { audio.musicOn = true; return Object.keys(musicMix()).every(id => GAME_CONFIG.factions.demons.music.ambient.includes(id)); })).toBe(true); // (placing: its ambient)
  expect(errors).toEqual([]);
});

test('the Platform: no arrows kept, an archer up it with its own; in a battle up it for one enemy; a portal in its side\'s colour (#326)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    battle.lineup = [];
    battle.category = 'buildings'; battle.building = 'watchtower'; battleTap(10 * 30 + 15, 12 * 30 + 15);
    battle.building = 'portal'; battleTap(30 * 30 + 15, 8 * 30 + 15);
    battle.category = 'units'; battle.preset = 'humans:bow'; battleTap(8 * 30 + 15, 12 * 30 + 15);
    battle.preset = 'humans:sword'; battleTap(30 * 30 + 15, 12 * 30 + 15);
    startBattleFight();
    let up = false;
    for (let f = 0; f < 300 && !up; f++) { update(1 / 60); up = !!settlers[0].towerAssignment; }
    const portal = buildings.find(b => b.type === 'portal');
    return { up, keeps: 'arrowCapacity' in GAME_CONFIG.buildings.watchtower.build.tower, name: GAME_CONFIG.buildings.watchtower.label, portal: getBuildingColor(portal) === sides.battle.red };
  });
  expect(r).toEqual({ up: true, keeps: false, name: 'Платформа', portal: true });
});
