// The Endless mode's cards (#255): a setting, off by default. On, a game starts with only what it takes to
// live; each wave beaten offers three cards, one thing each, and the one picked opens for good

export const cardsConfig = {
  // start: open from the start, by GAME_CONFIG section. Everything else in these sections is locked
  // (recipes never are), and each lock is a card of its rarity. Each of the three cards offered is of a
  // rarity drawn by `chances` (#279: three common can come), another standing in for one with none left. A thing with iron in its cost is offered once the smelter is open, one
  // made at a smithy once the smithy is. (#306) A recipe with `unlockedWith` opens with that (arrows with the bow)
  cards: {
    start: {
      buildings: ['wall_wood', 'workshop', 'warehouse', 'campfire', 'torch', 'tent', 'demon_den', 'grave', 'corpse_pit', 'wheat', 'sapling'],
      tools: ['axe', 'pickaxe', 'rod', 'hoe', 'necro_staff'],
      weapons: ['club', 'sword'], // (#306: a sword from the start)
      gear: ['backpack']
    },
    chances: { common: 60, rare: 30, legendary: 10 },
    rarity: {
      common: ['buildings:wall_stone', 'buildings:door', 'buildings:spikes', 'buildings:dummy', 'buildings:fish_trap', 'buildings:dung_heap', 'buildings:apple_sapling',
        'tools:medbag', 'gear:wateringCan', 'gear:whistle'],
      rare: ['buildings:smelter', 'buildings:mine', 'buildings:smithy', 'buildings:iron_door', 'buildings:iron_trap', 'buildings:cage', 'buildings:portal', 'buildings:sacrifice_circle',
         'tools:iron_axe', 'tools:iron_pickaxe', 'weapons:spear', 'weapons:bow', 'gear:shield', 'gear:helmet', 'gear:banner'],
      legendary: ['buildings:watchtower', 'weapons:iron_sword', 'weapons:iron_spear', 'weapons:crossbow', 'gear:armor']
    }
  }
};
