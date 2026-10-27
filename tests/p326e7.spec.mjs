import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, the settings: the languages' flags (31) and the music player (34)

test('a square of flags by the Settings button changes the language; Settings names each language with its flag (#326, 31)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  expect(await page.locator('#menu-flags .flag-button').count()).toBe(3);
  expect(await page.locator('#menu-flags .flag-button svg').count()).toBe(3);
  await page.locator('#menu-flags [data-language="uk"]').click();
  expect(await page.evaluate(() => currentLanguage)).toBe('uk');
  expect(await page.locator('#open-settings').innerText()).toBe('Налаштування');
  await page.locator('#menu-flags [data-language="en"]').click();
  expect(await page.locator('#open-settings').innerText()).toBe('Settings');
  await expect(page.locator('#menu-flags [data-language="en"]')).toHaveClass(/active/);
  // in Settings: each language with its flag, the same choice
  await page.evaluate(() => showMenuScreen('settings'));
  expect(await page.locator('#language-options .language-option svg').count()).toBe(3);
  await page.locator('#language-options [data-language="ru"]').click();
  expect(await page.evaluate(() => currentLanguage)).toBe('ru');
  await expect(page.locator('#menu-flags [data-language="ru"]')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test('the music player lists every track with its name and when it plays; a track can be listened to alone and switched off, never picked then (#326, 34)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { localStorage.removeItem('sovereign-will-musicOff'); showMenuScreen('settings'); });
  const r0 = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('#music-player .music-row')].map(r => ({ id: r.dataset.track, text: r.querySelector('.music-name').innerText })),
    expected: 1 + 9 + Object.values(GAME_CONFIG.factions).filter(f => f.ready && f.music).reduce((n, f) => n + f.music.ambient.length + f.music.battle.length + f.music.nightAmbient.length + f.music.nightBattle.length, 0)
  }));
  const rows = r0.rows;
  expect(rows.length).toBe(r0.expected);
  expect(rows.every(r => !r.text.includes('music.'))).toBe(true); // (every name and "when" is a real text)
  expect(rows.find(r => r.id === 'humans_meadow').text).toContain('Поселение, днём');
  // listened to: it plays alone, and stops as Settings is left
  await page.evaluate(() => { audio.musicOn = false; });
  await page.locator('#music-player [data-track="humans_harvest"] .music-listen').click();
  expect(await page.evaluate(() => JSON.stringify(musicMix()))).toBe('{"humans_harvest":1}');
  await page.evaluate(() => showMenuScreen('home'));
  expect(await page.evaluate(() => musicPreview.id)).toBe('');
  // switched off: not picked (and kept on the device); all of a theme off: none
  await page.evaluate(() => { showMenuScreen('settings'); audio.musicOn = true; });
  await page.locator('#music-player [data-track="arena_muster"] .music-toggle').click();
  const r = await page.evaluate(() => {
    startBattleMode(); battle.theme = 'arena'; battle.phase = 'setup';
    const picks = new Set();
    for (let i = 0; i < 30; i++) { battle.time = 'night'; musicMix(); battle.time = 'day'; picks.add(Object.keys(musicMix())[0]); } // (a new pick each time the time changes)
    return { picks: [...picks], saved: loadSetting('musicOff', '[]') };
  });
  expect(r.picks).not.toContain('arena_muster');
  expect(r.saved).toContain('arena_muster');
  expect(await page.evaluate(() => { for (const id of GAME_CONFIG.battleMusic.ambient) setTrackOn(id, false); battle.theme = 'arena'; return JSON.stringify(musicMix()); })).toBe('{}');
  expect(errors).toEqual([]);
});
