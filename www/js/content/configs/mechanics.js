// The numbers each mechanic is tuned by: defence, farming, healing, blood, meals, corpses, fishing,
// cooking, burning, the undead's zombies and blight

export const mechanicsConfig = {
  // before a wave: deploySeconds ahead, soldiers form squads of squadSize melee (plus an archer if
  // there are any) at posts around the base, no farther out than its farthest building (at least
  // minRadius tiles), doors first. A squad holds its post until an enemy comes within engageTiles of it.
  // From the warning until the wave is beaten, workers stay within that radius unless the player marked
  // something farther, and only shelter when an enemy comes within workerAlarm px.
  // With fewer melee soldiers than two squads they stand one to a post round the base. An enemy within
  // nearBaseTiles of the base's edge or of a building is gone for by the nearest squad, wherever its post
  // is. markedSquad: how many soldiers go for each enemy the player points at (the rest keep their posts).
  // Once the wave is on the map, the posts move to the side it comes from, its arc widened by threatMargin
  // (radians) (#202).
  // morale (#207): 0..max for everyone; below panicBelow a unit panics until back at calmAbove (or its base,
  // if lower). base: where each faction's settles (scaryFoes: less against these); hits take `hit` (and
  // lowHp more as one falls below lowHpShare); an ally falling within nearRange px takes allyDeath, a foe
  // falling there gives foeDeath (demons twice); outnumbered (more than `outnumbered` times as many foes
  // close by) loses outnumberedPerSecond; with no foe near it comes back recoverPerSecond (twice by the
  // town hall). A wave that's lost routShare of its number takes `rout`. Panicking enemies heal at their
  // tents (tentHealPerSecond); a demon in a panic takes demonHeal a second off an ally. An undead unit within
  // necroRange of its necromancer keeps its morale; the enemy necromancer keeps necroKeepBack px off. The
  // armed take every shake at armedShare. A panic passes by itself (panicRecoverPerSecond, foes or not), and
  // one cornered (hit with its attacker at hand) fights back.
  morale: { max: 100, panicBelow: 30, calmAbove: 40, base: { humans: 70, demons: 90, undead: 30, boar: 50 },
    scaryFoes: { humans: { demons: -10, undead: -10 } }, hit: 3, lowHp: 10, lowHpShare: 0.3, allyDeath: 10, foeDeath: 6,
    nearRange: 150, outnumbered: 2, outnumberedPerSecond: 2, recoverPerSecond: 4, panicRecoverPerSecond: 6, armedShare: 0.25, routShare: 0.8, rout: 40,
    tentHealPerSecond: 10, demonHeal: 12, necroRange: 160, necroKeepBack: 140, necroCorpseClear: 90, panicDamage: 0.6 },
  // fighting (#208): at most meleePerEnemy settlers in melee on one enemy (meleePerBig on a big one), round
  // it rather than in a heap; while enemies are about, a settler leaves for a tent below retreatShare of its
  // health when an armed one is within coverRange px to hold the line (alone, only below a quarter). (Archers
  // stepping back from melee enemies shot less and lost more in seeded waves: they stand and shoot.) A big one's
  // blow hits at most splashMax at once, the one it aims at and the nearest round it (#209)
  combatAI: { meleePerEnemy: 3, meleePerBig: 5, retreatShare: 0.35, coverRange: 150, splashMax: 3 },
  // making things (#211): seconds a worker works on one, by its kind, at the smithy (anything with iron in
  // it); at a workshop workshopShare of that (#232, #248)
  crafting: { seconds: { tools: 4, weapons: 6, gear: 6, recipes: 2 }, workshopShare: 0.5 },
  defense: { deploySeconds: 10, squadSize: 3, minRadius: 4, engageTiles: 6, workerAlarm: 160, nearBaseTiles: 3, markedSquad: 3, threatMargin: 0.4 },

  // fishers with a rod at a marked spot: one catch every `seconds`, each uses `bait` from the stock
  // farm zones the player paints in the Farming tab: farmers (hoe) plant the empty tiles with the crop,
  // which is the building of that id (its cost is the seed), taking plantSeconds per tile
  // (#306) growSeconds: from planted to ripe (was 20 s), watered faster (wateringCan.growthFactor)
  farming: { plantSeconds: 1.5, growSeconds: 45, crops: { wheat: 'wheat', sapling: 'sapling', apple: 'apple_sapling' } },

  // fertiliser (#201): a farmer with a backpack carries dung to a wheat plot that has none; its next
  // harvest yields yieldFactor times, once
  fertilizer: { yieldFactor: 2 },

  // medics (medbag): during an attack, heal the nearest wounded settler (soldiers first) within `range`,
  // healPerHerb hp for one herb every healSeconds. Herbs come from the bag, filled at the town hall with
  // up to bagSize from the stock.
  // a medic's herb heals healPerHerb (#279: no more potions)
  medic: { healPerHerb: 30, healSeconds: 1.2, range: 26, bagSize: 5 },

  // blood on a hurt unit, under it, and on the melee weapon that hit it: it starts to fade after
  // fadeAfter seconds over fadeSeconds, except on a unit at woundedShare of its hp or less
  blood: { fadeAfter: 10, fadeSeconds: 3, woundedShare: 0.25, maxSplats: 150 },

  // stepping in blood or dung leaves `steps` footprints, one every stepGap px walked
  smears: { steps: 6, stepGap: 12 },

  // every settler eats once every `seconds` on a clock of its own: a big one eats 2 food, a short
  // colony eats worms. A new settler's first meal comes after firstShare..1 of that, so they don't all
  // eat together. Hungry, it goes to a storage and eats there for eatSeconds (#248). Awake at night it gets
  // hungry nightFactor as fast (#279: half)
  // zones the player marks (#279, world.zones.js): a relief zone holds reliefMax dung at most
  zones: { reliefMax: 5 },
  meals: { seconds: 33, firstShare: 0.3, eatSeconds: 2.5, nightFactor: 0.5 },
  // day and night (#257): a day is morning + day + evening + night seconds, Endless starting in the morning;
  // at night it's `darkness` dark; light reaches (tiles) round the town hall, a lit torch, a lit campfire, a
  // torch in hand, a portal, a necromancer's staff. Night: settlers sleep at their shelters (hunger stopped),
  // soldiers half on watch at a time; woken wakeSeconds before a wave. A torch in hand takes one crafted torch;
  // a torch post is lit with postFirewood. (#279) Asleep it mends as its shelter heals
  // (sleepHealPerSecond at the town hall); a corpse within sleepCorpseTiles of where it sleeps is taken away
  // first; one ordered to work at night does it at drowsyPace
  // (#308) weather, Endless only: clear for firstClearSeconds, then spells of weather (weights, clear twice as
  // likely after one; #306: rarer and shorter), each seconds long (from..to), coming on and going off over
  // `fade`; the wind's strength range for each; a storm's lightning every boltSeconds; rain makes the fires
  // burn rainFireBurn times faster
  weather: { firstClearSeconds: 240, seconds: [60, 130], fade: 12, weights: { clear: 55, rain: 19, fog: 15, storm: 11 },
    wind: { clear: [0.12, 0.45], rain: [0.4, 0.75], fog: [0.02, 0.1], storm: [0.8, 1.2] }, boltSeconds: [6, 14], rainFireBurn: 1.5 },
  daytime: { morning: 30, day: 180, evening: 30, night: 120, darkness: 0.72, hallLightTiles: 1.5, torchLightTiles: 2.5, campfireLightTiles: 2.5,
    handTorchTiles: 1.8, portalLightTiles: 1.2, staffLightTiles: 1, wakeSeconds: 30, postFirewood: 1, enemyTorchShare: 0.3,
    sleepHealPerSecond: 8, sleepCorpseTiles: 3, drowsyPace: 0.5 },
  // paths (#248): every everyTicks a settler walking (minStep px since) on a tile in the base wears it by
  // `wear`, up to 1; every fadeTicks each worn tile loses `fade`; one past `shows` is drawn as a path
  paths: { everyTicks: 20, minStep: 4, wear: 0.012, fadeTicks: 600, fade: 0.02, shows: 0.35 },

  // every mealsBefore meals a settler goes off to relieve itself: at least awayFromBuildings tiles
  // from any building, near grass if it can; it takes `seconds`, and the dung stays dungSeconds. A spot it
  // can't get to (walled off since, or stuck giveUpSeconds on the way): another one; after maxTries, where it is
  // corpses out of the base (#199, #232): to a heap corpseHeapTiles past its edge, carried at `speed` of a
  // settler's speed; one that can't get there in giveUpSeconds drops it and it's left be (#261)
  corpseHaul: { corpseHeapTiles: 4, speed: 0.6, giveUpSeconds: 40 },
  // a resource the player marked with Point is worked by up to this many at once (#232: one kind of mark)
  markWorkers: 2,
  // idle settlers' pastimes between waves (#199), each for `seconds` (from..to): by a campfire (morale up at
  // campfireMoralePerSecond, up to campfireAbove past its usual), talking in a knot (company within
  // companyRange px), demons sparring (morale up to sparAbove past its usual, health down to sparMinHp of
  // its most); soldiers and archers also patrol the edge of the base (patrolStep radians a waypoint) and
  // train at a dummy (their damage up trainPerSecond of itself a second, up to trainMax); a soldier guards a
  // gatherer more than guardBeyondTiles past the base's edge, keeping within guardRange px; an idle
  // necromancer takes `bones` bones from a corpse in boneSeconds; one with a flute stops work now and then
  // for a tune by a campfire (fluteEvery seconds, fluteSeconds at it; #306)
  idle: { seconds: [8, 16], campfireMoralePerSecond: 6, campfireAbove: 10, talkRing: 24, companyRange: 260,
    sparReach: 24, sparHpPerSecond: 0.5, sparMinHp: 0.7, sparMoralePerSecond: 4, sparAbove: 10,
    trainPerSecond: 0.001, trainMax: 0.25, trainRing: 22, patrolStep: 0.45, guardBeyondTiles: 2, guardRange: 45, boneSeconds: 3, bones: 3,
    fluteEvery: [150, 300], fluteSeconds: [12, 26] },
  relief: { mealsBefore: 5, seconds: 2, awayFromBuildings: 4, dungSeconds: 120, giveUpSeconds: 20, maxTries: 3 },

  // a fallen settler or enemy leaves a grey corpse where it fell, gone after `seconds` unless used
  corpses: { seconds: 60 },

  // bait: the first of these the stock can pay for, per catch (worms first)
  fishing: { seconds: 3, catch: { rawFish: 2 }, bait: [{ worms: 1 }, { wheatSeeds: 1 }, { wheat: 1 }], fishCapacity: 4, fishRegrowSeconds: 2.5 },
  // a woodcutter (an axe) with nothing to do, or with the firewood nearly out, chops firewood at a storage
  // (#199): each wood into `makes` firewood in `seconds`, up to `perTrip` wood a go, while the stock has
  // less than `keep`
  firewood: { seconds: 2, makes: 2, perTrip: 3, keep: 20, low: 2 },
  // an idle fisher now and then digs for worms in the grass (#199): `seconds` digging, a worm one time in
  // 1/chance
  digWorms: { seconds: 4, chance: 0.35 },

  // worms turn up on a corpse once it has lain for `after` of its time; fishers pick them (1, or 2 off a
  // big body) and carry them home as bait
  worms: { after: 0.5, perCorpse: 1, perBigCorpse: 2 },

  // campfires: while there's raw food in the stock, a worker with no tool (one per campfire) cooks it.
  // It carries fuel from the town hall to the fire (one unit lasts `fuel[resource]` pieces, coal first),
  // fetches up to `batch` raw pieces, cooks each in `seconds` into `makes` food, and carries the food home.
  // Under lowFood meals per settler plus hireReserve (enough to hire a giant), any worker cooks, tool in
  // hand or in a wave too
  // (#298) a lit campfire burns its fuel down by itself, one unit every fuelSeconds, cooking or not
  cooking: { seconds: 1.5, batch: 5, raw: ['rawMeat', 'rawFish', 'wheat'], makes: 1, fuel: { coal: 5, firewood: 5 }, fuelSeconds: 6, lowFood: 2, hireReserve: 30,
    dish: { rawMeat: 'cookedMeat', rawFish: 'cookedFish', wheat: 'bread' } },

  // demons eating a corpse to heal
  eatCorpseSeconds: 2,
  // the demons after a wave (#250): soldiers cut up the corpses left (with nobody wounded to eat them, and no
  // room in a pit) into raw meat, `meat` each (bigMeat a big one) in `seconds`. At a wave's end (down to
  // lastFew enemies) one catches an enemy below catchBelow of its health for a free cage
  demonCamp: { butcherSeconds: 3, meat: 3, bigMeat: 6, lastFew: 3, catchBelow: 0.25 },
  // enemy demons come out of their portals a few at a time (#250): `batch` every `seconds`; portals open
  // at least awayTiles past the base's edge
  portalWave: { batch: 5, seconds: 2, awayTiles: 3 },

  // burning arrows: what they hit burns for seconds, losing dps hp a second
  burning: { seconds: 3, dps: 5 },

  // the undead: a raised zombie lasts lifeSeconds, then crumbles into rot; blight lies within
  // hallTiles of the graveyard on every side and graveTiles of each grave, and on marked ground a
  // necromancer blighted; enemies on it go at slowFactor of their speed, and a corpse on it rises after
  // riseSeconds. A blighted zone the player takes away fades over clearSeconds, blighted till then.
  // crumbled, a raised zombie of the colony's leaves `rot` and `bones` on the ground where it was (big:
  // bigTimes as much, #253)
  temporaryZombie: { lifeSeconds: 60, rot: 1, bones: 1, bigTimes: 2 },
  // graves (#253): a necromancer works one for `bones` and `rot` in `seconds`, then it rests restSeconds;
  // with a corpse lying by it (within nearTiles), no rest. Undead workers carry the corpses about to the
  // graves, corpsesBy a grave at most
  graveWork: { seconds: 5, restSeconds: 10, bones: 3, rot: 1, nearTiles: 1, corpsesBy: 2 },

  blight: { hallTiles: 2, graveTiles: 1, slowFactor: 0.6, riseSeconds: 4, clearSeconds: 5 }
};
