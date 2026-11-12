import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), phrases between the factions (24)

test('the undead against the undead want no brains, demons against them no fresh meat; walls are named only when the colony has some (#326, 27.10, 24)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const all = (faction, event, enemy) => phrasesFor(enemy ? { enemyKey: 'x' } : {}, faction, event).join('|');
    const brains = /мозг|живы|плоть|свеж/i;
    setSideFaction('player', 'undead'); setSideFaction('enemy', 'undead');
    const undeadBoth = ['wave', 'charge', 'taunt', 'kill'].map(e => all('undead', e, e === 'charge' || e === 'taunt')).join('|');
    setSideFaction('player', 'humans');
    const undeadVsHumans = all('undead', 'taunt', true) + '|' + all('undead', 'wave', false);
    setSideFaction('player', 'demons');
    const demonsVsUndead = all('demons', 'wave', false);
    // walls: none built, none named; a wall built, named
    setSideFaction('player', 'humans'); setSideFaction('enemy', 'humans');
    buildings = buildings.filter(b => !['wall_wood', 'wall_stone', 'door', 'iron_door'].includes(b.type));
    const noWalls = all('humans', 'taunt', true) + '|' + all('humans', 'wave', false);
    buildings.push({ type: 'wall_wood', x: townHall.x + 90, y: townHall.y, hp: 100, maxHp: 100 });
    const walls = all('humans', 'taunt', true) + '|' + all('humans', 'wave', false);
    return { undeadBoth: brains.test(undeadBoth), undeadVsHumans: brains.test(undeadVsHumans), demonsVsUndead: /свеж/i.test(demonsVsUndead),
      noWalls: /стен/i.test(noWalls), walls: /стен/i.test(walls) };
  });
  expect(r).toEqual({ undeadBoth: false, undeadVsHumans: true, demonsVsUndead: false, noWalls: false, walls: true });
  expect(errors).toEqual([]);
});

test('enemies say their hurt phrase below 30% even just after a player speaks', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    isPaused = true;
    const speaker = createSettler('normal', 1, 300, 300);
    const playerSpoke = says(speaker, 'hired', true);
    const enemy = createConfiguredEnemy({ x: townHall.x + 200, y: townHall.y }, 'raider');
    const enemySpoke = speak(enemy, 'humans', 'taunt', true);
    enemy.hp = enemy.maxHp * 0.31;
    damageEnemy(enemy, enemy.maxHp * 0.02);
    const first = { text: enemy.say?.text, spokeAt: enemy.spokeAt };
    damageEnemy(enemy, enemy.maxHp * 0.02);
    const alreadyLow = createConfiguredEnemy({ x: townHall.x + 240, y: townHall.y }, 'raider');
    alreadyLow.hp = alreadyLow.maxHp * 0.29;
    tickEnemy(alreadyLow, 0);
    return {
      playerSpoke,
      enemySpoke,
      firstPhrase: t('voice.humans.hurt').split('|').includes(first.text),
      spokeOnce: enemy.spokeAt === first.spokeAt,
      catchesAlreadyLow: t('voice.humans.hurt').split('|').includes(alreadyLow.say?.text)
    };
  });
  expect(result).toEqual({ playerSpoke: true, enemySpoke: true, firstPhrase: true, spokeOnce: true, catchesAlreadyLow: true });
  expect(errors).toEqual([]);
});

