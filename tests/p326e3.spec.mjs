import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

async function openBattle(page) {
  const errors = await openGame(page);
  await page.evaluate(() => { showMenuScreen('home'); startBattleMode(); });
  return errors;
}

test('Battles use shared day and night music, with a hidden Backrooms track', async ({ page }) => {
  const errors = await openBattle(page);
  const result = await page.evaluate(() => {
    audio.musicOn = true;
    const pick = () => Object.keys(musicMix())[0];
    const music = GAME_CONFIG.battleMusic;
    const daySetup = ['glade', 'desert', 'savanna'].map(field => {
      battle.field = field; battle.phase = 'setup'; battle.time = 'day';
      return pick();
    });
    battle.field = 'glade'; battle.phase = 'setup'; battle.time = 'night';
    const nightSetup = pick();
    battle.phase = 'fight'; battle.time = 'day';
    const dayFight = pick();
    battle.time = 'night';
    const nightFight = pick();
    battle.field = 'backrooms'; battle.phase = 'setup';
    const backroomsSetup = pick();
    battle.phase = 'fight';
    const backroomsFight = pick();
    const catalogIds = musicCatalog().flatMap(group => group.tracks.map(track => track.id));
    return {
      setupLists: music.ambient.length === 2 && music.nightAmbient.length === 2,
      fightLists: music.battle.length === 2 && music.nightBattle.length === 2,
      specialLists: music.duel.length === 2 && music.unfair.length === 2 && music.backroomsBattle.length === 2,
      daySetup: daySetup.every(id => music.ambient.includes(id)),
      nightSetup: music.nightAmbient.includes(nightSetup),
      dayFight: music.battle.includes(dayFight),
      nightFight: music.nightBattle.includes(nightFight),
      backroomsOverrides: backroomsSetup === music.backrooms && music.backroomsBattle.includes(backroomsFight),
      backroomsHidden: [music.backrooms, ...music.backroomsBattle].every(id => !catalogIds.includes(id)),
      pickerRemoved: !document.querySelector('#battle-music')
    };
  });
  expect(result).toEqual({
    setupLists: true, fightLists: true, specialLists: true,
    daySetup: true, nightSetup: true, dayFight: true, nightFight: true,
    backroomsOverrides: true, backroomsHidden: true, pickerRemoved: true
  });
  expect(errors).toEqual([]);
});

test('duel and strict numerical-advantage tracks depend on the initial unit line-up', async ({ page }) => {
  const errors = await openBattle(page);
  const result = await page.evaluate(() => {
    audio.musicOn = true;
    battle.field = 'glade'; battle.time = 'day'; battle.phase = 'setup';
    const unit = x => ({ presetId: 'humans:sword', x });
    const pick = () => Object.keys(musicMix())[0];
    const regularBattle = GAME_CONFIG.battleMusic.battle;

    battle.lineup = [unit(100), unit(WORLD_WIDTH - 100)];
    const duelSetup = pick();
    battle.phase = 'fight';
    const duelFight = pick();

    battle.lineup = [unit(100), unit(200), unit(300), unit(400), unit(WORLD_WIDTH - 100), unit(WORLD_WIDTH - 200),
      { building: 'wood_wall', x: 100 }];
    const advantageFight = pick();

    battle.lineup = [unit(100), unit(200), unit(300), unit(WORLD_WIDTH - 100), unit(WORLD_WIDTH - 200),
      { building: 'wood_wall', x: 100 }];
    const exactThresholdFight = pick();

    battle.field = 'backrooms';
    const backroomsFight = pick();
    return {
      duelSetupIsRegular: GAME_CONFIG.battleMusic.ambient.includes(duelSetup),
      duelFightIsSpecial: GAME_CONFIG.battleMusic.duel.includes(duelFight),
      advantageFightIsSpecial: GAME_CONFIG.battleMusic.unfair.includes(advantageFight),
      exactThresholdStaysRegular: regularBattle.includes(exactThresholdFight),
      backroomsOverridesSpecial: GAME_CONFIG.battleMusic.backroomsBattle.includes(backroomsFight)
    };
  });
  expect(result).toEqual({
    duelSetupIsRegular: true, duelFightIsSpecial: true, advantageFightIsSpecial: true,
    exactThresholdStaysRegular: true, backroomsOverridesSpecial: true
  });
  expect(errors).toEqual([]);
});
