import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #314: each faction's pet, letting a settler go, who's turned big first

const start = async (page, faction) => {
  const errors = await openGame(page);
  await page.evaluate(f => { setSideFaction('player', f); mapSettings = { cols: 40, rows: 40 }; window.sim.start('pets-' + f); stock.food = 200; stock.stone = 50; stock.bones = 50; stock.rot = 50; buildings.push({ type: f === 'undead' ? 'grave' : 'tent', x: townHall.x - 120, y: townHall.y + 90, hp: 100, maxHp: 100 }); }, faction);
  return errors;
};

test('a dog is hired at the hall, keeps by a soldier, bites an enemy near, flushes a boar from the grass, gets hungry and is fed (#314)', async ({ page }) => {
  const errors = await start(page, 'humans');
  const r = await page.evaluate(() => {
    const units = getPlayerFaction().units;
    spawnSettler('dog');
    const dog = settlers.find(s => s.type === 'dog');
    dog.id = 7; dog.petSleep = 0; // (its place by its keeper goes by its id)
    // clear ground off to one side, and a soldier there (held where it is): the dog goes to it
    const spot = { x: townHall.x + 210, y: townHall.y };
    for (const list of ['trees', 'boulders', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'naturalRocks', 'waterTiles', 'cacti']) game[list] = game[list].filter(o => Math.hypot(o.x - spot.x, o.y - spot.y) > 170);
    const soldier = settlers.find(s => s.type === 'normal');
    Object.assign(soldier, { weapon: 'sword', role: 'soldier', x: spot.x, y: spot.y, isPossessed: true });
    window.sim.run(4);
    const byKeeper = Math.hypot(dog.x - soldier.x, dog.y - soldier.y);
    // an enemy near: bitten
    const en = createNormalEnemy({ x: spot.x + 30, y: spot.y + 70 }, 'raider'); en.speed = 0; en.damage = 0; enemies = [en];
    const hp = en.hp;
    window.sim.run(3);
    const bitten = hp - en.hp;
    enemies = [];
    // a boar hidden in the grass near: flushed out
    const grass = addMapResource('grass', spot.x + 15, spot.y - 75);
    const boar = { x: grass.x, y: grass.y, hp: 30, maxHp: 30, priority: 0, hidden: true, hideTarget: grass, hideTimer: 99, wanderTimer: 0, wanderInterval: 4, targetX: grass.x, targetY: grass.y };
    boars = [boar];
    for (let f = 0; f < 600 && boar.hidden; f++) update(1 / 60);
    const flushed = !boar.hidden;
    soldier.isPossessed = false;
    // hungry: a settler brings it food from the stock
    dog.petHunger = 1; const meat = (stock.rawMeat = 5);
    for (let f = 0; f < 60 * 30 && dog.petHunger >= 1; f++) update(1 / 60);
    return { units, byKeeper, bitten, flushed, fed: dog.petHunger < 1, meatUsed: meat - stock.rawMeat, role: dog.role, look: dog.look };
  });
  expect(r.units).toContain('dog');
  expect(r.byKeeper).toBeLessThan(80);
  expect(r.bitten).toBeGreaterThan(0);
  expect(r.flushed).toBe(true);
  expect(r.fed).toBe(true);
  expect(r.meatUsed).toBe(1);
  expect(r.role).toBe('pet');
  expect(typeof r.look.female).toBe('boolean');
  expect(errors).toEqual([]);
});

test('a dog without allied soldiers advances toward an enemy instead of wandering off', async ({ page }) => {
  const errors = await start(page, 'humans');
  const result = await page.evaluate(() => {
    spawnSettler('dog');
    const dog = settlers.find(s => s.type === 'dog');
    Object.assign(dog, { x: townHall.x + 180, y: townHall.y, petSleep: 0 });
    game.settlers = [dog];
    const foe = createNormalEnemy({ x: dog.x + 300, y: dog.y }, 'raider');
    foe.speed = 0;
    game.enemies = [foe];
    const before = Math.hypot(foe.x - dog.x, foe.y - dog.y);
    window.sim.run(1);
    return { closer: Math.hypot(foe.x - dog.x, foe.y - dog.y) < before, activity: dog.activity };
  });
  expect(result).toEqual({ closer: true, activity: 'petFight' });
  expect(errors).toEqual([]);
});