test('necromancer healing shows purple pluses for player and enemy in every mode', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const tick = game.pathTick;
    const oldMode = game.gameMode, oldPlague = game.plagueMode;
    const colors = [];
    const fillRect = ctx.fillRect;
    ctx.fillRect = function (...args) {
      colors.push(ctx.fillStyle);
      return fillRect.apply(this, args);
    };
    try {
      const modes = ['endless', 'battle', 'plague'];
      const healing = [];
      for (const mode of modes) {
        game.gameMode = mode;
        game.plagueMode = mode === 'plague';
        game.pathTick = tick + 100;
        setSideFaction('player', 'undead');
        const necromancer = Object.assign(createSettler('zombie', 1, 300, 300), { tool: 'necro_staff' });
        const patient = Object.assign(createSettler('zombie', 2, 330, 300), { hp: 20 });
        game.settlers = [necromancer, patient];
        necromancy(necromancer, createSettlerTick(1 / 60));
        healing.push({ side: 'player', mode, marked: patient.necroTreatedAt === game.pathTick });

        const enemyNecromancer = createConfiguredEnemy({ x: 500, y: 300 }, 'undead_necromancer');
        const enemyPatient = createConfiguredEnemy({ x: 530, y: 300 }, 'undead_zombie');
        enemyPatient.hp = 20;
        game.enemies = [enemyNecromancer, enemyPatient];
        enemyNecromancy(enemyNecromancer, GAME_CONFIG.enemies.undead_necromancer.necromancer, 1 / 60);
        healing.push({ side: 'enemy', mode, marked: enemyPatient.necroTreatedAt === game.pathTick });

        colors.length = 0;
        drawHealSparks(patient);
        healing.push({ side: 'visual', mode, purple: colors.length === 6 && colors.every(color => color === '#bb8fce') });
      }
      return healing;
    } finally {
      ctx.fillRect = fillRect;
      game.gameMode = oldMode;
      game.plagueMode = oldPlague;
    }
  });
  expect(result).toEqual(['endless', 'battle', 'plague'].flatMap(mode => [
    { side: 'player', mode, marked: true },
    { side: 'enemy', mode, marked: true },
    { side: 'visual', mode, purple: true }
  ]));
  expect(errors).toEqual([]);
});

test('a player necromancer claims a distant corpse before refilling its remaining charges', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    setSideFaction('player', 'undead');
    const necromancer = Object.assign(createSettler('zombie', 1, townHall.x + 90, townHall.y), {
      tool: 'necro_staff', raisesLeft: 1
    });
    const corpse = { x: necromancer.x + 200, y: necromancer.y, big: false };
    game.settlers = [necromancer];
    game.enemies = [];
    game.corpses = [corpse];
    game.buildings = [{ type: 'grave', x: necromancer.x, y: necromancer.y }];
    const tick = createSettlerTick(1 / 60);
    tick.isWaveActive = true;
    necromancy(necromancer, tick);
    const playerOwns = corpse.raisedBy === necromancer;
    const enemyNecromancer = createConfiguredEnemy({ x: corpse.x + 200, y: corpse.y }, 'undead_necromancer');
    game.enemies = [enemyNecromancer];
    const enemyClaimed = enemyNecromancy(enemyNecromancer,
      GAME_CONFIG.enemies.undead_necromancer.necromancer, 1 / 60);
    necromancer.hp = 0;
    const releasedAfterDeath = enemyNecromancy(enemyNecromancer,
      GAME_CONFIG.enemies.undead_necromancer.necromancer, 1 / 60);
    return {
      raisesLeft: necromancer.raisesLeft,
      claimed: tick.raiseAssignments.has(corpse),
      playerOwns,
      enemyClaimed,
      releasedAfterDeath: releasedAfterDeath && corpse.raisedBy === enemyNecromancer
    };
  });
  expect(result).toEqual({
    raisesLeft: 1, claimed: true, playerOwns: true, enemyClaimed: false, releasedAfterDeath: true
  });
  expect(errors).toEqual([]);
});

