import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, the 26.10 list, 24: phrases that fit the weather and the time, and every trade's own

test('phrases fit the weather and the time; each trade of each faction has its own lines, in every language (#326, 26.10, 24)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const { makeSettler } = window.sim.helpers;
    const worker = makeSettler(1, townHall.x, townHall.y);
    const c = GAME_CONFIG.daytime;
    const lines = (u, f, e) => phrasesFor(u, f, e).join('|');
    // rain: no wishing for rain, a wet line; clear: the other way round
    game.weather = { kind: 'rain', level: 1, left: 60, wind: 0.5, windTo: 0.5, windAngle: 0, flash: 0, thunderIn: -1, nextBolt: 0, bolt: null };
    dayTime = c.morning + 20;
    const wet = lines(worker, 'humans', 'idle');
    game.weather = null;
    const dry = lines(worker, 'humans', 'idle');
    // night: no "quiet day", a night line
    dayTime = c.morning + c.day + c.evening + 10;
    const night = lines(worker, 'humans', 'idle');
    dayTime = c.morning + 20;
    // a trade's own lines: a woodcutter, a captain, a necromancer
    const cutter = makeSettler(2, 0, 0, { tool: 'axe' }), captain = makeSettler(3, 0, 0, { weapon: 'sword', role: 'soldier', banner: true });
    const necro = makeSettler(4, 0, 0, { tool: 'necro_staff' });
    const roles = { cutter: roleOf(cutter), captain: roleOf(captain), necro: roleOf(necro), worker: roleOf(worker) };
    const cutterIdle = lines(cutter, 'humans', 'idle'), raised = lines(necro, 'undead', 'raised');
    // every trade of every faction: idle, morning and wave lines, in each language
    const trades = { humans: ['foreman', 'captain', 'fisher', 'woodcutter', 'miner', 'farmer', 'medic', 'archer'], demons: ['foreman', 'captain', 'fisher', 'woodcutter', 'miner', 'farmer', 'medic', 'archer'],
      undead: ['necromancer', 'foreman', 'captain', 'fisher', 'woodcutter', 'miner', 'archer'] };
    const missing = [];
    for (const lang of ['ru', 'en', 'uk']) {
      setLanguage(lang);
      for (const [f, list] of Object.entries(trades)) for (const role of list) for (const e of ['idle', 'morning', 'wave']) {
        const k = `voice.${f}.${e}.role.${role}`;
        if (t(k) === k) missing.push(`${lang} ${k}`);
      }
    }
    setLanguage('ru');
    return {
      wetNoWish: !wet.includes('Хоть бы дождь пошёл.') && /льёт|Промок|дождь костёр/.test(wet),
      dryWish: dry.includes('Хоть бы дождь пошёл.') && !/льёт/.test(dry),
      nightNoDay: !night.includes('Тихий день.') && /ночь|Звёзды|утро/i.test(night),
      roles, cutterOwn: /Топор|дерево/.test(cutterIdle) && !cutterIdle.includes('Работа есть?'), raised: /Восстань|Служи/.test(raised), missing
    };
  });
  expect(r).toEqual({ wetNoWish: true, dryWish: true, nightNoDay: true, roles: { cutter: 'woodcutter', captain: 'captain', necro: 'necromancer', worker: null }, cutterOwn: true, raised: true, missing: [] });
  expect(errors).toEqual([]);
});
