// Corpses out of the base, and medics' potions (#199, #232: no porter role any more)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const asFaction = (faction, seed) => { sides.player.faction = faction; start(seed); clearResources(); invalidateAllPaths(); };
  const back = () => { sides.player.faction = 'humans'; };
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; };

  // Corpses in the base: a worker with nothing in hand (or a soldier) carries them out to a heap past its
  // edge; the undead's stay for the necromancers
  function corpsesOut({ seed = 'porter-corpses', faction = 'humans' } = {}) {
    asFaction(faction, seed);
    const porter = faction === 'undead' ? createSettler('zombie', 1, townHall.x + 30, townHall.y + 40) : makeSettler(1, townHall.x + 30, townHall.y + 40);
    settlers = [porter];
    corpses = [nearHall(2, 2), nearHall(-2, 3)].map(p => ({ ...p, radius: 10, side: 'enemy', kind: 'raider', age: 0 }));
    run(40, { each: quiet });
    const edge = getBaseRadius() + TILE_SIZE;
    const r = { corpses: corpses.length, out: corpses.every(c => Math.hypot(c.x - townHall.x, c.y - townHall.y) > edge) };
    back();
    return r;
  }

  // A medic between waves brews potions: two herbs, water, a campfire; up to the most kept
  function brew({ seed = 'medic-brew' } = {}) {
    asFaction('humans', seed);
    const fire = placeBuilding('campfire', nearHall(3, 0).x, nearHall(3, 0).y);
    const w = nearHall(-5, 3);
    waterTiles.push({ x: w.x, y: w.y });
    invalidateAllPaths();
    const medic = makeSettler(1, townHall.x + 30, townHall.y + 40, { tool: 'medbag' });
    settlers = [medic];
    Object.assign(stock, { herbs: 4, potions: 0 });
    let atWater = false, atFire = false;
    run(40, { each: () => { quiet(); if (Math.hypot(medic.x - w.x, medic.y - w.y) < 35) atWater = true; if (medic.brewTimer > 0 && Math.hypot(medic.x - fire.x, medic.y - fire.y) < 40) atFire = true; } });
    return { potions: stock.potions, herbs: stock.herbs, atWater, atFire };
  }

  // In a wave a medic heals with a potion first: 75 hp, a herb 30. With the wave beaten and a tent, it keeps its herbs
  function heal({ seed = 'medic-heal', waveOver = false } = {}) {
    asFaction('humans', seed);
    if (waveOver) placeBuilding('tent', nearHall(-4, 0).x, nearHall(-4, 0).y);
    const medic = makeSettler(1, townHall.x + 30, townHall.y + 40, { tool: 'medbag', bagPotions: 1, bagHerbs: 1 });
    const patient = makeSettler(2, townHall.x + 50, townHall.y + 40, { weapon: 'sword', role: 'soldier', hp: 10, speed: 0 });
    settlers = [medic, patient];
    const en = createConfiguredEnemy(nearHall(-25, -20), 'raider');
    en.speed = 0; en.damage = 0; en.fromWave = !waveOver;
    enemies = [en];
    run(1.5, { each: () => { quiet(); patient.speed = 0; } });
    return { hp: Math.round(patient.hp), potionsLeft: medic.bagPotions || 0, herbsLeft: medic.bagHerbs || 0 };
  }

  return { porterCorpses: corpsesOut, medicBrew: brew, medicHeal: heal };
})());
