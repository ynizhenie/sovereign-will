import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, control: the selected settler's card, orders by tap, a group, its way drawn

async function start(page) {
  const errors = await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => {
    isPaused = true;
    window.sim.helpers.clearResources();
    const { makeSettler } = window.sim.helpers;
    settlers = [0, 1, 2, 3].map(i => makeSettler(i + 1, townHall.x + 80 + i * 30, townHall.y + 60));
    settlers[0].weapon = settlers[1].weapon = 'sword';
    settlers[0].role = settlers[1].role = 'soldier';
    enemies = []; waveTimer = 999;
  });
  return errors;
}

test('the card\'s Give lists what in the armory it can take; a tap hands it over; the Craft tab gives no more to the selected one (#326)', async ({ page }) => {
  const errors = await start(page);
  await page.evaluate(() => { armory['weapons:spear'] = 1; armory['tools:axe'] = 1; armory['gear:shield'] = 1; selectedSettler = settlers[2]; updateUI(); });
  await expect(page.locator('#btn-give')).toBeVisible();
  await page.click('#btn-give');
  await page.evaluate(() => updateUI());
  const list = page.locator('#give-list [data-give]');
  await expect(list).toHaveCount(2); // (a shield: not for a worker with bare hands)
  await page.click('#give-list [data-give="weapons:spear"]');
  expect(await page.evaluate(() => [settlers[2].targetEquipment && settlers[2].targetEquipment.weapon, armory['weapons:spear']])).toEqual(['spear', 0]);
  // a stored axe handed out from the Craft tab goes to whoever needs one, not to the one selected
  const r = await page.evaluate(() => { selectedSettler = settlers[0]; giveStored('tools', 'axe'); return settlers.findIndex(s => s.targetEquipment && s.targetEquipment.tool === 'axe'); });
  expect(r).not.toBe(0);
  expect(errors).toEqual([]);
});

test('orders by tap in Endless: the ground held, an enemy fought then back to work, Free lets go; a group: all soldiers, or added by taps (#326)', async ({ page }) => {
  await start(page);
  const r = await page.evaluate(() => {
    const [a, b, c] = settlers;
    selectedSettler = a;
    selectAllSoldiers();
    const group = getSelection().map(s => s.id);
    game.addingToGroup = true; mouse.x = c.x; mouse.y = c.y; buildMode = 'interact'; handleCanvasClick();
    const added = getSelection().includes(c);
    game.addingToGroup = false;
    // the ground: they go and hold it
    const spot = { x: townHall.x + 200, y: townHall.y - 150 };
    mouse.x = spot.x; mouse.y = spot.y; handleCanvasClick();
    isPaused = false;
    for (let f = 0; f < 60 * 8; f++) update(1 / 60);
    const there = getSelection().every(s => Math.hypot(s.x - spot.x, s.y - spot.y) < 45);
    const held = getSelection().every(s => s.activity === 'followCommand');
    // an enemy: fought, then back to work (no spot any more)
    freeSelection();
    const en = createNormalEnemy({ x: a.x + 100, y: a.y }, 'raider_fist'); en.hp = en.maxHp = 5; en.speed = 0; enemies = [en];
    selectedGroup = [];
    mouse.x = en.x; mouse.y = en.y; handleCanvasClick();
    const told = a.orderTarget === en;
    for (let f = 0; f < 60 * 6 && enemies.includes(en); f++) update(1 / 60);
    for (let f = 0; f < 5; f++) update(1 / 60);
    return { group, added, there, held, told, killed: !enemies.includes(en), free: !a.orderTarget && !a.orderSpot };
    function freeSelection() { for (const s of getSelection()) clearOrders(s); }
  });
  expect(r.group).toEqual([1, 2]);
  expect(r).toMatchObject({ added: true, there: true, held: true, told: true, killed: true, free: true });
});

test('the picked ones\' ways drawn dashed, moving; the card shows the group and the Free button while they hold (#326)', async ({ page }) => {
  const errors = await start(page);
  const r = await page.evaluate(() => {
    selectedSettler = settlers[0]; selectAllSoldiers();
    commandTap(getSelection(), townHall.x + 260, townHall.y + 140);
    for (let f = 0; f < 5; f++) update(1 / 60);
    const dashes = [];
    const setLineDash = ctx.setLineDash;
    ctx.setLineDash = function (d) { dashes.push(d.length); return setLineDash.call(this, d); };
    try { render(); } finally { ctx.setLineDash = setLineDash; }
    updateUI();
    return { dashed: dashes.some(n => n > 0), group: document.getElementById('selected-group-txt').textContent, free: getComputedStyle(document.getElementById('btn-free')).display !== 'none' };
  });
  expect(r).toEqual({ dashed: true, group: 'выбрано: 2', free: true });
  expect(errors).toEqual([]);
});

test('in a battle the picked group goes where it is told, an enemy tapped is theirs (#326)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battle.lineup = []; battle.category = 'units'; battle.preset = 'humans:sword';
    for (const gy of [10, 12, 14]) battleTap(at(8, gy).x, at(8, gy).y);
    battleTap(at(32, 12).x, at(32, 12).y);
    startBattleFight();
    selectedSettler = settlers[0]; game.addingToGroup = true;
    orderTap(settlers[1].x, settlers[1].y);
    game.addingToGroup = false;
    orderTap(enemies[0].x, enemies[0].y);
    return settlers.map(s => s.orderTarget === enemies[0]);
  });
  expect(r).toEqual([true, true, false]);
});
