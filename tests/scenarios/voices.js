// Voices (#252): phrases in bubbles, not too many
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;
  const EVENTS = ['hired', 'tool', 'wave', 'hurt', 'won', 'built', 'sleep', 'morning', 'hungry', 'idle', 'charge', 'sleepy', 'taunt', 'gathered', 'cooked', 'ate', 'kill'];

  // every faction has phrases for every event, in every language
  function phrasesEverywhere() {
    const missing = [];
    for (const lang of ['en', 'ru', 'uk']) {
      setLanguage(lang);
      for (const f of ['humans', 'demons', 'undead']) for (const e of EVENTS) { const k = `voice.${f}.${e}`; if (t(k) === k || !t(k)) missing.push(`${lang} ${k}`); }
    }
    setLanguage('ru');
    return missing;
  }

  // one says something: its bubble with a phrase of its faction's; then not again straight away, nor anyone
  // else for a moment
  function speaking({ seed = 'voices' } = {}) {
    start(seed); clearResources();
    const a = makeSettler(1, townHall.x + 40, townHall.y), b = makeSettler(2, townHall.x - 40, townHall.y);
    settlers = [a, b];
    a.spokeAt = undefined; b.spokeAt = undefined;
    const first = says(a, 'hired');
    const phrase = a.say && a.say.text;
    const known = t('voice.humans.hired').split('|').includes(phrase);
    const again = says(a, 'hired'), other = says(b, 'tool');
    return { first, known, again, other };
  }

  // hired: the new one says so
  function hiredSays({ seed = 'voices-hire' } = {}) {
    start(seed); clearResources();
    stock.food = 100;
    run(3); // (a gap since anyone last spoke)
    const n = settlers.length;
    spawnSettler('normal');
    const hired = settlers[n];
    return { said: !!(hired && hired.say && t('voice.humans.hired').split('|').includes(hired.say.text)) };
  }

  function petsSilent({ seed = 'voices-pets' } = {}) {
    start(seed);
    const pets = ['dog', 'beast', 'ghost'].map((type, i) =>
      makeSettler(i + 1, townHall.x + i * 30, townHall.y, { type, isIdle: true, idle: { act: 'campfire' } }));
    settlers = pets;
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening;
    tickVoices(20); // stories call the voice helper directly, bypassing speak()
    const playerPetsSilent = pets.every(pet => !pet.say);
    const enemyPets = ['raider_dog', 'demon_beast', 'undead_ghost'].map((key, i) =>
      createConfiguredEnemy({ x: townHall.x + i * 30, y: townHall.y }, key));
    const enemyPetsSilent = enemyPets.every(pet => {
      speak(pet, 'humans', 'taunt');
      return !pet.say;
    });
    return { playerPetsSilent, enemyPetsSilent };
  }

  return { voicePhrasesEverywhere: phrasesEverywhere, voiceSpeaking: speaking, voiceHiredSays: hiredSays, voicePetsSilent: petsSilent };
})());
