import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// A list's things are saved as references to one another: the camps' own list was saved as references to itself,
// and loaded, a camp had no place, and what was laid out by it and whoever went near had none either (NaN)
test('an enemy camp comes back from a save where it was, and nothing on the map loses its place', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(async () => {
    isPaused = true;
    const camp = { x: enemyCamp.x, y: enemyCamp.y, id: enemyCamp.id };
    const guards = enemies.filter(en => en.campGuard).length, parts = buildings.filter(b => b.enemyCampStructure).length;
    await saveCurrentGame();
    await loadGame(await saveDataOf(loadSaves()[`world:${worldSeed.value}`]));
    for (let f = 0; f < 30; f++) update(1 / 60);
    const lost = [...settlers, ...enemies, ...buildings, ...enemyTents].filter(o => !Number.isFinite(o.x) || !Number.isFinite(o.y)).length;
    return {
      place: enemyCamp.x === camp.x && enemyCamp.y === camp.y && enemyCamp.id === camp.id,
      one: enemyCamp === enemyCamps[0] && enemyCamps.length === 1,
      guards: enemies.filter(en => en.campGuard).length === guards,
      parts: buildings.filter(b => b.enemyCampStructure).length === parts,
      lost
    };
  });
  expect(r).toEqual({ place: true, one: true, guards: true, parts: true, lost: 0 });
  expect(errors).toEqual([]);
});