test('a player dog bite timestamp is not refreshed during its attack cooldown', async ({ page }) => {
  const errors = await start(page, 'humans');
  const result = await page.evaluate(() => {
    spawnSettler('dog');
    const dog = settlers.find(s => s.type === 'dog');
    const foe = createNormalEnemy({ x: dog.x + 20, y: dog.y }, 'raider');
    foe.speed = 0;
    game.enemies = [foe];
    window.sim.run(1 / 60);
    const struckAt = dog.struckAt;
    const swinging = dog.swingT > 0;
    window.sim.run(1 / 60);
    return { struck: struckAt !== undefined, swinging, heldDuringCooldown: dog.struckAt === struckAt };
  });
  expect(result).toEqual({ struck: true, swinging: true, heldDuringCooldown: true });
  expect(errors).toEqual([]);
});

test('a dog sleeps with no enemy about and wakes for a wave; nothing is handed to a pet; it doesn\'t talk (#314)', async ({ page }) => {
  const errors = await start(page, 'humans');
  const r = await page.evaluate(() => {
    spawnSettler('dog');
    const dog = settlers.find(s => s.type === 'dog');
    dog.petSleep = 30; window.sim.run(1);
    const slept = dog.petSleep > 0 && dog.activity === 'petSleep';
    enemies = [createNormalEnemy({ x: dog.x + 80, y: dog.y }, 'raider')];
    window.sim.run(0.5);
    const woke = !(dog.petSleep > 0);
    enemies = [];
    // a sword ordered with the dog selected goes to someone else; nothing ordered sticks to it
    selectedSettler = dog; game.armory['weapons:sword'] = 1; craftWeapon('sword');
    const notToDog = !dog.targetEquipment && dog.weapon === 'fist';
    return { slept, woke, notToDog, says: says(dog, 'hired', true) };
  });
  expect(r).toEqual({ slept: true, woke: true, notToDog: true, says: false });
  expect(errors).toEqual([]);
});

test('enemy pets do not speak', async ({ page }) => {
  const errors = await start(page, 'humans');
  const result = await page.evaluate(() => {
    const pets = ['raider_dog', 'demon_beast', 'undead_ghost'].map(key =>
      createConfiguredEnemy({ x: townHall.x + 200, y: townHall.y }, key));
    return pets.map(pet => speak(pet, 'humans', 'taunt', true) || !!pet.say);
  });
  expect(result).toEqual([false, false, false]);
  expect(errors).toEqual([]);
});

test('a hellhound eats a corpse by itself when hungry (#314)', async ({ page }) => {
  const errors = await start(page, 'demons');
  const r = await page.evaluate(() => {
    spawnSettler('beast');
    const beast = settlers.find(s => s.type === 'beast');
    beast.petHunger = 1; foodMix = {}; stock.food = 0; stock.rawMeat = 0; stock.cookedMeat = 0; stock.rawFish = 0; stock.cookedFish = 0; stock.bread = 0; stock.berries = 0; stock.apples = 0; // (none at all: a settler would feed it first)
    const corpse = { x: beast.x + 70, y: beast.y + 10, age: 0, kind: 'raider', side: 'enemy' };
    corpses = [corpse];
    for (let f = 0; f < 60 * 15 && corpses.includes(corpse); f++) update(1 / 60);
    return { eaten: !corpses.includes(corpse), fed: beast.petHunger < 1, units: getPlayerFaction().units };
  });
  expect(r).toMatchObject({ eaten: true, fed: true });
  expect(r.units).toContain('beast');
  expect(errors).toEqual([]);
});

