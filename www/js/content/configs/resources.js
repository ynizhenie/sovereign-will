// Resources: what the colony stocks, how the HUD groups them, kinds of food, the start

export const resourcesConfig = {
  resources: {
    // food: ready to eat (berries, apples, and anything cooked); the raw kinds need a campfire (cooking)
    food: { id: 'food', icon: 'food', type: 'resource' },
    rawMeat: { id: 'rawMeat', icon: 'rawMeat', type: 'resource' },
    rawFish: { id: 'rawFish', icon: 'rawFish', type: 'resource' },
    wheat: { id: 'wheat', icon: 'wheat', type: 'resource' },
    wood: { id: 'wood', icon: 'wood', type: 'resource' },
    stone: { id: 'stone', icon: 'stone', type: 'resource' },
    coal: { id: 'coal', icon: 'coal', type: 'resource' },
    ironOre: { id: 'ironOre', icon: 'ironOre', type: 'resource' },
    iron: { id: 'iron', icon: 'iron', type: 'resource' },
    leather: { id: 'leather', icon: 'leather', type: 'resource' },
    arrows: { id: 'arrows', icon: 'arrows', type: 'resource' },
    wheatSeeds: { id: 'wheatSeeds', icon: 'wheatSeeds', type: 'resource' },
    saplings: { id: 'saplings', icon: 'saplings', type: 'resource' },
    herbs: { id: 'herbs', icon: 'herbs', type: 'resource' },
    // rope (#248): twisted from grass (herbs) by hand; in what's tied together
    rope: { id: 'rope', icon: 'rope', type: 'resource' },
    // campfire fuel (#199): a woodcutter chops it from wood; campfires burn it (or coal), not the wood
    firewood: { id: 'firewood', icon: 'firewood', type: 'resource', factions: ['humans', 'demons'] },
    worms: { id: 'worms', icon: 'worms', type: 'resource' },
    appleSaplings: { id: 'appleSaplings', icon: 'appleSaplings', type: 'resource' },
    // a medic's potion (#199): brewed from herbs and water at a campfire, heals more than a herb
    potions: { id: 'potions', icon: 'potions', type: 'resource', factions: ['humans', 'demons'] },
    // factions: only shown to these factions
    bones: { id: 'bones', icon: 'bones', type: 'resource', factions: ['undead'] },
    // the undead's other hiring resource: food brought in turns into it (meat and fish into bones)
    rot: { id: 'rot', icon: 'rot', type: 'resource', factions: ['undead'] }
  },

  // how the HUD groups resources: a tile per group with its total, tapped to show what's in it. A group
  // of one shows as that resource; resources in no group get their own tile. `held` groups count what
  // settlers carry instead (a category's items, 'all' but the bare fist, or listed ids).
  resourceGroups: [
    // factions: only these factions see it (the undead have no food); pinned: on the strip under the top bar
    { id: 'bones', members: ['bones'], factions: ['undead'], pinned: true }, // the undead's own, first
    { id: 'rot', members: ['rot'], factions: ['undead'] },
    { id: 'food', members: ['food'], kinds: 'foodKinds', factions: ['humans', 'demons'], pinned: true }, // Food, opening onto what it's made of
    { id: 'raw', icon: 'rawMeat', members: ['rawMeat', 'rawFish', 'wheat', 'worms'], factions: ['humans', 'demons'] }, // right after Food
    { id: 'wood', members: ['wood'], pinned: true },
    { id: 'stone', members: ['stone'], pinned: true },
    { id: 'plants', icon: 'saplings', members: ['wheatSeeds', 'saplings', 'appleSaplings', 'herbs'] },
    { id: 'materials', icon: 'stone', members: ['firewood', 'coal', 'ironOre', 'iron', 'leather', 'rope'] },
    { id: 'supplies', icon: 'arrows', members: ['arrows', 'potions'] },
    // not stock: how many settlers hold each tool / weapon / piece of gear
    { id: 'toolsHeld', icon: 'tools', members: [], held: { tools: 'all', gear: ['backpack', 'wateringCan'] } },
    { id: 'weaponsHeld', icon: 'swords', members: [], held: { weapons: 'all', gear: ['armor', 'shield'] } }
  ],

  // kinds of ready food. All of it is Food (what hiring costs and the colony eats); the HUD just shows
  // what it's made of. The start's food is a random mix of these; food that comes in without a kind
  // (loot) goes to whichever kind there's least of; food spent or eaten comes off in this order.
  foodKinds: {
    berries: { id: 'berries', icon: 'berries' }, apples: { id: 'apples', icon: 'apples' },
    bread: { id: 'bread', icon: 'bread' }, cookedFish: { id: 'cookedFish', icon: 'cookedFish' }, cookedMeat: { id: 'cookedMeat', icon: 'cookedMeat' }
  },

  // ---- Colony

  // builders bring a building's cost from the nearest storage, carryMaterials at a time. capacity (#248): how
  // much the town hall and a warehouse hold, all resources together; more lies on the ground by them
  storage: { carryMaterials: 10, capacity: { hall: 300, warehouse: 120 } },

  start: {
    // stock at the start of a game (ids from `resources`)
    resources: { wood: 30, stone: 20, firewood: 10, coal: 0, ironOre: 0, iron: 0, leather: 0, arrows: 0, food: 25, wheatSeeds: 3, saplings: 0, rope: 0 },
    // population limit before tents (each tent adds buildings.tent.population)
    population: 5
  }
};
