function resourceHudId(resourceKey) {
  const ids = {
    ironOre: 'iron-ore-txt',
    arrows: 'arrow-txt',
    armor: 'armor-stock-txt',
    wheatSeeds: 'wheat-seed-txt',
    saplings: 'sapling-txt'
  };
  return ids[resourceKey] || `${resourceKey}-txt`;
}

function getResourceAmount(resourceKey) {
  const amounts = {
    wood,
    stone,
    coal,
    ironOre: ironOreStock,
    iron,
    leather,
    arrows: arrowsStock + buildings.filter(building => building.type === 'watchtower').reduce((sum, tower) => sum + (tower.arrows || 0), 0) + settlers.reduce((sum, settler) => sum + (settler.arrows || 0), 0),
    food,
    armor: armorStock,
    wheatSeeds,
    saplings
  };
  return amounts[resourceKey] || 0;
}

function updateUnitCounts() {
  const workers = settlers.filter(s => s.role === 'worker').length;
  const warriors = settlers.filter(s => s.role === 'soldier' || s.role === 'archer').length;

  const workersElem = document.getElementById('workers-cnt');
  const warriorsElem = document.getElementById('warriors-cnt');

  if (workersElem) workersElem.innerText = workers;
  if (warriorsElem) warriorsElem.innerText = warriors;
}

function createConfigButton(item, action) {
  const button = document.createElement('button');
  button.className = 'btn';
  button.id = `btn-${item.id}`;
  button.innerText = `${item.icon || ''} ${item.label} (${formatCost(item.cost || {})})`;
  button.addEventListener('click', () => action(item.id));
  return button;
}

function renderConfigHud() {
  const resourcesHud = document.getElementById('resources-hud');
  if (resourcesHud) {
    const base = document.createElement('div');
    base.innerHTML = `🏛️ База: <b id="base-hp-txt" style="color: #e74c3c;">100/100</b>`;
    resourcesHud.appendChild(base);

    const population = document.createElement('div');
    population.innerHTML = `👨‍🌾 Жители: <b id="pop-txt" style="color: #2ecc71;">2/5</b> <span style="font-size: 0.9em; opacity: 0.85;">(👨‍🌾 <b id="workers-cnt">0</b> | ⚔️ <b id="warriors-cnt">0</b>)</span>`;
    resourcesHud.appendChild(population);

    Object.values(GAME_CONFIG.resources).forEach(resource => {
      const item = document.createElement('div');
      item.innerHTML = `${resource.icon || ''} ${resource.label}: <b id="${resourceHudId(resource.id)}">0</b>`;
      resourcesHud.appendChild(item);
    });
  }

  const buildActions = document.getElementById('build-actions');
  Object.values(GAME_CONFIG.buildings).forEach(item => {
    if (buildActions) buildActions.appendChild(createConfigButton(item, setMode));
  });

  const toolActions = document.getElementById('tool-actions');
  Object.values(GAME_CONFIG.tools).forEach(item => {
    if (toolActions) toolActions.appendChild(createConfigButton(item, assignTool));
  });

  const weaponActions = document.getElementById('weapon-actions');
  Object.values(GAME_CONFIG.weapons).forEach(item => {
    if (item.id !== 'fist' && weaponActions) {
      weaponActions.appendChild(createConfigButton(item, craftWeapon));
    }
  });
}


function createWorldSeed(seedInput = 'default-world-seed') {
  const seedValue = String(seedInput || 'default-world-seed');
  let state = 2166136261;
  for (let i = 0; i < seedValue.length; i++) {
    state ^= seedValue.charCodeAt(i);
    state = Math.imul(state, 16777619) >>> 0;
  }
  return {
    value: seedValue,
    random() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    },
    nextInt(max = 1) { return Math.floor(this.random() * max); },
    nextRange(min, max) { return min + this.random() * (max - min); }
  };
}

function getDefinition(category, key) {
  return (GAME_CONFIG[category] && GAME_CONFIG[category][key]) || null;
}

function getMapCount(key, fallback) {
  const value = GAME_CONFIG.map && GAME_CONFIG.map[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'object') {
    const min = Math.max(0, Math.floor(Number(value.min ?? fallback)));
    const max = Math.max(min, Math.floor(Number(value.max ?? min)));
    return min + Math.floor(rand() * (max - min + 1));
  }
  return Math.max(0, Math.floor(Number(value)));
}