test('a ghost hovers by a grave, can\'t be hurt, flies into an enemy that comes near: it panics, the ghost is gone a while and back by a grave (#314)', async ({ page }) => {
  const errors = await start(page, 'undead');
  const r = await page.evaluate(() => {
    stock.souls = 1; // (a ghost costs a soul, #326)
    spawnSettler('ghost');
    const ghost = settlers.find(s => s.type === 'ghost');
    const grave = buildings.find(b => b.type === 'grave');
    window.sim.run(3);
    const byGrave = Math.hypot(ghost.x - grave.x, ghost.y - grave.y);
    damageSettler(ghost, 999);
    const unhurt = ghost.hp === ghost.maxHp;
    const enemyGhost = createNormalEnemy({ x: ghost.x + 20, y: ghost.y }, 'raider');
    Object.assign(enemyGhost, { enemyKey: 'undead_ghost', ghostly: true, hp: 30, maxHp: 30 });
    const en = createNormalEnemy({ x: ghost.x + 100, y: ghost.y }, 'raider'); en.speed = 0; // (a living one: the undead never panic, #326)
    enemies = [enemyGhost, en];
    let panicked = false;
    for (let f = 0; f < 300 && !panicked; f++) { update(1 / 60); panicked = !!en.panic; }
    const gone = ghost.ghostGone > 0;
    const ignoredGhost = !(enemyGhost.ghostHits > 0);
    const ignoredPlayerGhost = !(ghost.ghostHits > 0);
    enemies = [];
    ghost.ghostGone = 0.05; window.sim.run(1);
    return { byGrave, unhurt, panicked, gone, ignoredGhost, ignoredPlayerGhost, back: !(ghost.ghostGone > 0), backByGrave: Math.hypot(ghost.x - grave.x, ghost.y - grave.y) };
  });
  expect(r.byGrave).toBeLessThan(60);
  expect(r).toMatchObject({ unhurt: true, panicked: true, gone: true, ignoredGhost: true, ignoredPlayerGhost: true, back: true });
  expect(r.backByGrave).toBeLessThan(60);
  expect(errors).toEqual([]);
});

test('ghosts are tinted with their side colour', async ({ page }) => {
  await openGame(page);
  const colors = await page.evaluate(() => {
    game.gameMode = 'endless';
    sides.player.color = '#3498db';
    sides.enemy.color = '#e74c3c';
    const fill = ctx.fill, stroke = ctx.stroke;
    const painted = [];
    ctx.fill = function (...args) { painted.push(this.fillStyle); return fill.apply(this, args); };
    ctx.stroke = function (...args) { painted.push(this.strokeStyle); return stroke.apply(this, args); };
    const ghost = { x: 100, y: 100, radius: 10, visualRadius: 10, facing: 0, ghostGone: 0, look: { coat: 0 } };
    try {
      drawPet(ghost, 'ghost', false);
      const player = [...painted];
      painted.length = 0;
      drawPet(ghost, 'ghost', true);
      return { player, enemy: painted };
    } finally {
      ctx.fill = fill;
      ctx.stroke = stroke;
    }
  });
  expect(colors.player).toContain('#3498db');
  expect(colors.enemy).toContain('#e74c3c');
});

test('a settler let go puts its gear in the store and walks away; its place free at once (#314)', async ({ page }) => {
  const errors = await start(page, 'humans');
  await page.evaluate(() => { isPaused = false; });
  const r = await page.evaluate(() => {
    const s = settlers[0];
    Object.assign(s, { weapon: 'iron_sword', role: 'soldier', tool: 'none', shield: true });
    const pop = getCurrentPop(), swords = game.armory['weapons:iron_sword'] || 0, shields = game.armory['gear:shield'] || 0;
    const done = dismissSettler(s);
    const popAfter = getCurrentPop();
    for (let f = 0; f < 60 * 40 && settlers.includes(s); f++) update(1 / 60);
    return { done, popDrop: pop - popAfter, swords: (game.armory['weapons:iron_sword'] || 0) - swords, shields: (game.armory['gear:shield'] || 0) - shields, gone: !settlers.includes(s), corpses: corpses.length };
  });
  expect(r).toEqual({ done: true, popDrop: 1, swords: 1, shields: 1, gone: true, corpses: 0 });
  // the button asks first
  await page.evaluate(() => { selectedSettler = settlers[0]; updateUI(); });
  await expect(page.locator('#btn-dismiss')).toBeVisible();
  await page.click('#btn-dismiss');
  await expect(page.locator('#btn-dismiss')).toContainText('?');
  const before = await page.evaluate(() => settlers.filter(s => !s.leaving).length);
  await page.click('#btn-dismiss');
  expect(await page.evaluate(() => settlers.filter(s => !s.leaving).length)).toBe(before - 1);
  expect(errors).toEqual([]);
});

