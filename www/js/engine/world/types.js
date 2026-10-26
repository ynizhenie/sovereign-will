// The shapes of the game's data, for the editor (JSDoc): what a settler, an enemy, a building... carries.
// Nothing runs here. Use one as  /** @type {import('../engine/world/types.js').Settler} */  (the path
// from your file). Fields not listed are set by one mechanic for its own use.

/**
 * @typedef {{ x: number, y: number }} Point
 */

/**
 * How a settler or an enemy looks (#306, settlers.looks.js): a man or a woman, one of the five looks of that
 * kind, and a shade (its hair's colour, of the colours its kind has)
 * @typedef {{ female: boolean, style: number, shade: number }} Look
 */

/**
 * A colony unit (GAME_CONFIG.settlerTypes): created by createSettler, driven by SETTLER_BEHAVIOURS.
 * @typedef {Object} Settler
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {string} type           GAME_CONFIG.settlerTypes key ('normal', 'big', 'zombie'...)
 * @property {string} role           'worker', 'soldier' or 'archer'
 * @property {boolean} [drowsy]      up at night for an order of the player's, working at half its pace (#279)
 * @property {number} [grumbledAt]   the tick it last said it wants to sleep
 * @property {number} [struckAt]     the tick it last struck at something (#279: a torch in hand goes to its side)
 * @property {number} [treatedAt]   (#326) the tick a medic last worked on it
 * @property {boolean} [raider]      in the party of a raid on an enemy camp (#255)
 * @property {Point} [raidSpot]      its place in the party's line at the map's edge (#255)
 * @property {Point} [exitSpot]      where it runs to, out of an enemy camp (#279)
 * @property {boolean} [healing]     at the camp's shelter till it's mended (#279)
 * @property {Point} [orderSpot]     where it stands in a fight under orders (a raid's camp, a battle), told nothing to fight
 * @property {Object | null} [orderTarget]  what the player told it to fight there
 * @property {string} weapon         GAME_CONFIG.weapons key, 'fist' for none
 * @property {string} tool           GAME_CONFIG.tools key, 'none' for none
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} speed
 * @property {number} radius         the collision body
 * @property {number} visualRadius   the drawn body (a big one is drawn larger than it collides)
 * @property {Look} [look]          a man or a woman, one of their looks: how it's drawn (#306)
 * @property {boolean} isPossessed   steered by the player (its AI is off)
 * @property {{ type: string, amount: number, loads?: number, forFire?: Building, forBlueprint?: Building, corpse?: Object, toHeap?: boolean, forChop?: boolean, forTrap?: Building, counted?: boolean, forPit?: Building, forCage?: Building, forGrave?: Building, forTorch?: Building, captive?: Object } | null} carrying
 * @property {Point[] | null} path   the way it walks, tile by tile (moveEntityTowards)
 * @property {Point | null} pathTarget
 * @property {string} [activity]     the behaviour that took its last tick (for the selected settler's info)
 * @property {number} [hunger]       seconds until its next meal
 * @property {boolean} [quiver]
 * @property {number} [arrows]
 * @property {boolean} [shield]
 * @property {string|boolean} [armor]
 * @property {boolean} [backpack]
 * @property {boolean} [wateringCan]
 * @property {boolean} [whistle]     a foreman's (#248)
 * @property {boolean} [banner]      a captain's (#248)
 * @property {number} [working]      seconds it's still shown at work (getHeldItemPose)
 * @property {string | null} [workKind]  what work: 'build', 'butcher', 'pick' (drawn: a hammer, a knife, a hand, #279)
 * @property {number} [facing]       the angle its held item points at
 * @property {Object} [order]        a tap order while possessed (settlers.orders.js)
 * @property {Object | null} targetEquipment what it goes to the town hall to swap to (equip): weapon, tool, gear...
 * @property {Watchtower | null} [towerAssignment] the watchtower it guards
 * @property {boolean} [isIdle]
 * @property {boolean} [wasIdle]    it was idle last tick (cleanDung)
 * @property {boolean} [chopTrip]   on its way to chop firewood (chopFirewood)
 * @property {{ resource: string, until: number } | null} [focus] what its foreman said to gather first (#248)
 * @property {Object | null} [captainTarget] the enemy its captain gave it (#248)
 * @property {number[]} [squadIds]   a commander's squad
 * @property {number} [orderIn]      seconds till a commander's next order
 * @property {number} [armIn]        seconds till a captain's next arming order (#279)
 * @property {number} [lentBy]       the captain that lent it its weapon for a wave (#279)
 * @property {number} [orderTurn]    whose turn in its squad it is
 * @property {number | null} [orderTo] the one a foreman is walking to with an order
 * @property {{ icon: string, until: number } | null} [orderBubble] an order showing over it
 * @property {{ toId: number, until: number } | null} [orderLine] a commander's line to the one it told
 * @property {Object | null} [catchTarget] the enemy it's catching for a cage (#250)
 * @property {Object | null} [catchCage] the cage it's for
 * @property {Object | null} [butcherTarget] the corpse it's cutting up (#250)
 * @property {number} [butcherTimer]
 * @property {Object | null} [graveTarget] the grave a necromancer works (#253)
 * @property {number} [graveTimer]
 * @property {boolean} [asleep]     asleep at night (#257)
 * @property {Object | null} [sleepAt] the shelter it sleeps at
 * @property {{ x: number, y: number } | null} [sleepSpot]
 * @property {boolean} [torchInHand] a torch in its hand for the night (#257)
 * @property {boolean} [torchPickup] on its way to storage for a night torch (#257)
 * @property {number} [torchNight]   the night it took one
 * @property {Object | null} [torchTarget] the torch post it's going to light
 * @property {boolean} [wantsMeal]  hungry: going for its meal (goEat, #248)
 * @property {{ left: number, icon: string } | null} [eating] eating its meal, what it eats (#248)
 * @property {Object | null} [pileTarget] the pile it's going to carry into a storage (#248)
 * @property {Point | null} [reliefSpot] where it's going to relieve itself
 * @property {boolean} [needsRelief] it has to go (#248)
 * @property {number} [reliefTimer] seconds it's been at it, at its spot
 * @property {number} [relievingAt] the tick it was last at it (the censor, #298)
 * @property {Object<string, number>} [today]  what it did today, for its story by the fire (#279)
 * @property {{ from: Object, id: string } | null} [sortJob] what it's carrying over to its own storage (#279)
 * @property {number} [haulWalk]    seconds carrying a corpse to the heap (carryCorpse)
 * @property {{ act: string, left: number, spot: { x: number, y: number } | null, partnerId: number | null, angle?: number, onPoint?: number, dug?: number, seat?: number } | null} [idle]  its pastime (#199)
 * @property {{ icon?: string, progress: number, until: number } | null} [crafting]  a thing it's making (drawn, #232)
 * @property {boolean} [swaying]     an idle undead swaying
 * @property {number} [trained]     damage won at a training dummy, a share of its own (#199)
 * @property {number | null} [guardingId]  the gatherer it guards (escortGatherers)
 * @property {Object | null} [dungTarget]  the pile of dung it's going for (cleanDung)
 * @property {boolean} [hasArmor]
 * @property {number} [usingCan]     seconds left of watering with the can
 * @property {number} [bagHerbs]     a medic's herbs
 * @property {number} [chopTimer]    a woodcutter chopping firewood
 * @property {Object | null} [markTarget]  the marked resource it's working (kept till done, #232)
 * @property {Object | null} [corpseTarget]  the corpse it's going to carry out of the base (#199)
 * @property {number} [burning]      seconds left on fire
 * @property {number} [temporary]    a raised zombie's seconds left
 * @property {boolean} [leaving]     let go (#314): walking away out of the colony
 * @property {{ x: number, y: number }} [leaveTo]  where it's walking to, to be gone
 * @property {boolean} [leftColony]  gone: taken off the list after the tick
 * @property {number} [petHunger]   a pet's hunger (#314): 1 and more, hungry
 * @property {boolean} [petHungry]
 * @property {number} [petSleep]    a pet's sleep, seconds left
 * @property {number} [ghostGone]   a ghost gone after flying into an enemy, seconds till it's back
 * @property {any} [escort]          the necromancer a ghost goes to a fight with
 * @property {any} [feeding]         the pet a settler is feeding
 * @property {boolean} [ghostly]     a ghost (#314): nobody pushes it, it pushes nobody
 * @property {boolean} [crumbled]
 * @property {boolean} [deadProcessed]
 * @property {Building} [sacrificeAt]
 * @property {number} [morale]         0..100 (#207)
 * @property {boolean} [panic]
 * @property {{ x: number, y: number, until: number }} [raising] a necromancer's corpse being raised, till pathTick until
 */

