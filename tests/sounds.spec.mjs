import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('sound starts with the first tap; menu music in the menu, the ambient in Endless, battle music while a wave is on (#174)', async ({ page }) => {
  const errors = await openGame(page);
  await page.mouse.click(5, 5); // the first gesture
  await page.waitForTimeout(400);
  const menu = await page.evaluate(() => ({ state: audio.ctx && audio.ctx.state, mix: musicMix(), steps: audio.layers.menu.step }));
  expect(menu.state).toBe('running');
  expect(menu.mix).toEqual({ menu: 1 });
  expect(menu.steps).toBeGreaterThan(0); // notes are being played

  await page.click('#play-button');
  // the ambient: one of the colony faction's; a wave: one of the attacking faction's battle tracks until the
  // last enemy and enemy tent are gone, then another ambient (#198)
  const r = await page.evaluate(() => {
    const own = GAME_CONFIG.factions[sides.player.faction].music, theirs = GAME_CONFIG.factions[sides.enemy.faction].music;
    enemies = []; enemyTents = []; enemyTentBlueprints = [];
    const calm = musicMix();
    waveNum = 3; startNextWave();
    const during = musicMix();
    enemies = [];
    const tentsLeft = enemyTents.length + enemyTentBlueprints.length > 0 ? musicMix() : during;
    enemyTents = []; enemyTentBlueprints = [];
    const after = musicMix();
    const one = (mix, list) => Object.keys(mix).length === 1 && list.includes(Object.keys(mix)[0]) && Object.values(mix)[0] === 1;
    return { calm: one(calm, own.ambient), during: one(during, theirs.battle), tentsLeft: JSON.stringify(tentsLeft) === JSON.stringify(during),
      after: one(after, own.ambient), another: Object.keys(after)[0] !== Object.keys(calm)[0], layers: Object.keys(audio.layers).length };
  });
  expect(r).toEqual({ calm: true, during: true, tentsLeft: true, after: true, another: true, layers: 70 }); // (the menu's, every faction's five and five by day and by night, #252, and the Battles' own nine, #326)
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('sounds play where things happen on screen, not far off it, and not too often; off in the Settings (#174)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const here = { x: camera.x, y: camera.y }, far = { x: camera.x + 1e5, y: camera.y };
    const played = name => audio.last[name];
    playSound('chop', here); const first = played('chop');
    playSound('chop', here); const throttled = played('chop') === first;
    playSound('mine', far); const offScreen = played('mine') === undefined;
    setSoundOn(false); playSound('hire'); const silent = played('hire') === undefined;
    setSoundOn(true);
    return { first: first !== undefined, throttled, offScreen, silent };
  });
  expect(r).toEqual({ first: true, throttled: true, offScreen: true, silent: true });

  // the Settings remember it
  await page.evaluate(() => { document.getElementById('main-menu').style.display = ''; showMenuScreen('settings'); });
  await page.click('[data-music="off"]');
  await page.click('[data-sound="off"]');
  expect(await page.evaluate(() => [loadSetting('music', 'on'), loadSetting('sound', 'on'), JSON.stringify(musicMix())])).toEqual(['off', 'off', '{}']);
  await page.click('[data-music="on"]');
  await page.click('[data-sound="on"]');
  expect(errors).toEqual([]);
});

test('every faction has five ambients and five battle tracks of its own, and as many for the night, and each plays, phrase after phrase (#198, #252)', async ({ page }) => {
  const errors = await openGame(page);
  await page.mouse.click(5, 5); // the first gesture: the audio starts
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const out = {};
    for (const faction of Object.values(GAME_CONFIG.factions).filter(f => f.ready)) {
      const m = faction.music, tracks = [...m.ambient, ...m.battle, ...m.nightAmbient, ...m.nightBattle];
      out[faction.id] = { ambient: m.ambient.length, battle: m.battle.length, nightAmbient: m.nightAmbient.length, nightBattle: m.nightBattle.length,
        own: tracks.every(id => id.startsWith(faction.id + '_') && GAME_CONFIG.music[id]) && new Set(tracks).size === 20 };
      // two bars of each, scheduled into a silent node
      const sink = audio.ctx.createGain(); sink.gain.value = 0; sink.connect(audio.ctx.destination);
      for (const id of tracks) for (let step = 0; step < 32 * 8; step++) playTrack(GAME_CONFIG.music[id], sink, audio.ctx.currentTime + 0.1, step, 0.5);
    }
    // the undead attack: their battle music
    sides.enemy.faction = 'undead';
    musicPick.fighting = false;
    gameStarted = true; gameMode = 'endless'; enemies = [createConfiguredEnemy({ x: 100, y: 100 }, 'undead_zombie')];
    out.undeadWave = Object.keys(musicMix())[0].startsWith('undead_');
    enemies = []; sides.enemy.faction = 'humans'; gameStarted = false;
    return out;
  });
  expect(r).toEqual({
    humans: { ambient: 5, battle: 5, nightAmbient: 5, nightBattle: 5, own: true }, demons: { ambient: 5, battle: 5, nightAmbient: 5, nightBattle: 5, own: true },
    undead: { ambient: 5, battle: 5, nightAmbient: 5, nightBattle: 5, own: true },
    undeadWave: true
  });
  expect(errors).toEqual([]);
});

test('the colony\'s work and life have their sounds: eating, building falling, catching fire, raising the dead... (#198)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    camera.x = townHall.x; camera.y = townHall.y;
    const played = name => audio.last[name] !== undefined;
    // every new sound plays without an error
    const fresh = ['eat', 'sizzle', 'dig', 'splash', 'drip', 'catch', 'heal', 'raise', 'collapse', 'smelt', 'tentUp', 'ignite'];
    const known = fresh.every(name => typeof SOUNDS[name] === 'function');
    // and the game makes them as things happen
    const s = settlers[0];
    stock.food = 10; eatMeal(s);
    const wall = window.sim.helpers.placeBuilding('wall_wood', townHall.x + 60, townHall.y + 60); removeBuilding(wall);
    setBurning(s);
    const corpse = { x: townHall.x + 40, y: townHall.y - 40, radius: 11, side: 'enemy', kind: 'raider', age: 0, big: false, wormsTaken: false };
    corpses = [corpse]; raiseTemporaryZombie(corpse);
    return { known, eat: played('eat'), collapse: played('collapse'), ignite: played('ignite'), raise: played('raise') };
  });
  expect(r).toEqual({ known: true, eat: true, collapse: true, ignite: true, raise: true });
  expect(errors).toEqual([]);
});
