import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #306, part A: Battles (1, 2, 3), the HUD's icons (6), the cards (10), the wheat (11), more phrases (5)

test('Battles: the undead and demons look their own, combat is always automatic, the sides\' colours chosen (#306, 1-3)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    const kin = type => unitKin(makeSettler(1, 0, 0, { type }));
    const kinds = { zombie: kin('zombie'), imp: kin('imp'), normal: kin('normal') };
    setBattleColor('green', '#3498db'); setBattleColor('red', '#3498db'); // (the other's: refused)
    return { kinds, hasAutoControl: !!document.querySelector('[data-battle-auto], #battle-auto'), green: getSettlerColor(), red: sides.battle.red, swatches: document.querySelectorAll('#battle-colors-green .color-swatch').length };
  });
  expect(r.kinds).toEqual({ zombie: 'undead', imp: 'demons', normal: 'humans' });
  expect(r.hasAutoControl).toBe(false);
  expect(r.green).toBe('#3498db');
  expect(r.red).not.toBe('#3498db');
  expect(r.swatches).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('cards: a sword from the start, arrows only with the bow; wheat ripe in 45 s; the smithy its own icon; new stories in every language (#306, 10, 11, 6, 5)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    cardMode = true;
    const sword = isLocked('weapons', 'sword'), arrows = isLocked('recipes', 'arrows');
    unlocked['weapons:bow'] = true;
    const arrowsAfter = isLocked('recipes', 'arrows');
    cardMode = false; delete unlocked['weapons:bow'];
    const plot = { x: 0, y: 0, growth: 0 }; farmPlots.push(plot);
    let ripeAt = null;
    for (let f = 0; f < 60 * 60 && ripeAt === null; f++) { update(1 / 60); waveTimer = 999; if (plot.growth >= 100) ripeAt = f / 60; }
    const stories = ['hunted', 'fished', 'farmed', 'crafted'].every(k => t(`voice.story.${k}`, { n: 2 }) !== `voice.story.${k}` && t(`voice.story.${k}`, { n: 2 }).includes('|'));
    return { sword, arrows, arrowsAfter, ripeAt: Math.round(ripeAt || 0), smithy: GAME_CONFIG.buildings.smithy.icon, stories };
  });
  expect(r).toEqual({ sword: false, arrows: true, arrowsAfter: false, ripeAt: 45, smithy: 'smithy', stories: true });
  expect(errors).toEqual([]);
});