/**
 * A wave's unit (GAME_CONFIG.enemies): created by createConfiguredEnemy, driven by tickEnemy.
 * @typedef {Object} Enemy
 * @property {boolean} [ghostly]     a ghost (#314): nobody pushes it, it pushes nobody
 * @property {{ icon: string, until: number } | null} [orderBubble] an order showing over it (a commander's, #279)
 * @property {string} enemyKey       GAME_CONFIG.enemies key
 * @property {Building | null} [platform] (#326) the red side's platform it's going up, or shooting from
 * @property {number} [treatedAt]  (#326) the tick a medic last worked on it
 * @property {Object} [lastHitBy]     who struck it last (its slayer's day, #279)
 * @property {Point} [guard]         its post in an enemy camp (#255): it holds it till a raider comes near
 * @property {boolean} [guardOff]   off its post, going after the raiders (#279)
 * @property {boolean} [fleeing]    a scout pointed at, running now (one came near it, or it was hit, #279)
 * @property {number} [musterUntil]  the tick a wave's enemy stops gathering and attacks (#279)
 * @property {Point} [muster]        where it gathers
 * @property {boolean} [captain]     a commander with a banner, telling its own whom to go for (#279)
 * @property {boolean} [scout]       a scout (#279): walks the edge, doesn't fight, runs from settlers
 * @property {number} [leaveIn]      a scout's seconds till it goes
 * @property {Point | null} [scoutTo] where a scout walks to
 * @property {number} [lookFor]      a scout's seconds still looking where it stands
 * @property {boolean} [leaving]     a scout on its way off the map
 * @property {boolean} [gone]        a scout off the map
 * @property {boolean} [trapped]    held in an iron trap (#248)
 * @property {boolean} [torch]       an enemy with a torch, in a night wave (#257)
 * @property {number} [toCatch]      the id of the settler catching it for a cage (#250)
 * @property {number} [trappedFor]   seconds till it's free
 * @property {string} type           'normal', 'big', 'archer'...
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} radius
 * @property {number} speed
 * @property {number} damage      a second in melee, an arrow's for an archer
 * @property {number} [hitDamage] a melee hit's, the player's own unit's (a battle tile shows it, #255)
 * @property {number} [meleeDamage] an archer out of arrows' melee damage a second, its melee kind's (#255)
 * @property {string} weapon
 * @property {number} [shotCooldown] seconds between its shots, a bow's in a settler's hands (#255)
 * @property {Object<string, number>} reward   what killing it adds to the stock
 * @property {Settler | null} [attackTarget]
 * @property {Object | null} buildTarget     the tent site it's building
 * @property {Point[] | null} path
 * @property {Point | null} pathTarget
 * @property {number} [arrows]
 * @property {number} [facing]
 * @property {Look} [look]         how it's drawn, given when it's made (#306)
 * @property {number} [burning]
 * @property {number} [temporary]
 * @property {boolean} [crumbled]
 * @property {boolean} [summoned]     from a tent, not the wave
 * @property {boolean} [fromWave]
 * @property {boolean} [markedTarget] the player pointed at it
 * @property {boolean} [rewardGranted]
 * @property {Object} [battleEntry]   its place in a battle's line-up
 * @property {number} [morale]         0..100 (#207)
 * @property {boolean} [panic]
 * @property {boolean} [fled]          ran off the map's edge
 * @property {boolean} [deadNoted]     its fall has shaken (and heartened) those around
 * @property {string} [armor]          'iron': a wave enemy in armour (#203)
 * @property {boolean} [shield]
 * @property {{ x: number, y: number, until: number }} [raising] a necromancer's corpse being raised, till pathTick until
 */

