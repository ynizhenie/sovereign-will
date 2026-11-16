import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('faction-specific rare looks happen at most once per game and reset in a new game', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    window.sim.start('rare-looks-test');
    const originalRandom = Math.random;
    try {
      game.rareAppearances = { pinkHair: false, demonSingleHorn: false, undeadCrossEyes: false };
      Math.random = () => 0.001;
      const atPinkThreshold = newLook('humans');
      Math.random = () => 0.0009;
      const pink = newLook('humans');
      const anotherPink = newLook('humans');
      const bigDemon = newLook('demons', true);
      const singleHorn = newLook('demons');
      const anotherHorn = newLook('demons');
      const crossEyes = newLook('undead');
      const anotherCrossEyes = newLook('undead');
      const appearedOnce = {
        pinkHair: !!pink.pinkHair && !atPinkThreshold.pinkHair && !anotherPink.pinkHair,
        demonSingleHorn: !bigDemon.singleHorn && !!singleHorn.singleHorn && !anotherHorn.singleHorn,
        undeadCrossEyes: !!crossEyes.crossEyes && !anotherCrossEyes.crossEyes,
        flags: { ...game.rareAppearances }
      };

      Math.random = () => 0.5;
      window.sim.start('rare-looks-new-game');
      Math.random = () => 0.0009;
      appearedOnce.pinkHairCanAppearAgain = !!newLook('humans').pinkHair;
      return appearedOnce;
    } finally {
      Math.random = originalRandom;
    }
  });
  expect(result).toEqual({
    pinkHair: true,
    demonSingleHorn: true,
    undeadCrossEyes: true,
    flags: { pinkHair: true, demonSingleHorn: true, undeadCrossEyes: true },
    pinkHairCanAppearAgain: true
  });
  expect(errors).toEqual([]);
});
