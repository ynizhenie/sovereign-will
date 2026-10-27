// Tools, weapons, gear and what's crafted at the town hall

export const equipmentConfig = {
  // family: axe / pickaxe / rod — what it can gather (see mapResources `tool`).
  // combatDamage: what an unarmed settler carrying it hits for (a boar too, #298).
  // madeBy: 'hand': made at the town hall, no workshop needed (#261); otherwise a workshop, a smithy with iron.
  tools: {
    axe: { id: 'axe', icon: 'axe', cost: { wood: 5, stone: 5 }, family: 'axe', combatDamage: 15 },
    pickaxe: { id: 'pickaxe', icon: 'pickaxe', cost: { wood: 5, stone: 7 }, family: 'pickaxe', combatDamage: 10 },
    iron_axe: { id: 'iron_axe', icon: 'iron_axe', cost: {  wood: 5, iron: 5 }, family: 'axe', combatDamage: 18 },
    iron_pickaxe: { id: 'iron_pickaxe', icon: 'iron_pickaxe', cost: {  wood: 5, iron: 7 }, family: 'pickaxe', combatDamage: 13 },
    rod: { id: 'rod', icon: 'rod', madeBy: 'hand', cost: { wood: 8, rope: 1 }, family: 'rod', combatDamage: 6 },
    // farmers: plant the farm zones (see farming) and harvest ripe wheat
    // medics: heal wounded settlers during attacks (see medic), gather grass for herbs otherwise
    // factions: only these factions have it (the undead don't farm or heal with herbs)
    medbag: { id: 'medbag', icon: 'medbag', factions: ['humans', 'demons'], madeBy: 'hand', cost: { leather: 3, herbs: 2 }, family: 'medic', combatDamage: 4 },
    hoe: { id: 'hoe', icon: 'hoe', factions: ['humans', 'demons'], cost: { wood: 5, stone: 2 }, family: 'hoe', combatDamage: 8 },
    // the undead's necromancer's staff: whoever holds it is a necromancer: heals the undead around,
    // raises corpses into temporary zombies (raises before going back to a grave for more), blights
    // the ground the player marks (blightSeconds and blightRot of the stock a tile); it raises a corpse
    // from raiseReach away, a dark thread to it while it does (#203)
    necro_staff: { id: 'necro_staff', icon: 'staff', factions: ['undead'], madeBy: 'hand', cost: { bones: 20, rot: 10 }, family: 'necro', combatDamage: 6,
      // (#326) up to `maxZombies` of its raised zombies at once, one raise (of `raises`) each, the charges back at a grave;
      // they keep within leashTiles of it, a necromancer sends them at an enemy within commandTiles of it (else they
      // guard themselves within guardTiles), and arms one with what lies by the corpse (within armReach px); it goes
      // for a corpse up to seekRange px off
      necromancer: { raises: 3, maxZombies: 3, range: 400, seekRange: 900, commandTiles: 10, leashTiles: 4, guardTiles: 3, armReach: 45,
        raiseReach: 110, raiseSeconds: 1.5, healRange: 60, healPerSecond: 8, blightSeconds: 2, blightRot: 1 } }
  },

  // family: club / sword / spear / bow — how it's drawn and used (bows shoot arrows).
  // combat: damage per hit, range of a hit, cooldown (s) between hits, approach: how close the settler
  //   walks to an enemy before striking (bow: shooting distance), tentReach: same for enemy tents;
  //   bows also: projectileSpeed, projectileLife (ticks).
  // Hunting a boar uses the same (#298: not doubled).
  // Fists hit with the tool the settler carries (tools' combatDamage), bare hands otherwise.
  // settlerTypes' damageMultiplier applies on top.
  weapons: {
    fist: { id: 'fist', icon: 'fist', cost: {},
      combat: { damage: 6, range: 28, cooldown: 0.7, approach: 22, tentReach: 25 } },
    club: { id: 'club', icon: 'club', madeBy: 'hand', craftSeconds: 2.5, cost: { wood: 4 }, family: 'club', // (#326: quick to make)
      combat: { damage: 10, range: 35, cooldown: 0.6, approach: 22, tentReach: 25 } },
    sword: { id: 'sword', icon: 'sword', cost: { wood: 6, stone: 3 }, family: 'sword',
      combat: { damage: 20, range: 42, cooldown: 0.4, approach: 22, tentReach: 25 } },
    spear: { id: 'spear', icon: 'spear', cost: { wood: 10, stone: 5 }, family: 'spear',
      combat: { damage: 25, range: 65, cooldown: 0.7, approach: 45, tentReach: 25 } },
    iron_sword: { id: 'iron_sword', icon: 'iron_sword', cost: { wood: 6, iron: 3 }, family: 'sword',
      combat: { damage: 30, range: 42, cooldown: 0.4, approach: 22, tentReach: 25 } },
    iron_spear: { id: 'iron_spear', icon: 'iron_spear', cost: { wood: 10, iron: 5 }, family: 'spear',
      combat: { damage: 40, range: 65, cooldown: 0.7, approach: 45, tentReach: 25 } },
    bow: { id: 'bow', icon: 'bow', cost: { wood: 15, leather: 3, rope: 2 }, family: 'bow',
      combat: { damage: 30, cooldown: 0.8, approach: 140, tentReach: 140, projectileSpeed: 4.5, projectileLife: 80 },
      // (#326) out of arrows an archer draws its dagger (the bow on its back) and stabs at what comes close: weak
      dagger: { damage: 5, range: 30, cooldown: 0.5, approach: 22, tentReach: 25, closeTiles: 3 } },
    // the fire imps' fireballs: shot like a bow (arrows are their charges), not made in the Weapons tab
  },

  // worn gear, paid for with its button and picked up at the town hall (the settler walks there to
  // put it on, and to take it off: the cost comes back). backpack: a worker carries extraLoads more
  // loads (never an archer: the quiver is on its back). armor: +hpBonus, damageReduction off every hit,
  // melee soldiers first. shield: melee soldiers only, damageReduction off every hit, on top of armour.
  gear: {
    backpack: { id: 'backpack', icon: 'backpack', madeBy: 'hand', cost: { leather: 4, rope: 2 }, extraLoads: 1 },
    shield: { id: 'shield', icon: 'shield', cost: { wood: 6, iron: 2 }, damageReduction: 0.25 },
    armor: { id: 'armor', icon: 'armor', cost: { iron: 8 }, hpBonus: 50, damageReduction: 0.35, armorKind: 'iron' },
    // (#298) leather armour: weaker than iron (armorKind: what `armor` a unit wearing it has), made at a workshop
    leather_armor: { id: 'leather_armor', icon: 'leather_armor', cost: { leather: 6 }, hpBonus: 25, damageReduction: 0.18, armorKind: 'leather' },
    // farmers (hoe) only, from the Tools tab: fills at water for `charges` crops; a watered crop grows
    // growthFactor times as fast
    wateringCan: { id: 'wateringCan', icon: 'wateringCan', factions: ['humans', 'demons'], cost: { wood: 3, iron: 1 }, charges: 5, growthFactor: 2 },
    // commanders (#248): a worker with a whistle is a foreman: it walks to each of its squad (the `squad`
    // nearest workers) in turn, every `everySeconds`, and tells it what's needed most (focusSeconds: what it
    // gathers first), and to swap its tool for one from the armory that does it. A soldier with a banner is a
    // captain: in a wave it fights, and every `everySeconds` gives one of its squad an enemy to go for
    whistle: { id: 'whistle', icon: 'whistle', madeBy: 'hand', craftSeconds: 2, cost: { wood: 2, rope: 2 }, commands: { squad: 3, everySeconds: 6, reach: 50, focusSeconds: 45, rangeTiles: 5 } },
    banner: { id: 'banner', icon: 'banner', cost: { wood: 4, leather: 2, rope: 2 }, commands: { squad: 5, everySeconds: 3, reach: 150, armSeconds: 25, rangeTiles: 5 } },
    // (#326) the undead's soul lantern, in a necromancer's side slot: a soul flies into it for each zombie it raises (no limit to
    // what it holds); near a grave or the hall (nearTiles) one flies out every releaseSeconds into the stock
    soul_lantern: { id: 'soul_lantern', icon: 'soul_lantern', factions: ['undead'], madeBy: 'hand', craftSeconds: 3, cost: { bones: 6, rot: 3 }, lantern: { nearTiles: 3, releaseSeconds: 0.6, flySeconds: 0.9 } }
  },
  // what a foreman counts as needed most: the one furthest under its amount here (food only for those who
  // eat; ore with a smelter)
  needs: { wood: 80, stone: 50, food: 40, ironOre: 15 },

  // crafted at the town hall into the stock
  // made into the stock: kind: the Craft sub-tab it's in; made in `batches` quick jobs; arrows by archers
  // while there are any (#249)
  recipes: {
    arrows: { id: 'arrows', icon: 'arrows', kind: 'weapons', cost: { wood: 3, stone: 1 }, produces: { arrows: 6 }, batches: 3, unlockedWith: 'weapons:bow' },
    rope: { id: 'rope', icon: 'rope', kind: 'supplies', madeBy: 'hand', cost: { herbs: 2 }, produces: { rope: 2 }, disassemble: true },
    torch: { id: 'torch', icon: 'torch', kind: 'supplies', madeBy: 'hand', cost: { wood: 1, rope: 1 }, produces: { torches: 1 }, disassemble: true },
    // (#326) firewood to order: as much as a woodcutter chops of it (GAME_CONFIG.firewood: `makes` of one wood)
    firewood: { id: 'firewood', icon: 'firewood', kind: 'supplies', madeBy: 'hand', cost: { wood: 1 }, produces: { firewood: 2 } }
  }
};
