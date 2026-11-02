import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, "corrections of corrections", point 7: the Battles' music

test('Battles: the Battles\' own music by default, a muster while placing and a clash in the fight, the night\'s by night; a faction\'s theme when picked (#326)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => startBattleMode());
  await page.click('[data-dock="battle-settings"]');
  const r = await page.evaluate(() => {
    audio.musicOn = true;
    const m = GAME_CONFIG.battleMusic, now = () => Object.keys(musicMix());
    const inList = (list, ids) => ids.length === 1 && list.includes(ids[0]);
    const out = { theme: battle.theme };
    out.placing = inList(m.ambient, now());
    battle.phase = 'fight'; out.fight = inList(m.battle, now());
    battle.time = 'night'; out.nightFight = inList(m.nightBattle, now());
    battle.phase = 'setup'; out.nightPlacing = inList(m.nightAmbient, now());
    battle.time = 'day'; battle.theme = 'undead';
    out.undead = inList(GAME_CONFIG.factions.undead.music.ambient, now());
    battle.phase = 'fight'; out.undeadFight = inList(GAME_CONFIG.factions.undead.music.battle, now());
    const first = now()[0]; for (let i = 0; i < 20; i++) if (now()[0] !== first) out.changed = true; // (the track stands while nothing changes)
    out.stands = !out.changed;
    out.styles = [...m.ambient, ...m.nightAmbient, ...m.battle, ...m.nightBattle].every(id => typeof GAME_CONFIG.music[id] === 'object');
    return out;
  });
  expect(r).toEqual({ theme: 'arena', placing: true, fight: true, nightFight: true, nightPlacing: true, undead: true, undeadFight: true, stands: true, styles: true });
  // the picker: the Battles' own and the three factions, no tracks to choose
  expect(await page.locator('#battle-music [data-theme]').count()).toBe(4);
  expect(await page.locator('#battle-music [data-music]').count()).toBe(0);
  expect(errors).toEqual([]);
});
