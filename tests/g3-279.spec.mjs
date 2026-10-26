import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's batch of fixes (#279), comment 1, part G3: Battles and the undead

test('Battles: every faction\'s buildings can be placed and stand through a fight; the enemy in armour with a shield (#279, c1.2, c1.4)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    const placed = {};
    let gx = 6;
    for (const faction of [null, 'humans', 'undead', 'demons']) { // (#326: everyone's, then each faction's own)
      battle.category = 'buildings';
      for (const id of getBattleBuildings(faction)) { battle.building = id; const p = at(gx % 32 + 4, 4 + Math.floor(gx / 32) * 2); battleTap(p.x, p.y); gx += 2; placed[id] = true; }
    }
    const standing = new Set(buildings.map(b => b.type));
    battle.category = 'units'; battle.armor = false; battle.shield = false;
    battle.preset = 'humans:sword'; battleTap(at(8, 14).x, at(8, 14).y);
    battle.category = 'units'; battle.armor = true; battle.shield = true;
    battle.preset = 'humans:sword'; battleTap(at(30, 14).x, at(30, 14).y);
    battle.preset = 'humans:bow'; battleTap(at(30, 16).x, at(30, 16).y);
    const raider = enemies.find(en => en.enemyKey === 'raider'), archer = enemies.find(en => en.enemyKey === 'raider_archer');
    startBattleFight();
    for (let f = 0; f < 600; f++) update(1 / 60);
    for (let f = 0; f < 5; f++) render();
    return {
      all: Object.keys(placed).every(id => standing.has(id)), count: Object.keys(placed).length,
      raider: { armor: raider.armor, shield: !!raider.shield }, archerShield: !!archer.shield
    };
  });
  expect(r.all).toBe(true);
  expect(r.count).toBeGreaterThanOrEqual(20);
  expect(r.raider).toEqual({ armor: 'iron', shield: true });
  expect(r.archerShield).toBe(false);
  expect(errors).toEqual([]);
});

test('the undead pay bones for every building, and their blight is in the Zones tab (#279, c1.3, c1.17)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const cost = () => ({ wall: { ...GAME_CONFIG.buildings.wall_wood.cost }, grave: { ...GAME_CONFIG.buildings.grave.cost }, smithy: { ...GAME_CONFIG.buildings.smithy.cost } });
    window.sim.start('costs-humans');
    const humans = cost();
    sides.player.faction = 'undead'; sides.player.color = '#9b59b6'; sides.enemy.color = '#e8572a';
    window.sim.start('costs-undead');
    const undead = cost();
    const blight = !document.querySelector('#tab-farming .undead-only').hidden && !document.getElementById('tab-btn-blight');
    // a wall ordered and built: the bones are paid
    Object.assign(stock, { wood: 50, stone: 50, bones: 50 });
    const bones0 = stock.bones;
    const g = getGridPos(townHall.x, townHall.y);
    buildMode = 'wall_wood';
    mouse.x = (g.gx + 4) * TILE_SIZE + 15; mouse.y = (g.gy + 3) * TILE_SIZE + 15; handleCanvasClick();
    for (let f = 0; f < 60 * 30 && !buildings.some(b => b.type === 'wall_wood'); f++) { update(1 / 60); waveTimer = 999; }
    const built = buildings.some(b => b.type === 'wall_wood');
    const paid = bones0 - stock.bones;
    sides.player.faction = 'humans'; sides.player.color = '#e9c46a';
    return { humans, undead, blight, built, paid };
  });
  expect(r.humans.wall.bones).toBeUndefined();
  expect(r.undead.wall.bones).toBeGreaterThanOrEqual(2);
  expect(r.undead.grave.bones).toBeGreaterThan(0);
  expect(r.undead.smithy.bones).toBeGreaterThan(0);
  expect(r.blight).toBe(true);
  expect(r.built).toBe(true);
  expect(r.paid).toBeGreaterThanOrEqual(r.undead.wall.bones - 1); // (bones made meanwhile by the hall)
  expect(errors).toEqual([]);
});