/**
 * A blueprint (GAME_CONFIG.buildings, or a demolition): created by createBuildingBlueprint, worked on in
 * game.blueprints; finished, it goes to game.buildings as a Building.
 * @typedef {Object} Blueprint
 * @property {string} type           GAME_CONFIG.buildings key, or 'demolish_building'
 * @property {boolean} [raidShelter] a shelter pitched in an enemy camp (#279)
 * @property {number | null} [builderId] who of the party builds it
 * @property {number} x              its tile's centre
 * @property {number} y
 * @property {number} progress       building work done, of maxProgress
 * @property {number} maxProgress
 * @property {number} [hp]
 * @property {number} [maxHp]
 * @property {Object<string, number>} [needs]  materials still to be brought
 * @property {Building} [targetBuilding] what a demolition takes down
 * @property {Building} [replaces]   what it's built over and replaces (a door on a wall, #248)
 */

/**
 * A building standing on the map (game.buildings).
 * @typedef {Object} Building
 * @property {string} type           GAME_CONFIG.buildings key
 * @property {boolean} [raidShelter] a shelter pitched in an enemy camp (#279)
 * @property {number} x              its tile's centre
 * @property {number} y
 * @property {number} [progress]
 * @property {number} [maxProgress]
 * @property {number} hp
 * @property {number} maxHp
 * @property {Object<string, number>} [needs]  materials still to be brought to the blueprint
 * @property {{ capacity?: number }} [tower]
 * @property {Settler[]} [guards]    a watchtower's archers
 * @property {'red'} [side]        (#326) the enemy's (a battle's red half, a raid's camp); else the player's
 * @property {string} [variant]     (#326) a dummy's look, picked once
 * @property {number} [usesLeft]     a trap's uses
 * @property {number} [dung]         a compost heap's dung (#232)
 * @property {number} [fish]         a fish trap's catch waiting (#199)
 * @property {number} [baitLeft]     a fish trap's catches left on its bait (#248)
 * @property {number} [bait]         an iron trap's bait in it (#248)
 * @property {Object | null} [holding] what an iron trap holds: an enemy or a boar (#248)
 * @property {number} [rearm]        seconds till an iron trap is set again
 * @property {Object<string, number>} [store] what a warehouse holds (#248)
 * @property {Object[]} [corpses]    a corpse pit's (#250)
 * @property {Object | null} [captive] who's in a cage (#250)
 * @property {boolean} [lit]        a torch post lit for the night (#257)
 * @property {number} [rest]        seconds a grave rests before it can be worked again (#253)
 * @property {number} [fishTimer]
 * @property {number} [radius]
 * @property {boolean} [repairRequested]
 * @property {boolean} [isDemolishing]
 * @property {Building} [targetBuilding] what a demolition blueprint takes down
 * @property {number} [fuelLeft]     a campfire's
 * @property {number} [burning]
 * @property {number} [oreLoaded]    a smelter's
 * @property {number} [coalLoaded]
 * @property {number} [ironProduced]
 * @property {number} [smeltProgress]
 * @property {Settler | null} [collector]
 * @property {number} [cookProgress] a campfire's piece cooking now, 0..1
 */