test('raised zombies take corpse gear in Battle and enemy zombies attack nearby units then return to their necromancer', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    game.gameMode = 'battle';
    game.plagueMode = false;
    game.loot = [];
    const necromancer = Object.assign(createSettler('zombie', 1, 300, 300), { tool: 'necro_staff' });
    game.settlers = [necromancer];
    const playerCorpse = {
      x: 320, y: 300, big: false, weapon: 'sword', armor: 'iron', shield: true, helmet: true
    };
    game.corpses = [playerCorpse];
    const playerZombie = raiseTemporaryZombie(playerCorpse, necromancer);

    const enemyNecromancer = createConfiguredEnemy({ x: 500, y: 300 }, 'undead_necromancer');
    enemyNecromancer.raisesLeft = 3;
    const enemyCorpse = {
      x: 520, y: 300, big: false, weapon: 'sword', armor: 'leather', shield: true, helmet: true
    };
    game.enemies = [enemyNecromancer];
    game.corpses = [enemyCorpse];
    enemyNecromancy(enemyNecromancer, GAME_CONFIG.enemies.undead_necromancer.necromancer, 2);
    const enemyZombie = game.enemies.find(unit => unit.raisedBy === enemyNecromancer);

    const alphaAtBar = [];
    const fillRect = ctx.fillRect;
    ctx.fillRect = function (...args) {
      if (ctx.fillStyle === '#e74c3c') alphaAtBar.push(ctx.globalAlpha);
      return fillRect.apply(this, args);
    };
    try { drawEnemy(enemyZombie); } finally { ctx.fillRect = fillRect; }

    game.gameMode = 'endless';
    const lootNecromancer = Object.assign(createSettler('zombie', 5, 600, 300), { tool: 'necro_staff' });
    const lootCorpse = { x: 620, y: 300, big: false };
    game.settlers = [lootNecromancer];
    game.corpses = [lootCorpse];
    game.loot = [{
      x: 620, y: 300, hp: 1, maxHp: 1, priority: 0, yield: {},
      items: ['weapons:bow', 'gear:leather_armor', 'gear:helmet']
    }];
    const lootZombie = raiseTemporaryZombie(lootCorpse, lootNecromancer);
    const endlessLoadout = [lootZombie.weapon, lootZombie.armor, lootZombie.helmet, lootZombie.quiver];

    game.pathTick = 16;
    game.fogEnabled = false;
    enemyNecromancer.x = 250; enemyNecromancer.y = 300;
    enemyZombie.x = 380; enemyZombie.y = 300;
    game.settlers = [];
    for (let i = 0; i < 30; i++) { game.pathTick++; tickEnemy(enemyZombie, 1 / 60); }
    const returnTarget = enemyZombie.pathTarget;

    const target = createSettler('normal', 4, 320, 300);
    game.settlers = [target];
    enemyZombie.x = 380; enemyZombie.y = 300; enemyZombie.attackTarget = null;
    tickEnemy(enemyZombie, 1 / 60);
    return {
      playerLoadout: [playerZombie.weapon, playerZombie.armor, playerZombie.shield, playerZombie.helmet],
      enemyLoadout: [enemyZombie.weapon, enemyZombie.armor, enemyZombie.shield, enemyZombie.helmet],
      endlessLoadout,
      enemyAlpha: alphaAtBar[0],
      returnsToMaster: returnTarget?.x === enemyNecromancer.x && returnTarget?.y === enemyNecromancer.y,
      attacksNearbyUnit: enemyZombie.attackTarget === target
    };
  });
  expect(result).toEqual({
    playerLoadout: ['sword', 'iron', true, true],
    enemyLoadout: ['sword', 'leather', true, true],
    endlessLoadout: ['bow', 'leather', true, true],
    enemyAlpha: 0.7,
    returnsToMaster: true,
    attacksNearbyUnit: true
  });
  expect(errors).toEqual([]);
});

