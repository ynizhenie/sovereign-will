import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, "corrections of corrections", point 7: the Battles' music

test('Battles: a faction\'s music (the player\'s by default, 26.10, 32: none of their own), placing and the fight, the night\'s by night; another faction\'s when picked (#326)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => startBattleMode());
  await page.click('[data-dock="battle-settings"]');
  const r = await page.evaluate(() => {
    audio.musicOn = true;
    const m = getPlayerFaction().music, now = () => Object.keys(musicMix());
    const inList = (list, ids) => ids.length === 1 && list.includes(ids[0]);
    const out = { theme: battleThemeFaction().id === getPlayerFaction().id };
    out.placing = inList(m.ambient, now());
    battle.phase = 'fight'; out.fight = inList(m.battle, now());
    battle.time = 'night'; out.nightFight = inList(m.nightBattle || m.battle, now());
    battle.phase = 'setup'; out.nightPlacing = inList(m.nightAmbient || m.ambient, now());
    battle.time = 'day'; battle.theme = 'undead';
    out.undead = inList(GAME_CONFIG.factions.undead.music.ambient, now());
    battle.phase = 'fight'; out.undeadFight = inList(GAME_CONFIG.factions.undead.music.battle, now());
    const first = now()[0]; for (let i = 0; i < 20; i++) if (now()[0] !== first) out.changed = true; // (the track stands while nothing changes)
    out.stands = !out.changed;
    out.noArena = !GAME_CONFIG.battleMusic && !Object.keys(GAME_CONFIG.music).some(id => id.startsWith('arena_')) && !musicCatalog().some(g => g.id === 'arena');
    return out;
  });
  expect(r).toEqual({ theme: true, placing: true, fight: true, nightFight: true, nightPlacing: true, undead: true, undeadFight: true, stands: true, noArena: true });
  // the picker: the three factions, no tracks to choose
  expect(await page.locator('#battle-music [data-theme]').count()).toBe(3);
  expect(await page.locator('#battle-music [data-music]').count()).toBe(0);
  expect(errors).toEqual([]);
});
