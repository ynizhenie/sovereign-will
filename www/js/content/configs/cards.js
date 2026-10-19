// The Endless mode's cards (#255): a setting, off by default. On, a game starts with only what it takes to
// live; each wave beaten offers three cards, one thing each, and the one picked opens for good

export const cardsConfig = {
  // start: open from the start, by GAME_CONFIG section. Everything else in these sections is locked
  // (recipes never are), and each lock is a card of its rarity (one of each offered, any rarity filling
  // in when one has none left). A thing with iron in its cost is offered once the smelter is open, one
  // made at a smithy once the smithy is
  cards: {
    start: {
      buildings: ['wall_wood', 'workshop', 'warehouse', 'campfire', 'torch', 'tent', 'demon_den', 'grave', 'corpse_pit', 'wheat', 'sapling'],
      tools: ['axe', 'pickaxe', 'rod', 'hoe', 'necro_staff'],
      weapons: ['club'],
      gear: ['backpack']
    },
    rarity: {
      common: ['buildings:wall_stone', 'buildings:door', 'buildings:spikes', 'buildings:dummy', 'buildings:fish_trap', 'buildings:dung_heap', 'buildings:apple_sapling',
        'tools:medbag', 'weapons:sword', 'gear:wateringCan', 'gear:whistle'],
      rare: ['buildings:smelter', 'buildings:smithy', 'buildings:iron_door', 'buildings:iron_trap', 'buildings:cage', 'buildings:portal', 'buildings:sacrifice_circle',
        'tools:iron_axe', 'tools:iron_pickaxe', 'weapons:spear', 'weapons:bow', 'gear:shield', 'gear:banner'],
      legendary: ['buildings:watchtower', 'weapons:iron_sword', 'weapons:iron_spear', 'gear:armor']
    }
  }
};