/**
 * A platform (a watchtower): a building with its tower and its guards
 * @typedef {Building & { tower: { capacity: number, minEnemies: number, range: number, damage: number, cooldown: number, projectileSpeed: number }, guards: Settler[] }} Watchtower
 */

/**
 * The town hall: a storage too, and what the enemies are after.
 * @typedef {{ x: number, y: number, radius: number, hp: number, maxHp: number, repairRequested: boolean, store?: Object<string, number> }} TownHall
 */

/**
 * A tone or a burst of noise (engine/platform/audio.js): its sound type, pitch (gliding to `to`), length,
 * loudness, attack, a lowpass filter for a tone, a band's sharpness (q)
 * @typedef {{ type?: string, freq?: number, to?: number, dur: number, gain: number, attack?: number, filter?: number, q?: number }} Sound
 */

/**
 * The state of the game being played (engine/world/state.js).
 * @typedef {Object} Game
 * @property {'endless'|'battle'|'editor'|'menu'} gameMode
 * @property {boolean} gameStarted
 * @property {boolean} isPaused
 * @property {string} gameDifficulty
 * @property {boolean} cardMode  Endless with cards (#255)
 * @property {{ cols: number, rows: number }} mapSettings
 * @property {Object | null} customMap
 * @property {Object | null} worldSeed
 * @property {number} COLS
 * @property {number} ROWS
 * @property {number} WORLD_WIDTH
 * @property {number} WORLD_HEIGHT
 * @property {number} waveInterval
 * @property {number} waveTimer
 * @property {number} waveNum
 * @property {number} boarRespawnTimer
 * @property {number} pathTick
 * @property {string} buildMode
 * @property {Settler | null} selectedSettler
 * @property {Settler[]} selectedGroup
 * @property {boolean} addingToGroup
 * @property {Object | null} defensePlan
 * @property {Settler[]} settlers
 * @property {Enemy[]} enemies
 * @property {Building[]} buildings
 * @property {Object[]} craftOrders   things being made: { key, category, id, crafter, stage, progress, for, yields?, waitFor? }
 * @property {Blueprint[]} blueprints
 * @property {Object[]} trees         (things on the map: x, y, hp, priority... as each list's own)
 * @property {Object[]} cacti
 * @property {Object[]} boulders
 * @property {Object[]} grassList
 * @property {Object[]} berryBushes
 * @property {Object[]} farmPlots
 * @property {Object[]} farmZones
 * @property {Object[]} blightZones
 * @property {boolean} [battleBlight]  (#326) a battle on blighted ground
 * @property {Object[]} naturalRocks
 * @property {Object[]} waterTiles
 * @property {number} [fishCount] fish remaining in this shoal
 * @property {number} [fishRegrowTimer] seconds until another fish returns
 * @property {Object[]} desertTiles
 * @property {Object | null} desertRegion
 * @property {Object[]} beachTiles
 * @property {Object[]} sticks
 * @property {Object[]} pebbles
 * @property {Object[]} logs
 * @property {Point[]} stumps       where a felled tree stood: its stump, till a tree grows again (#306)
 * @property {Object[]} loot          piles fallen enemies dropped: { x, y, yield, items }
 * @property {number} dayTime      seconds into the day (#257)
 * @property {number} nightId      which night it is
 * @property {boolean} wasNight
 * @property {boolean} autoBlight   the undead's necromancers blight the nearest ground by themselves (#253)
 * @property {boolean} autoBlightDone none left to blight: the switch is off for good
 * @property {string[]} portalQueue  a wave's enemy demons still to come out of the portals (#250)
 * @property {number} portalTimer
 * @property {{ x: number, y: number, type: string, amount: number, layer?: number }[]} piles  stock on the ground by a full storage (#248), in packs (#279)
 * @property {Object<string, number>} armory  tools, weapons, gear in store, by '<category>:<id>'
 * @property {Object[]} ironOres
 * @property {Object[]} coalOres
 * @property {Object[]} boars
 * @property {Object | null} armorOrder
 * @property {Object[]} enemyTents
 * @property {Object[]} enemyTentBlueprints
 * @property {Object[]} projectiles
 * @property {Object<string, number>} foodMix
 * @property {Object[]} bloodSplats
 * @property {Object[]} dung
 * @property {Object[]} corpses
 * @property {number} enemyArrowStock
 * @property {number} waveSize        how many the last wave brought
 * @property {boolean} waveRouted     it's lost most of them and run (#207)
 * @property {{ armor: boolean, shield: boolean, leather?: boolean }} playerGear  armour / a shield the player has made
 * @property {Object[]} forests
 * @property {Object[]} pendingRespawns
 * @property {Object<string, number>} paths  'gx,gy' -> how worn its ground is (#248)
 * @property {Object<string, boolean>} unlocked  cards picked (#255): '<category>:<id>' -> opened
 * @property {number} cardsDue   waves come whose card is still to be offered
 * @property {number} cardsWave  waves counted for cards
 * @property {string[] | null} cardOffer  the cards offered now
 * @property {{ side: string, timeLeft: number, seed?: number, layout?: string, army?: any[], wave?: number } | null} raidCamp  an enemy camp's zone open (#255; #279: the army it mirrors and the wave, as when it appeared)
 * @property {number} raidCampWave  the waves beaten when the last one opened
 * @property {Enemy[]} scouts  enemy scouts between waves (#279)
 * @property {Point[]} reliefZones  tiles marked to relieve in (#279)
 * @property {Point[]} postZones    tiles marked for soldiers' posts
 * @property {number} scoutClock
 * @property {any} weather  the weather now (#308, world.weather.js); null: none yet
 */

export {};
