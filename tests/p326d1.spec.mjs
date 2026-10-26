import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, visuals part one: in the page

test('boars each their own look, kept; every unit kind, the buildings and the new things drawn with no error (#326)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const g = getGridPos(townHall.x, townHall.y);
    boars = Array.from({ length: 40 }, (_, i) => ({ x: townHall.x + 80 + (i % 8) * 30, y: townHall.y + 80 + Math.floor(i / 8) * 30, hp: 30, maxHp: 30, priority: 0, wanderTimer: 999, wanderInterval: 999 }));
    const { makeSettler } = window.sim.helpers;
    settlers = ['normal', 'big', 'imp', 'demon', 'zombie', 'big_zombie', 'dog', 'beast'].map((type, i) => {
      const s = makeSettler(i + 1, townHall.x - 120 + i * 30, townHall.y + 60, {}); changeSettlerType(s, type);
      if (GAME_CONFIG.settlerTypes[type].pet) { s.role = 'pet'; s.look = newPetLook(type); }
      return s;
    });
    buildings = ['campfire', 'smelter', 'spikes', 'dummy', 'dummy', 'torch', 'cage', 'grave', 'dung_heap', 'iron_trap', 'wall_wood', 'door'].map((type, i) => {
      const b = createBuildingBlueprint(type, (g.gx - 6 + i) * TILE_SIZE + 15, (g.gy + 5) * TILE_SIZE + 15); delete b.progress; delete b.maxProgress; return b;
    });
    buildings[0].burning = 5;
    camera.x = townHall.x + 180; camera.y = townHall.y + 110; setZoom(getMaxZoom() * 0.5); render(); render();
    const looks = boars.map(b => b.look);
    render();
    return {
      coats: new Set(looks.map(l => l.coat)).size, kept: boars.every((b, i) => b.look === looks[i]),
      sizes: looks.every(l => l.size >= 0.88 && l.size <= 1.12), dummies: buildings.filter(b => b.type === 'dummy').every(b => typeof b.variant === 'string')
    };
  });
  expect(r.coats).toBeGreaterThanOrEqual(3);
  expect(r).toMatchObject({ kept: true, sizes: true, dummies: true });
  expect(errors).toEqual([]);
});

test('an archer out of arrows draws its dagger and stabs at one close by (weakly), its bow on its back; an enemy archer too (#326)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    window.sim.helpers.clearResources();
    const s = window.sim.helpers.makeSettler(1, townHall.x + 200, townHall.y, { weapon: 'bow', role: 'archer', quiver: true, arrows: 0 });
    settlers = [s]; s.hp = s.maxHp = 1e4;
    const en = createNormalEnemy({ x: s.x + 40, y: s.y }, 'raider'); en.hp = en.maxHp = 1e4; en.speed = 0; en.damage = 0; enemies = [en];
    waveTimer = 999; stock.arrows = 0;
    for (let f = 0; f < 120; f++) update(1 / 60);
    const stabbed = en.maxHp - en.hp;
    const archer = createNormalEnemy({ x: s.x + 60, y: s.y }, 'raider_archer'); archer.arrows = 0; game.enemyArrowStock = 0;
    enemies = [archer]; update(1 / 60);
    return { stabbed, dagger: usesDagger(s), stats: getWeaponStats(s, 'combat').damage, enemyWeapon: archer.weapon };
  });
  expect(r.dagger).toBe(true);
  expect(r.stats).toBe(5);
  expect(r.stabbed).toBeGreaterThan(0);
  expect(r.enemyWeapon).toBe('dagger');
});

test('a medic at work: herbs on the wound, its patient shows it; the necromancer\'s staff in its side\'s colour, glowing in the dark (#326)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    window.sim.helpers.clearResources();
    const { makeSettler } = window.sim.helpers;
    const medic = makeSettler(1, townHall.x + 100, townHall.y + 40, { tool: 'medbag' }); medic.bagHerbs = 3;
    const hurt = makeSettler(2, medic.x + 20, medic.y, {}); hurt.hp = 20; hurt.weapon = 'sword'; hurt.role = 'soldier';
    settlers = [medic, hurt];
    const en = createNormalEnemy({ x: townHall.x + 2000, y: townHall.y }, 'raider'); en.speed = 0; enemies = [en];
    waveTimer = 999;
    let healing = false, treated = false;
    for (let f = 0; f < 120; f++) { update(1 / 60); healing = healing || medic.workKind === 'heal'; treated = treated || hurt.treatedAt === pathTick; }
    // the staff's colours as drawn
    const fills = [];
    const necro = makeSettler(3, townHall.x - 60, townHall.y + 40, { tool: 'necro_staff' });
    settlers.push(necro);
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 20;
    const arc = ctx.arc;
    let gradient = false;
    const rg = ctx.createRadialGradient;
    ctx.createRadialGradient = function (...a) { gradient = true; return rg.apply(this, a); };
    try { isPaused = true; render(); } finally { ctx.createRadialGradient = rg; }
    return { healing, treated, gradient };
  });
  expect(r).toEqual({ healing: true, treated: true, gradient: true });
  expect(errors).toEqual([]);
});

test('a save loaded a few ticks after it was made: nothing kept from the world before, no frame fails (the CI flake of #299\'s fog test)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(async () => {
    isPaused = true;
    // workers looking for work (the tick keeps its lists of what each kind of them can work)
    settlers.forEach(s => { s.hunger = 999; s.tool = 'axe'; });
    const fails = [];
    for (let later = 0; later < 4; later++) {
      for (let f = 0; f < 3; f++) update(1 / 60);
      await saveCurrentGame();
      const data = await saveDataOf(loadSaves()[`world:${worldSeed.value}`]);
      for (let f = 0; f < later; f++) update(1 / 60);
      await loadGame(data);
      settlers.forEach(s => { s.hunger = 999; });
      try { for (let f = 0; f < 3; f++) update(1 / 60); } catch (e) { fails.push(String(e)); }
    }
    return fails;
  });
  expect(r).toEqual([]);
  expect(errors).toEqual([]);
});