test('player and enemy taunt once when they first see an opponent, using the opponent faction', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    setSideFaction('player', 'demons');
    setSideFaction('enemy', 'undead');
    game.pathTick = 15;
    game.fogEnabled = false;
    const player = createSettler('imp', 1, 300, 300);
    const enemy = createConfiguredEnemy({ x: 400, y: 300 }, 'undead_zombie');
    game.settlers = [player];
    game.enemies = [enemy];
    tickSettlers(1 / 60);
    const playerTaunt = player.say?.text;
    const playerRepeated = tauntOnSight(player, enemy);
    tickVoices(3);
    game.pathTick = 30;
    tickEnemy(enemy, 1 / 60);
    return {
      playerUsesDemonVsUndead: t('voice.demons.tauntOnSight.vs.undead').split('|').includes(playerTaunt),
      playerRepeated,
      playerPhraseIsSeparate: !t('voice.demons.taunt.vs.undead').split('|').includes(playerTaunt),
      enemyUsesUndeadPhrase: t('voice.undead.tauntOnSight.vs.demons').split('|').includes(enemy.say?.text),
      enemyPhraseIsSeparate: !t('voice.undead.taunt').split('|').includes(enemy.say?.text)
    };
  });
  expect(result).toEqual({
    playerUsesDemonVsUndead: true, playerRepeated: false, playerPhraseIsSeparate: true,
    enemyUsesUndeadPhrase: true, enemyPhraseIsSeparate: true
  });
  expect(errors).toEqual([]);
});

test('every faction matchup has distinct localized encounter taunts', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const missing = await page.evaluate(() => {
    const factions = ['humans', 'demons', 'undead'];
    const missing = [];
    for (const language of ['en', 'ru', 'uk']) {
      setLanguage(language);
      for (const speaker of factions) for (const opponent of factions) {
        const key = `voice.${speaker}.tauntOnSight.vs.${opponent}`;
        const encounter = t(key);
        const regular = t(`voice.${speaker}.taunt.vs.${opponent}`);
        if (encounter === key || !encounter || encounter === regular) missing.push(`${language} ${key}`);
      }
    }
    setLanguage('ru');
    return missing;
  });
  expect(missing).toEqual([]);
  expect(errors).toEqual([]);
});

test('encounter taunts wait until wave preparation ends; wave calls remain a separate event', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    setSideFaction('player', 'humans');
    setSideFaction('enemy', 'demons');
    game.pathTick = 15;
    game.fogEnabled = false;
    game.wavePreparation = { wave: 1, stage: 'gather' };
    const player = createSettler('normal', 1, 300, 300);
    const enemy = createConfiguredEnemy({ x: 350, y: 300 }, 'demon_imp');
    enemy.fromWave = true;
    enemy.prepWave = 1;
    game.settlers = [player];
    game.enemies = [enemy];
    tickSettlers(1 / 60);
    tickEnemy(enemy, 1 / 60);
    const silentDuringPreparation = !player.say && !enemy.say;

    game.wavePreparation = null;
    delete enemy.prepWave;
    game.pathTick = 30;
    tickSettlers(1 / 60);
    const playerEncounter = player.say?.text;
    tickVoices(3);
    const enemyWaveCall = enemy.say?.text;
    return {
      silentDuringPreparation,
      playerHasEncounterLine: t('voice.humans.tauntOnSight.vs.demons').split('|').includes(playerEncounter),
      enemyKeepsWaveCall: t('voice.demons.charge').split('|').includes(enemyWaveCall)
    };
  });
  expect(result).toEqual({
    silentDuringPreparation: true,
    playerHasEncounterLine: true,
    enemyKeepsWaveCall: true
  });
  expect(errors).toEqual([]);
});

test('a player necromancer does not follow allies between waves in Endless', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    setSideFaction('player', 'undead');
    game.gameMode = 'endless';
    game.enemies = [];
    game.portalQueue = [];
    game.waveTimer = 99999;
    const necromancer = Object.assign(createSettler('zombie', 1, 300, 300), { tool: 'necro_staff' });
    const ally = createSettler('zombie', 2, 500, 300);
    game.settlers = [necromancer, ally];
    const before = { x: necromancer.x, y: necromancer.y };
    const acted = necromancy(necromancer, createSettlerTick(1 / 60));
    return { acted, moved: necromancer.x !== before.x || necromancer.y !== before.y };
  });
  expect(result).toEqual({ acted: false, moved: false });
  expect(errors).toEqual([]);
});
