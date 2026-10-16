// Tools, weapons, gear and what's crafted at the town hall

export const equipmentConfig = {
  // family: axe / pickaxe / rod — what it can gather (see mapResources `tool`).
  // combatDamage: what an unarmed settler carrying it hits for (a boar: twice that, GAME_CONFIG.boarDamageFactor).
  tools: {
    axe: { id: 'axe', icon: 'axe', cost: { wood: 5, stone: 5 }, family: 'axe', combatDamage: 15 },
    pickaxe: { id: 'pickaxe', icon: 'pickaxe', cost: { wood: 5, stone: 7 }, family: 'pickaxe', combatDamage: 10 },
    iron_axe: { id: 'iron_axe', icon: 'iron_axe', cost: {  wood: 5, iron: 5 }, family: 'axe', combatDamage: 18 },
    iron_pickaxe: { id: 'iron_pickaxe', icon: 'iron_pickaxe', cost: {  wood: 5, iron: 7 }, family: 'pickaxe', combatDamage: 13 },
    rod: { id: 'rod', icon: 'rod', cost: { wood: 10, wheatSeeds: 5 }, family: 'rod', combatDamage: 6 },
    // farmers: plant the farm zones (see farming) and harvest ripe wheat
    // medics: heal wounded settlers during attacks (see medic), gather grass for herbs otherwise
    // factions: only these factions have it (the undead don't farm or heal with herbs)
    medbag: { id: 'medbag', icon: 'medbag', factions: ['humans', 'demons'], cost: { leather: 3, herbs: 2 }, family: 'medic', combatDamage: 4 },
    hoe: { id: 'hoe', icon: 'hoe', factions: ['humans', 'demons'], cost: { wood: 5, stone: 2 }, family: 'hoe', combatDamage: 8 },
    // the undead's necromancer's staff: whoever holds it is a necromancer: heals the undead around,
    // raises corpses into temporary zombies (raises before going back to a grave for more), blights
    // the ground the player marks (blightSeconds and blightRot of the stock a tile); it raises a corpse
    // from raiseReach away, a dark thread to it while it does (#203)
    necro_staff: { id: 'necro_staff', icon: 'staff', factions: ['undead'], cost: { bones: 20, rot: 10 }, family: 'necro', combatDamage: 6,
      necromancer: { raises: 5, range: 400, raiseReach: 110, raiseSeconds: 1.5, healRange: 60, healPerSecond: 8, blightSeconds: 2, blightRot: 1 } }
  },

  // family: club / sword / spear / bow — how it's drawn and used (bows shoot arrows).
  // combat: damage per hit, range of a hit, cooldown (s) between hits, approach: how close the settler
  //   walks to an enemy before striking (bow: shooting distance), tentReach: same for enemy tents;
  //   bows also: projectileSpeed, projectileLife (ticks).
  // Hunting a boar uses the same, the damage times GAME_CONFIG.boarDamageFactor (#232).
  // Fists hit with the tool the settler carries (tools' combatDamage), bare hands otherwise.
  // settlerTypes' damageMultiplier applies on top.
  weapons: {
    fist: { id: 'fist', icon: 'fist', cost: {},
      combat: { damage: 6, range: 28, cooldown: 0.7, approach: 22, tentReach: 25 } },
    club: { id: 'club', icon: 'club', cost: { wood: 4 }, family: 'club',
      combat: { damage: 10, range: 35, cooldown: 0.6, approach: 22, tentReach: 25 } },
    sword: { id: 'sword', icon: 'sword', cost: { wood: 6, stone: 3 }, family: 'sword',
      combat: { damage: 20, range: 42, cooldown: 0.4, approach: 22, tentReach: 25 } },
    spear: { id: 'spear', icon: 'spear', cost: { wood: 10, stone: 5 }, family: 'spear',
      combat: { damage: 25, range: 65, cooldown: 0.7, approach: 45, tentReach: 25 } },
    iron_sword: { id: 'iron_sword', icon: 'iron_sword', cost: { wood: 6, iron: 3 }, family: 'sword',
      combat: { damage: 30, range: 42, cooldown: 0.4, approach: 22, tentReach: 25 } },
    iron_spear: { id: 'iron_spear', icon: 'iron_spear', cost: { wood: 10, iron: 5 }, family: 'spear',
      combat: { damage: 40, range: 65, cooldown: 0.7, approach: 45, tentReach: 25 } },
    bow: { id: 'bow', icon: 'bow', cost: { wood: 15, leather: 5 }, family: 'bow',
      combat: { damage: 30, cooldown: 0.8, approach: 140, tentReach: 140, projectileSpeed: 4.5, projectileLife: 80 } },
    // the fire imps' fireballs: shot like a bow (arrows are their charges), not made in the Weapons tab
  },

  // worn gear, paid for with its button and picked up at the town hall (the settler walks there to
  // put it on, and to take it off: the cost comes back). backpack: a worker carries extraLoads more
  // loads (never an archer: the quiver is on its back). armor: +hpBonus, damageReduction off every hit,
  // melee soldiers first. shield: melee soldiers only, damageReduction off every hit, on top of armour.
  gear: {
    backpack: { id: 'backpack', icon: 'backpack', cost: { leather: 5 }, extraLoads: 1 },
    shield: { id: 'shield', icon: 'shield', cost: { wood: 6, iron: 2 }, damageReduction: 0.25 },
    armor: { id: 'armor', icon: 'armor', cost: { iron: 8 }, hpBonus: 50, damageReduction: 0.35 },
    // farmers (hoe) only, from the Tools tab: fills at water for `charges` crops; a watered crop grows
    // growthFactor times as fast
    wateringCan: { id: 'wateringCan', icon: 'wateringCan', factions: ['humans', 'demons'], cost: { wood: 3, iron: 1 }, charges: 5, growthFactor: 2 }
  },

  // crafted at the town hall into the stock
  recipes: {
    arrows: { id: 'arrows', icon: 'arrows', cost: { wood: 3, stone: 1 }, produces: { arrows: 6 } }
  }
};
