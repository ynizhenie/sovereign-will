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
  defense: { deploySeconds: 10, squadSize: 3, minRadius: 4, engageTiles: 6, workerAlarm: 160, nearBaseTiles: 3, markedSquad: 3 },

  // fishers with a rod at a marked spot: one catch every `seconds`, each uses `bait` from the stock
  // farm zones the player paints in the Farming tab: farmers (hoe) plant the empty tiles with the crop,
  // which is the building of that id (its cost is the seed), taking plantSeconds per tile
  farming: { plantSeconds: 1.5, crops: { wheat: 'wheat', sapling: 'sapling', apple: 'apple_sapling' } },

  // fertiliser (#201): a farmer with a backpack carries dung to a wheat plot that has none; its next
  // harvest yields yieldFactor times, once
  fertilizer: { yieldFactor: 2 },

  // medics (medbag): during an attack, heal the nearest wounded settler (soldiers first) within `range`,
  // healPerHerb hp for one herb every healSeconds. Herbs come from the bag, filled at the town hall with
  // up to bagSize from the stock.
  medic: { healPerHerb: 30, healSeconds: 1.2, range: 26, bagSize: 5 },

  // blood on a hurt unit, under it, and on the melee weapon that hit it: it starts to fade after
  // fadeAfter seconds over fadeSeconds, except on a unit at woundedShare of its hp or less
  blood: { fadeAfter: 10, fadeSeconds: 3, woundedShare: 0.25, maxSplats: 150 },

  // stepping in blood or dung leaves `steps` footprints, one every stepGap px walked
  smears: { steps: 6, stepGap: 12 },

  // every settler eats once every `seconds` on a clock of its own: a big one eats 2 food, a short
  // colony eats worms. A new settler's first meal comes after firstShare..1 of that, so they don't all
  // eat together
  meals: { seconds: 25, firstShare: 0.3 },

  // every mealsBefore meals a settler goes off to relieve itself: at least awayFromBuildings tiles
  // from any building, near grass if it can; it takes `seconds`, and the dung stays dungSeconds. A spot it
  // can't get to (walled off since, or stuck giveUpSeconds on the way): another one; after maxTries, where it is
  relief: { mealsBefore: 5, seconds: 2, awayFromBuildings: 4, dungSeconds: 120, giveUpSeconds: 20, maxTries: 3 },

  // a fallen settler or enemy leaves a grey corpse where it fell, gone after `seconds` unless used
  corpses: { seconds: 60 },

  // bait: the first of these the stock can pay for, per catch (worms first)
  fishing: { seconds: 3, catch: { rawFish: 2 }, bait: [{ worms: 1 }, { wheatSeeds: 1 }, { wheat: 1 }] },

  // worms turn up on a corpse once it has lain for `after` of its time; fishers pick them (1, or 2 off a
  // big body) and carry them home as bait
  worms: { after: 0.5, perCorpse: 1, perBigCorpse: 2 },

  // campfires: while there's raw food in the stock, a worker with no tool (one per campfire) cooks it.
  // It carries fuel from the town hall to the fire (one unit lasts `fuel[resource]` pieces, coal first),
  // fetches up to `batch` raw pieces, cooks each in `seconds` into `makes` food, and carries the food home.
  // Under lowFood meals per settler plus hireReserve (enough to hire a giant), any worker cooks, tool in
  // hand or in a wave too
  cooking: { seconds: 1.5, batch: 5, raw: ['rawMeat', 'rawFish', 'wheat'], makes: 1, fuel: { coal: 5, wood: 5 }, lowFood: 2, hireReserve: 30,
    dish: { rawMeat: 'cookedMeat', rawFish: 'cookedFish', wheat: 'bread' } },

  // demons eating a corpse to heal
  eatCorpseSeconds: 2,

  // burning arrows: what they hit burns for seconds, losing dps hp a second
  burning: { seconds: 3, dps: 5 },

  // the undead: a raised zombie lasts lifeSeconds, then crumbles into rot; blight lies within
  // hallTiles of the graveyard on every side and graveTiles of each grave, and on marked ground a
  // necromancer blighted; enemies on it go at slowFactor of their speed, and a corpse on it rises after
  // riseSeconds. A blighted zone the player takes away fades over clearSeconds, blighted till then.
  temporaryZombie: { lifeSeconds: 60, rot: 1 },

  blight: { hallTiles: 2, graveTiles: 1, slowFactor: 0.6, riseSeconds: 4, clearSeconds: 5 }
};