function getMapRange(key, fallbackMin, fallbackMax) {
  const configured = GAME_CONFIG.map && GAME_CONFIG.map[key];
  const min = Math.max(0, Number(configured && configured.min !== undefined ? configured.min : fallbackMin));
  const max = Math.max(min, Number(configured && configured.max !== undefined ? configured.max : fallbackMax));
  return { min, max };
}

function getResourceIcon(resourceKey) {
  const resource = GAME_CONFIG.resources[resourceKey];
  return resource ? resource.icon : resourceKey;
}

function formatCost(cost = {}) {
  return Object.entries(cost)
    .map(([key, value]) => `${value}${getResourceIcon(key)}`)
    .join(' ');
}

function canAfford(wallet, cost = {}) {
  return Object.entries(cost).every(([key, amount]) => Number(wallet[getWalletKey(key)] || wallet[key] || 0) >= Number(amount || 0));
}

function spendResources(wallet, cost = {}) {
  const next = { ...wallet };
  Object.entries(cost).forEach(([key, amount]) => {
    const stateKey = getWalletKey(key);
    next[stateKey] = Number(next[stateKey] || next[key] || 0) - Number(amount || 0);
  });
  return next;
}

function getWalletKey(resourceKey) {
  const aliases = { ironOre: 'ironOreStock', armor: 'armorStock' };
  return aliases[resourceKey] || resourceKey;
}

function canBuild(buildingType) {
  const item = getDefinition('buildings', buildingType);
  return item ? canAfford(getWallet(), item.cost || {}) : false;
}

function payBuildingCost(buildingType) {
  const item = getDefinition('buildings', buildingType);
  if (!item) return;
  const nextWallet = spendResources(getWallet(), item.cost || {});
  wood = nextWallet.wood;
  stone = nextWallet.stone;
  coal = nextWallet.coal;
  ironOreStock = nextWallet.ironOreStock;
  iron = nextWallet.iron;
  leather = nextWallet.leather;
  food = nextWallet.food;
  armorStock = nextWallet.armorStock;
  wheatSeeds = nextWallet.wheatSeeds;
  saplings = nextWallet.saplings;
  arrowsStock = nextWallet.arrows;
}

function createBuildingBlueprint(type, x, y) {
  const item = getDefinition('buildings', type);
  const build = item && item.build ? item.build : {};
  const blueprint = { type, x, y, progress: 0, maxProgress: build.maxProgress || 40 };
  if (build.hp) blueprint.hp = build.hp, blueprint.maxHp = build.hp;
  if (build.smelter) blueprint.smeltProgress = 0;
  if (build.tower) {
    blueprint.tower = { ...build.tower };
    blueprint.arrows = 0;
    blueprint.guards = [];
  }
  return blueprint;
}

function getWallet() {
  return {
    wood, stone, coal, ironOreStock, iron, leather, food, armorStock, wheatSeeds, saplings, arrows: arrowsStock
  };
}

function applyWallet(wallet) {
  wood = wallet.wood;
  stone = wallet.stone;
  coal = wallet.coal;
  ironOreStock = wallet.ironOreStock;
  iron = wallet.iron;
  leather = wallet.leather;
  food = wallet.food;
  armorStock = wallet.armorStock;
  wheatSeeds = wallet.wheatSeeds;
  saplings = wallet.saplings;
  arrowsStock = wallet.arrows;
}

function getMissingCost(cost, wallet = getWallet()) {
  return Object.entries(cost)
    .filter(([key, amount]) => Number(wallet[getWalletKey(key)] || wallet[key] || 0) < Number(amount || 0))
    .map(([key, amount]) => `${Number(amount) - Number(wallet[getWalletKey(key)] || wallet[key] || 0)}${getResourceIcon(key)}`)
    .join(', ');
}

function showCostError(cost, prefix) {
  showNotification(`${prefix} ${formatCost(cost)} (не хватает ${getMissingCost(cost)})`, true);
}

function createDefaultSeed() {
  const values = new Uint32Array(2);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(values);
  else {
    values[0] = Date.now() >>> 0;
    values[1] = Math.floor(Math.random() * 4294967296);
  }
  return `lima-${Date.now().toString(36)}-${values[0].toString(36)}-${values[1].toString(36)}`;
}
