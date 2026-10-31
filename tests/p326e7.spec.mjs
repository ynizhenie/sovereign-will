import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, the settings: the language's flag (31; one flag since 27.10, point 3) and the music player (34)

test('one flag by the Settings button, the language\'s now: a tap is the next language; Settings names each language with its flag (#326, 31; 27.10, 3)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  const layout = await page.evaluate(() => {
    const rect = id => document.getElementById(id).getBoundingClientRect();
    const endless = rect('mode-endless'), settings = rect('open-settings'), flag = rect('menu-flags');
    return {
      aligned: Math.abs(endless.width - settings.width) < 1,
      flagBottomLeft: flag.left < 20 && innerHeight - flag.bottom < 20
    };
  });
  expect(layout).toEqual({ aligned: true, flagBottomLeft: true });
  expect(await page.locator('#menu-flags .flag-button').count()).toBe(1);
  expect(await page.locator('#menu-flags .flag-button svg').count()).toBe(1);
  const codes = await page.evaluate(() => Object.keys(LANGUAGES));
  const from = await page.evaluate(() => currentLanguage);
  await page.locator('#menu-flags .flag-button').click();
  const next = codes[(codes.indexOf(from) + 1) % codes.length];
  expect(await page.evaluate(() => currentLanguage)).toBe(next);
  // round all of them, back to where it began
  for (let i = 1; i < codes.length; i++) await page.locator('#menu-flags .flag-button').click();
  expect(await page.evaluate(() => currentLanguage)).toBe(from);
  // in Settings: each language with its flag, the same choice; the flag by Settings follows
  await page.evaluate(() => showMenuScreen('settings'));
  expect(await page.locator('#language-options .language-option svg').count()).toBe(3);
  await page.locator('#language-options [data-language="uk"]').click();
  expect(await page.evaluate(() => currentLanguage)).toBe('uk');
  expect(await page.locator('#open-settings').innerText()).toBe('Налаштування');
  expect(await page.locator('#menu-flags .flag-button').getAttribute('aria-label')).toBe(await page.evaluate(() => LANGUAGES.uk.label));
  const flagVisible = await page.evaluate(() => ['home', 'endless', 'editor', 'generator', 'settings', 'music'].map(screen => {
    showMenuScreen(screen);
    const flag = document.getElementById('menu-flags');
    return getComputedStyle(flag).display !== 'none' && flag.getBoundingClientRect().width > 0;
  }));
  expect(flagVisible).toEqual([true, true, true, true, true, true]);
  expect(errors).toEqual([]);
});

test('the music player lists every track with its name and when it plays; a track can be listened to alone and switched off, never picked then (#326, 34)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { localStorage.removeItem('sovereign-will-musicOff'); showMenuScreen('settings'); });
  await expect(page.locator('#music-player')).toBeHidden();
  await page.click('#open-music-player');
  await expect(page.locator('[data-screen="music"]')).toBeVisible();
  await expect(page.locator('[data-screen="settings"]')).toBeHidden();
  const r0 = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('#music-player .music-row')].map(r => ({ id: r.dataset.track, text: r.querySelector('.music-name').innerText })),
    expected: 1 + 9 + Object.values(GAME_CONFIG.factions).filter(f => f.ready && f.music).reduce((n, f) => n + f.music.ambient.length + f.music.battle.length + f.music.nightAmbient.length + f.music.nightBattle.length, 0)
  }));
  const rows = r0.rows;
  expect(rows.length).toBe(r0.expected);
  expect(rows.every(r => !r.text.includes('music.'))).toBe(true); // (every name and "when" is a real text)
  expect(rows.find(r => r.id === 'humans_meadow').text).toContain('Поселение, днём');
  // listened to: it plays alone, and stops as the menu is left
  await page.evaluate(() => { audio.musicOn = false; });
  await page.locator('#music-player [data-track="humans_harvest"] .music-listen').click();
  expect(await page.evaluate(() => JSON.stringify(musicMix()))).toBe('{"humans_harvest":1}');
  await page.evaluate(() => showMenuScreen('home'));
  expect(await page.evaluate(() => musicPreview.id)).toBe('');
  // switched off: not picked (and kept on the device); all of a theme off: none
  await page.evaluate(() => { showMenuScreen('settings'); audio.musicOn = true; });
  await page.click('#open-music-player');
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
