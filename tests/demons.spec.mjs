import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

test('the demons: imps to start, their own units, a sacrificial circle and portals instead of tents (#43)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'demonColony')).toEqual({
    startUnits: ['imp', 'imp'], hire: ['btn-hire-imp', 'btn-hire-demon', 'btn-hire-beast', 'btn-upgrade'], // (and their pet, #314)
    tent: false, circle: true, portal: true, fireImp: { type: 'imp', weapon: 'bow', role: 'archer' } // (an imp with a bow, #249)
  });
});

