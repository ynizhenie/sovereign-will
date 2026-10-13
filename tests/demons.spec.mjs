import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('the demons: imps to start, their own units, a sacrificial circle and portals instead of tents (#43)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'demonColony')).toEqual({
    startUnits: ['imp', 'imp'], hire: ['btn-hire-imp', 'btn-hire-demon', 'btn-upgrade'],
    tent: false, circle: true, portal: true, fireImp: { type: 'fire_imp', weapon: 'bow', role: 'archer' }
  });
});

