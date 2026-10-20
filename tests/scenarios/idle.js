// Idle settlers' pastimes and dung to the heap (#199)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const asFaction = (faction, seed) => { sides.player.faction = faction; start(seed); clearResources(); invalidateAllPaths(); };
  const back = () => { sides.player.faction = 'humans'; };
  const fed = () => settlers.forEach(s => { s.hunger = 999; });

  // An idle worker sent to the campfire: it stands by it and its morale rises past its usual
  function campfire({ seed = 'idle-fire' } = {}) {
    asFaction('humans', seed);
    const fire = placeBuilding('campfire', nearHall(4, 0).x, nearHall(4, 0).y);
    const s = makeSettler(1, townHall.x - 40, townHall.y + 40);
    settlers = [s];
    run(0.5, { each: fed });
    s.idle = { act: 'campfire', left: 30, spot: { x: fire.x, y: fire.y }, partnerId: null };
    s.morale = baseMorale(s, 'settler') - 20;
    run(15, { each: fed });
    return { byFire: Math.hypot(s.x - fire.x, s.y - fire.y) < 45, moraleAbove: s.morale > baseMorale(s, 'settler'), activity: s.activity };
  }

  // Three idle workers and nothing to do: before long two of them stand together "talking"
  function talk({ seed = 'idle-talk' } = {}) {
    asFaction('humans', seed);
    settlers = [0, 1, 2].map(i => makeSettler(i + 1, townHall.x - 60 + i * 60, townHall.y + 60));
    let knot = false;
    run(60, { each: () => {
      fed();
      const talking = settlers.filter(s => s.idle && s.idle.act === 'talk');
      if (talking.some(a => talking.some(b => a !== b && Math.hypot(a.x - b.x, a.y - b.y) < 40))) knot = true;
    } });
    return { knot };
  }

  // Two idle demons spar: health a little down (never below 70%), morale up past their usual
  function spar({ seed = 'idle-spar' } = {}) {
    asFaction('demons', seed);
    const a = makeSettler(1, townHall.x - 50, townHall.y + 60), b = makeSettler(2, townHall.x + 50, townHall.y + 60);
    settlers = [a, b];
    run(0.5, { each: fed });
    a.idle = { act: 'spar', left: 30, spot: null, partnerId: b.id };
    b.idle = { act: 'spar', left: 30, spot: null, partnerId: a.id };
    run(25, { each: fed });
    const base = baseMorale(a, 'settler');
    back();
    return { hurt: a.hp < a.maxHp && b.hp < b.maxHp, notBelow: a.hp >= a.maxHp * 0.7 - 0.01 && b.hp >= b.maxHp * 0.7 - 0.01, moraleUp: a.morale > base && b.morale > base, close: Math.hypot(a.x - b.x, a.y - b.y) < 30 };
  }

  // An idle zombie stands and sways
  function sway({ seed = 'idle-sway' } = {}) {
    asFaction('undead', seed);
    const z = createSettler('zombie', 1, townHall.x + 60, townHall.y + 60);
    settlers = [z];
    run(0.5);
    z.idle = { act: 'sway', left: 10, spot: null, partnerId: null };
    const x0 = z.x, y0 = z.y;
    run(5);
    back();
    return { swaying: !!z.swaying, stood: Math.hypot(z.x - x0, z.y - y0) < 2, activity: z.activity };
  }

  // Dung in the base: a farmer with a backpack carries it into the compost heap; a worker by hand doesn't;
  // with no heap, nobody touches it (#232)
  function dungHeap({ seed = 'idle-dung', withHeap = true, farmer = true } = {}) {
    asFaction('humans', seed);
    const heap = withHeap ? placeBuilding('dung_heap', nearHall(5, 4).x, nearHall(5, 4).y) : null;
    invalidateAllPaths();
    const w = makeSettler(1, townHall.x, townHall.y + 50, farmer ? { tool: 'hoe', backpack: true } : {});
    settlers = [w];
    dung = [{ x: nearHall(-4, -2).x, y: nearHall(-4, -2).y, age: 0, by: null, byLeft: true }];
    const carried = new Set();
    run(30, { each: () => { fed(); if (w.carrying && w.carrying.type === 'dung') carried.add(w.activity); } });
    return { onGround: dung.length, inHeap: heap ? heap.dung || 0 : null, activity: [...carried][0] || null };
  }

  return { idleCampfire: campfire, idleTalk: talk, idleSpar: spar, idleSway: sway, idleDungHeap: dungHeap };
})());
