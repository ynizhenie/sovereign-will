// The shapes of the game's data, for the editor (JSDoc): what a settler, an enemy, a building... carries.
// Nothing runs here. Use one as  /** @type {import('../engine/world/types.js').Settler} */  (the path
// from your file). Fields not listed are set by one mechanic for its own use.

/**
 * @typedef {{ x: number, y: number }} Point
 */

/**
 * A colony unit (GAME_CONFIG.settlerTypes): created by createSettler, driven by SETTLER_BEHAVIOURS.
 * @typedef {Object} Settler
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {string} type           GAME_CONFIG.settlerTypes key ('normal', 'big', 'zombie'...)
 * @property {string} role           'worker', 'soldier' or 'archer'
 * @property {string} weapon         GAME_CONFIG.weapons key, 'fist' for none
 * @property {string} tool           GAME_CONFIG.tools key, 'none' for none
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} speed
 * @property {number} radius         the collision body
 * @property {number} visualRadius   the drawn body (a big one is drawn larger than it collides)
 * @property {boolean} isPossessed   steered by the player (its AI is off)
 * @property {{ type: string, amount: number, loads?: number, forFire?: Building, forBlueprint?: Building, forTower?: Building, forBrew?: string, corpse?: Object, toHeap?: boolean, forChop?: boolean, forTrap?: Building } | null} carrying
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
 * @property {number} [facing]       the angle its held item points at
 * @property {Object} [order]        a tap order while possessed (settlers.orders.js)
 * @property {Object | null} targetEquipment what it goes to the town hall to swap to (equip): weapon, tool, gear...
 * @property {Watchtower | null} [towerAssignment] the watchtower it guards
 * @property {boolean} [isIdle]
 * @property {boolean} [wasIdle]    it was idle last tick (cleanDung)
 * @property {boolean} [chopTrip]   on its way to chop firewood (chopFirewood)
 * @property {number} [haulWalk]    seconds carrying a corpse to the heap (carryCorpse)
 * @property {{ act: string, left: number, spot: { x: number, y: number } | null, partnerId: number | null, sharpened?: number, angle?: number, onPoint?: number, dug?: number } | null} [idle]  its pastime (#199)
 * @property {{ icon?: string, progress: number, until: number } | null} [crafting]  a thing it's making (drawn, #232)
 * @property {boolean} [swaying]     an idle undead swaying
 * @property {number} [trained]     damage won at a training dummy, a share of its own (#199)
 * @property {number | null} [guardingId]  the gatherer it guards (escortGatherers)
 * @property {boolean} [sharpened]   its blade sharpened: the next blow that lands hits harder
 * @property {Object | null} [dungTarget]  the pile of dung it's going for (cleanDung)
 * @property {boolean} [hasArmor]
 * @property {number} [usingCan]     seconds left of watering with the can
 * @property {number} [bagHerbs]     a medic's herbs
 * @property {number} [bagPotions]   a medic's potions (#199)
 * @property {number} [brewTimer]    a medic brewing a potion
 * @property {number} [brewWalk]     seconds walking for a brew (gives up past brew.giveUpSeconds)
 * @property {number} [brewRestUntil]  the tick it may try brewing again
 * @property {number} [chopTimer]    a woodcutter chopping firewood
 * @property {Object | null} [markTarget]  the marked resource it's working (kept till done, #232)
 * @property {Object | null} [corpseTarget]  the corpse it's going to carry out of the base (#199)
 * @property {number} [burning]      seconds left on fire
 * @property {number} [temporary]    a raised zombie's seconds left
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
 * @property {string} enemyKey       GAME_CONFIG.enemies key
 * @property {boolean} [trapped]    held in an iron trap (#248)
 * @property {number} [trappedFor]   seconds till it's free
 * @property {string} type           'normal', 'big', 'archer'...
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} radius
 * @property {number} speed
 * @property {number} damage
 * @property {string} weapon
 * @property {Object<string, number>} reward   what killing it adds to the stock
 * @property {Settler | null} [attackTarget]
 * @property {Object | null} buildTarget     the tent site it's building
 * @property {Point[] | null} path
 * @property {Point | null} pathTarget
 * @property {number} [arrows]
 * @property {number} [facing]
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
 * @property {number} x              its tile's centre
 * @property {number} y
 * @property {number} [progress]
 * @property {number} [maxProgress]
 * @property {number} hp
 * @property {number} maxHp
 * @property {Object<string, number>} [needs]  materials still to be brought to the blueprint
 * @property {{ arrowCapacity: number, capacity?: number }} [tower]
 * @property {number} [arrows]
 * @property {Settler[]} [guards]    a watchtower's archers
 * @property {number} [usesLeft]     a trap's uses
 * @property {number} [dung]         a compost heap's dung (#232)
 * @property {number} [fish]         a fish trap's catch waiting (#199)
 * @property {number} [baitLeft]     a fish trap's catches left on its bait (#248)
 * @property {number} [bait]         an iron trap's bait in it (#248)
 * @property {Object | null} [holding] what an iron trap holds: an enemy or a boar (#248)
 * @property {number} [rearm]        seconds till an iron trap is set again
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
 * A watchtower: a building with its tower, its arrows and its guards
 * @typedef {Building & { tower: { arrowCapacity: number, capacity: number }, arrows: number, guards: Settler[] }} Watchtower
 */

/**
 * The town hall: a storage too, and what the enemies are after.
 * @typedef {{ x: number, y: number, radius: number, hp: number, maxHp: number, repairRequested: boolean }} TownHall
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
 * @property {Object | null} defensePlan
 * @property {Settler[]} settlers
 * @property {Enemy[]} enemies
 * @property {Building[]} buildings
 * @property {Object[]} craftOrders   things being made: { key, category, id, crafter, stage, progress, for, yields? }
 * @property {Blueprint[]} blueprints
 * @property {Object[]} trees         (things on the map: x, y, hp, priority... as each list's own)
 * @property {Object[]} cacti
 * @property {Object[]} boulders
 * @property {Object[]} grassList
 * @property {Object[]} berryBushes
 * @property {Object[]} farmPlots
 * @property {Object[]} farmZones
 * @property {Object[]} blightZones
 * @property {Object[]} naturalRocks
 * @property {Object[]} waterTiles
 * @property {Object[]} desertTiles
 * @property {Object | null} desertRegion
 * @property {Object[]} beachTiles
 * @property {Object[]} sticks
 * @property {Object[]} pebbles
 * @property {Object[]} loot          piles fallen enemies dropped: { x, y, yield, items }
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
 * @property {{ armor: boolean, shield: boolean }} playerGear  armour / a shield the player has made
 * @property {Object[]} forests
 * @property {Object[]} pendingRespawns
 */

export {};
