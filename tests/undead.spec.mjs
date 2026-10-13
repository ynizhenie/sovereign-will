import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

test('the undead: zombies only to hire, the staff, no farming or food, blight; graves add 1 and make bones and rot (#164)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'undeadColony');
  expect(r.startUnits).toEqual(['zombie', 'zombie']);
  expect(r.hire).toEqual(['btn-hire-zombie', 'btn-hire-big_zombie', 'btn-upgrade']);
  expect(r.tools).toContain('btn-necro_staff');
  expect(r.tools).not.toContain('btn-hoe');
  expect(r.tools).not.toContain('btn-medbag');
  expect(r.gear).not.toContain('btn-wateringCan');
  expect(r.build).not.toContain('btn-campfire');
  expect(r).toMatchObject({ farmingTab: false, blightTab: true, foodTile: false, food: 0, foodAfter: 0 });
  expect(r.maxPop).toBe(await page.evaluate(() => GAME_CONFIG.start.population) + 1);
  expect(r.bonesMade).toBe(3.5); // graveyard 0.25 + grave 0.1 a second, 10 s
  expect(r.rotMade).toBe(1);     // grave 0.1 a second
  expect(r).toMatchObject({ fromMeat: 3, fromBerries: 2 });
});

