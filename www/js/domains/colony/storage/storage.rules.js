// The colony's stock and its storages (the town hall and warehouses): taking and adding, prices and
// whether they can be paid, food by kind, and what a settler carries

// ---- The colony's stock (#36, #141): amount per resource id of GAME_CONFIG.resources, shared by the
// whole colony (set from GAME_CONFIG.start by resetGame). The town hall and warehouses are where
// settlers bring what they gather and fetch what they need: whichever is nearest.
const stock = Object.fromEntries(Object.keys(GAME_CONFIG.resources).map(id => [id, 0]));

function getStorages() {
  return [townHall, ...buildings.filter(b => b.type === 'warehouse')];
}

// Take up to `amount` of a resource out of the stock; returns how much there was
function takeStock(id, amount) {
  const got = Math.max(0, Math.min(amount, stock[id] || 0));
  stock[id] -= got;
  return got;
}

// Shown in the HUD: the stock, plus for arrows the ones already loaded in towers and quivers
function getResourceAmount(resourceKey) {
  let amount = stock[resourceKey] || 0;
  if (resourceKey === 'arrows') {
    amount += buildings.filter(building => building.type === 'watchtower').reduce((sum, tower) => sum + (tower.arrows || 0), 0) +
      settlers.reduce((sum, settler) => sum + (settler.arrows || 0), 0);
  }
  return amount;
}

// ---- Food kinds (GAME_CONFIG.foodKinds): all Food, remembered by kind for the HUD

function isFoodKind(type) {
  return !!GAME_CONFIG.foodKinds[type];
}

// Ready food of a kind into the stock
// The start's food as a random mix of kinds (#169)
function mixStartFood() {
  const kinds = Object.keys(GAME_CONFIG.foodKinds);
  foodMix = {};
  for (let i = 0; i < Math.floor(stock.food); i++) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    foodMix[kind] = (foodMix[kind] || 0) + 1;
  }
  syncFoodMix();
}

function addFood(kind, amount) {
  syncFoodMix();
  stock.food += amount;
  foodMix[kind] = (foodMix[kind] || 0) + amount;
}

// Keep the kinds adding up to stock.food: food added without a kind goes, a piece at a time, to whichever
// kind there's least of; food spent or eaten comes off the kinds in GAME_CONFIG.foodKinds order
function syncFoodMix() {
  const kinds = Object.keys(GAME_CONFIG.foodKinds);
  let diff = stock.food - kinds.reduce((sum, k) => sum + (foodMix[k] || 0), 0);
  while (diff > 1e-9) {
    const least = kinds.reduce((a, b) => ((foodMix[b] || 0) < (foodMix[a] || 0) ? b : a));
    const piece = Math.min(1, diff);
    foodMix[least] = (foodMix[least] || 0) + piece;
    diff -= piece;
  }
  for (const kind of kinds) {
    if (diff >= 0) break;
    const take = Math.min(foodMix[kind] || 0, -diff);
    foodMix[kind] = (foodMix[kind] || 0) - take;
    diff += take;
  }
}

function formatCost(cost = {}) {
  return Object.entries(cost)
    .map(([key, value]) => (GAME_CONFIG.resources[key] ? `{{${key}:${value}}}` : `${value}${getResourceIcon(key)}`))
    .join(' ');
}

function canAfford(cost = {}) {
  return Object.entries(cost).every(([key, amount]) => Number(stock[key] || 0) >= Number(amount || 0));
}

const getFreeStock = id => Number(stock[id] || 0) - getReservedForBlueprints(id);

// Take / give a cost ({ resourceId: amount }) from / to the stock
function payCost(cost = {}) {
  for (const [resource, amount] of Object.entries(cost)) stock[resource] = Number(stock[resource] || 0) - Number(amount || 0);
}

function addResources(amounts = {}) {
  for (const [resource, amount] of Object.entries(amounts)) stock[resource] = Number(stock[resource] || 0) + Number(amount || 0);
}

// have: how much of a resource counts as there (the whole stock, or for buildings what's not promised)
function getMissingCost(cost, have = id => Number(stock[id] || 0)) {
  return Object.entries(cost)
    .filter(([key, amount]) => have(key) < Number(amount || 0))
    .map(([key, amount]) => `${Number(amount) - have(key)}${getResourceIcon(key)}`)
    .join(', ');
}

function showCostError(cost, prefix, have) {
  showNotification(t('cost.missing', { prefix, cost: formatCost(cost), missing: getMissingCost(cost, have) }), true);
}

function giveResourceToSettler(s, type, amount) {
  if (!s) return;
  if (!s.carrying) {
    s.carrying = { type: type, amount: amount };
  } else if (s.carrying.type === type) {
    s.carrying.amount += amount;
  } else if (s.carrying.items) {
    let item = s.carrying.items.find(entry => entry.type === type);
    if (item) item.amount += amount;
    else s.carrying.items.push({ type: type, amount: amount });
  } else {
    s.carrying = { type: 'bundle', items: [{ type: s.carrying.type, amount: s.carrying.amount }, { type: type, amount: amount }] };
  }
}

// How many gathered loads this settler carries before heading home: its type's carryLoads, plus a
// backpack's. Fishers bring each catch home (they pick up bait there).
function getCarryCapacity(s) {
  if (s.tool === 'rod') return 1;
  const type = getDefinition('settlerTypes', s.type) || GAME_CONFIG.settlerTypes.normal;
  return (type.carryLoads || 1) + (s.backpack ? GAME_CONFIG.gear.backpack.extraLoads : 0);
}

// Count one more gathered load on what the settler carries
function addCarryLoad(s) {
  if (s && s.carrying) s.carrying.loads = (s.carrying.loads || 0) + 1;
}

// Carrying gathered loads but room for more (smelter runs etc. have no loads: always full)
function hasRoomToCarry(s) {
  return !!s.carrying && s.carrying.loads !== undefined && s.carrying.loads < getCarryCapacity(s);
}

function getTownHallApproachPoint(settler) {
  let dx = settler.x - townHall.x;
  let dy = settler.y - townHall.y;
  let distance = Math.hypot(dx, dy);
  if (distance === 0) {
    dx = 1;
    dy = 0;
    distance = 1;
  }
  let approachDistance = townHall.radius + settler.radius - 1;
  // the side facing the settler, or the nearest side round from it that's free to stand on: spikes or a
  // wall against the hall there and it would walk onto them (a playtest saw settlers killed by their own
  // spikes beside the hall)
  const angle = Math.atan2(dy, dx);
  for (let turn = 0; turn <= 12; turn++) {
    for (const sign of turn ? [1, -1] : [1]) {
      const a = angle + sign * turn * Math.PI / 12;
      const p = { x: townHall.x + Math.cos(a) * approachDistance, y: townHall.y + Math.sin(a) * approachDistance };
      const g = getGridPos(p.x, p.y);
      if (!isTileBlockedForSettler(g.gx, g.gy) || turn === 12) return p;
    }
  }
  return { x: townHall.x + (dx / distance) * approachDistance, y: townHall.y + (dy / distance) * approachDistance };
}

function moveSettlerToTownHall(settler, speed, dt) {
  let approachPoint = getTownHallApproachPoint(settler);
  moveEntityTowards(settler, approachPoint.x, approachPoint.y, speed, false, dt);
}