test('turned big with none picked: the best armed and armoured soldier first (#314)', async ({ page }) => {
  const errors = await start(page, 'humans');
  const r = await page.evaluate(() => {
    const make = (id, extra) => { const s = window.sim.helpers.makeSettler(id, townHall.x + id * 10, townHall.y + 80, extra); settlers.push(s); return s; };
    settlers = [];
    make(1, {}); make(2, { weapon: 'sword', role: 'soldier' }); make(3, { weapon: 'iron_sword', role: 'soldier', armor: 'leather' }); make(4, { weapon: 'iron_spear', role: 'soldier', armor: 'iron', maxHp: 150, hp: 150 });
    buildings.push({ type: 'tent', x: 0, y: 0 }, { type: 'tent', x: 30, y: 0 });
    stock.food = 100; stock.wood = 100; selectedSettler = null;
    upgradeToBig();
    const first = settlers.find(s => s.type === 'big').id;
    upgradeToBig();
    const second = settlers.filter(s => s.type === 'big').map(s => s.id).find(id => id !== first);
    return { first, second };
  });
  expect(r).toEqual({ first: 4, second: 3 });
  expect(errors).toEqual([]);
});

test('enemy ghosts split between enemy necromancers and stay with them until settlers come near (#314)', async ({ page }) => {
  const errors = await start(page, 'humans');
  const result = await page.evaluate(() => {
    const y = townHall.y;
    const first = createConfiguredEnemy({ x: townHall.x - 400, y }, 'undead_necromancer');
    const second = createConfiguredEnemy({ x: townHall.x + 400, y }, 'undead_necromancer');
    const ghosts = Array.from({ length: 4 }, (_, i) =>
      createConfiguredEnemy({ x: first.x + 20 + i, y: y + 20 }, 'undead_ghost'));
    enemies = [first, second, ...ghosts];
    window.sim.run(1);
    return {
      firstCount: ghosts.filter(ghost => ghost.escort === first).length,
      secondCount: ghosts.filter(ghost => ghost.escort === second).length,
      stayNearNecromancer: ghosts.every(ghost => Math.hypot(ghost.x - ghost.escort.x, ghost.y - ghost.escort.y) < 100),
      noDive: ghosts.every(ghost => !ghost.fled)
    };
  });
  expect(result).toEqual({ firstCount: 3, secondCount: 1, stayNearNecromancer: true, noDive: true });
  expect(errors).toEqual([]);
});

test('pets in Battles on both sides, and possessed: a dog bites what\'s tapped, a ghost flies into it (#314)', async ({ page }) => {
  const errors = await start(page, 'humans');
  const r = await page.evaluate(() => {
    // (#326: one pet preset each faction, either side)
    const pets = BATTLE_PRESETS.filter(p => p.preset === 'pet');
    const own = pets.map(p => p.type).sort();
    const foes = pets.map(p => presetEnemyKey(p.faction, p.preset)).sort();
    // possessed dog: tap an enemy, bitten
    spawnSettler('dog');
    const dog = settlers.find(s => s.type === 'dog');
    const en = createNormalEnemy({ x: dog.x + 60, y: dog.y }, 'raider'); en.speed = 0; enemies = [en];
    dog.isPossessed = true;
    orderPossessed(dog, en.x, en.y);
    const hp = en.hp; window.sim.run(3);
    return { own, foes, bitten: hp - en.hp };
  });
  expect(r.own).toEqual(['beast', 'dog', 'ghost']);
  expect(r.foes.length).toBe(3);
  expect(r.bitten).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
