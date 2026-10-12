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
 * @property {'worker'|'soldier'|'archer'} role
 * @property {string} weapon         GAME_CONFIG.weapons key, 'fist' for none
 * @property {string} tool           GAME_CONFIG.tools key, 'none' for none
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} speed
 * @property {number} radius         the collision body
 * @property {number} visualRadius   the drawn body (a big one is drawn larger than it collides)
 * @property {boolean} isPossessed   steered by the player (its AI is off)
 * @property {{ type: string, amount: number, loads?: number, forFire?: Building, forBlueprint?: Building } | null} carrying
 * @property {Point[]} path          the way it walks, tile by tile (moveEntityTowards)
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
 */

/**
 * A wave's unit (GAME_CONFIG.enemies): created by createConfiguredEnemy, driven by tickEnemy.
 * @typedef {Object} Enemy
 * @property {string} enemyKey       GAME_CONFIG.enemies key
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
 * @property {Building | null} buildTarget     the tent site it's building
 * @property {Point[]} path
 * @property {Point | null} pathTarget
 * @property {number} [arrows]
 */

/**
 * A building or a blueprint of one (GAME_CONFIG.buildings): created by createBuildingBlueprint; built,
 * it goes from game.blueprints to game.buildings.
 * @typedef {Object} Building
 * @property {string} type           GAME_CONFIG.buildings key
 * @property {number} x              its tile's centre
 * @property {number} y
 * @property {number} progress       building work done, of maxProgress
 * @property {number} maxProgress
 * @property {number} [hp]
 * @property {number} [maxHp]
 * @property {Object<string, number>} [needs]  materials still to be brought to the blueprint
 * @property {{ arrowCapacity: number }} [tower]
 * @property {number} [arrows]
 * @property {number} [usesLeft]     a trap's uses
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
 * @property {Building[]} blueprints
 * @property {Object[]} trees
 * @property {Object[]} boars
 * @property {Object[]} corpses
 * @property {Object[]} projectiles
 */

export {};
