function resourceHudId(resourceKey) {
  return `resource-${resourceKey}-txt`;
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

// Open a resource group's row (closing any other), or close it if it's open
function toggleResourceGroup(groupId) {
  for (const group of GAME_CONFIG.resourceGroups) {
    const row = document.getElementById(`group-${group.id}-members`);
    const tile = document.getElementById(`group-${group.id}`);
    if (!row) continue;
    row.hidden = group.id === groupId ? !row.hidden : true;
    if (tile) tile.classList.toggle('open', !row.hidden);
  }
}

// ---- Food kinds (GAME_CONFIG.foodKinds): all Food, remembered by kind for the HUD

function isFoodKind(type) {
  return !!GAME_CONFIG.foodKinds[type];
}

// Ready food of a kind into the stock
function addFood(kind, amount) {
  syncFoodMix();
  stock.food += amount;
  foodMix[kind] = (foodMix[kind] || 0) + amount;
}

// Keep the kinds adding up to stock.food: food added without a kind counts as provisions, and food spent
// or eaten comes off the kinds in GAME_CONFIG.foodKinds order
function syncFoodMix() {
  const kinds = Object.keys(GAME_CONFIG.foodKinds);
  let diff = stock.food - kinds.reduce((sum, k) => sum + (foodMix[k] || 0), 0);
  if (diff > 0) foodMix.provisions = (foodMix.provisions || 0) + diff;
  for (const kind of kinds) {
    if (diff >= 0) break;
    const take = Math.min(foodMix[kind] || 0, -diff);
    foodMix[kind] = (foodMix[kind] || 0) - take;
    diff += take;
  }
}

// The [category, id] pairs a `held` HUD group counts (see GAME_CONFIG.resourceGroups)
function getHeldItems(group) {
  const items = [];
  for (const [category, ids] of Object.entries(group.held)) {
    const all = Object.keys(GAME_CONFIG[category]).filter(id => id !== 'fist');
    for (const id of ids === 'all' ? all : ids) items.push([category, id]);
  }
  return items;
}

// How many settlers hold that tool, weapon or piece of gear
function countHeld(category, id) {
  if (category === 'tools') return settlers.filter(s => s.tool === id).length;
  if (category === 'weapons') return settlers.filter(s => s.weapon === id).length;
  return settlers.filter(s => hasGear(s, id)).length;
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
  setRichText(button, `${item.icon ? `[[${item.icon}]]` : ''} ${item.label} (${formatCost(item.cost || {})})`);
  button.addEventListener('click', () => action(item.id));
  return button;
}

// Rebuild the generated HUD and buttons, e.g. after a language change (setLanguage)
function rebuildConfigHud() {
  for (const id of ['resources-hud', 'build-actions', 'farming-actions', 'tool-actions', 'weapon-actions']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  }
  const details = document.getElementById('resource-details');
  if (details) details.remove();
  renderConfigHud();
  if (typeof updateUI === 'function' && gameStarted) updateUI();
}

function renderConfigHud() {
  const resourcesHud = document.getElementById('resources-hud');
  if (resourcesHud) {
    const base = document.createElement('div');
    base.innerHTML = `${iconHtml('hall')} ${escapeHtml(t('hud.base'))}: <b id="base-hp-txt" style="color: #e74c3c;">100/100</b>`;
    resourcesHud.appendChild(base);

    const population = document.createElement('div');
    population.className = 'population-tile';
    population.innerHTML = `${iconHtml('worker')} ${escapeHtml(t('hud.people'))}: <b id="pop-txt" style="color: #2ecc71;">2/5</b> <span style="font-size: 0.9em; opacity: 0.85;">(${iconHtml('worker')} <b id="workers-cnt">0</b> | ${iconHtml('swords')} <b id="warriors-cnt">0</b>)</span>`;
    resourcesHud.appendChild(population);

    // resources by group (GAME_CONFIG.resourceGroups): a tile with the group's total; tapping it opens a
    // row with each resource in it, underneath the tiles
    const resourceTile = (resource, parent) => {
      const item = document.createElement('div');
      item.innerHTML = `${resource.icon ? iconHtml(resource.icon) : ''} ${escapeHtml(resource.label)}: <b id="${resourceHudId(resource.id)}">0</b>`;
      parent.appendChild(item);
    };
    const details = document.createElement('div');
    details.id = 'resource-details';
    details.className = 'resource-details';
    const grouped = new Set();
    for (const group of GAME_CONFIG.resourceGroups) {
      const members = group.members.filter(id => GAME_CONFIG.resources[id]);
      members.forEach(id => grouped.add(id));
      if (group.kinds) {
        // one resource opening onto its kinds (Food: berries, bread...)
        const resource = GAME_CONFIG.resources[members[0]];
        const tile = document.createElement('div');
        tile.className = 'resource-group';
        tile.id = `group-${group.id}`;
        tile.innerHTML = `${resource.icon ? iconHtml(resource.icon) : ''} ${escapeHtml(resource.label)}: <b id="${resourceHudId(resource.id)}">0</b> ▾`;
        resourcesHud.appendChild(tile);
        const row = document.createElement('div');
        row.className = 'resource-group-members';
        row.id = `group-${group.id}-members`;
        row.hidden = true;
        for (const kind of Object.values(GAME_CONFIG[group.kinds])) {
          const item = document.createElement('div');
          item.innerHTML = `${iconHtml(kind.icon)} ${escapeHtml(kind.label)}: <b id="food-kind-${kind.id}-txt">0</b>`;
          row.appendChild(item);
        }
        details.appendChild(row);
        tile.addEventListener('click', () => toggleResourceGroup(group.id));
        continue;
      }
      if (members.length === 1) { resourceTile(GAME_CONFIG.resources[members[0]], resourcesHud); continue; }
      if (group.held) {
        const tile = document.createElement('div');
        tile.className = 'resource-group';
        tile.id = `group-${group.id}`;
        tile.innerHTML = `${iconHtml(group.icon)} ${escapeHtml(group.label)}: <b id="group-${group.id}-txt">0</b> ▾`;
        resourcesHud.appendChild(tile);
        const row = document.createElement('div');
        row.className = 'resource-group-members';
        row.id = `group-${group.id}-members`;
        row.hidden = true;
        for (const [category, id] of getHeldItems(group)) {
          const item = GAME_CONFIG[category][id];
          const cell = document.createElement('div');
          cell.innerHTML = `${item.icon ? iconHtml(item.icon) : ''} ${escapeHtml(item.label)}: <b id="held-${category}-${id}-txt">0</b>`;
          row.appendChild(cell);
        }
        details.appendChild(row);
        tile.addEventListener('click', () => toggleResourceGroup(group.id));
        continue;
      }
      const tile = document.createElement('div');
      tile.className = 'resource-group';
      tile.id = `group-${group.id}`;
      tile.innerHTML = `${iconHtml(group.icon)} ${escapeHtml(group.label)}: <b id="group-${group.id}-txt">0</b> ▾`;
      resourcesHud.appendChild(tile);
      const row = document.createElement('div');
      row.className = 'resource-group-members';
      row.id = `group-${group.id}-members`;
      row.hidden = true;
      members.forEach(id => resourceTile(GAME_CONFIG.resources[id], row));
      details.appendChild(row);
      tile.addEventListener('click', () => toggleResourceGroup(group.id));
    }
    Object.values(GAME_CONFIG.resources).filter(r => !grouped.has(r.id)).forEach(r => resourceTile(r, resourcesHud));
    resourcesHud.after(details);
  }

  Object.values(GAME_CONFIG.buildings).forEach(item => {
    const actions = document.getElementById(`${item.tab || 'build'}-actions`);
    if (actions) actions.appendChild(createConfigButton(item, setMode));
  });

  const toolActions = document.getElementById('tool-actions');
  Object.values(GAME_CONFIG.tools).forEach(item => {
    if (toolActions) toolActions.appendChild(createConfigButton(item, assignTool));
  });

  // hire / upgrade / craft buttons in index.html get their text from the config
  const label = (id, text) => { const el = document.getElementById(id); if (el) setRichText(el, text); };
  const types = GAME_CONFIG.settlerTypes, recipes = GAME_CONFIG.recipes;
  label('btn-hire-normal', `[[${types.normal.icon}]] ${types.normal.label} (${formatCost(types.normal.hireCost)})`);
  label('btn-hire-big', `[[${types.big.icon}]] ${types.big.label} (${formatCost(types.big.hireCost)})`);
  label('btn-upgrade', t('btn.upgrade', { icon: types.big.icon, cost: formatCost(types.big.upgradeCost) }));
  label('btn-upgrade-big', t('btn.upgradeWorker', { icon: types.big.icon, cost: formatCost(types.big.upgradeCost) }));
  label('btn-craft-arrows', `[[${recipes.arrows.icon}]] ${recipes.arrows.label} (${formatCost(recipes.arrows.cost)} → ${recipes.arrows.produces.arrows})`);
  for (const item of Object.values(GAME_CONFIG.gear)) label(`btn-${item.id}`, `[[${item.icon}]] ${item.label} (${formatCost(item.cost)})`);


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

// counts that grow with the map's area (see getMapAreaScale); the rest are sizes or per-cluster counts
const AREA_SCALED_COUNTS = new Set(['trees', 'boulders', 'grass', 'berryBushes', 'sticks', 'pebbles', 'boars',
  'forests', 'boulderPiles', 'ironSpawners', 'coalSpawners']);

function getMapCount(key, fallback) {
  const count = getUnscaledMapCount(key, fallback);
  return AREA_SCALED_COUNTS.has(key) ? Math.max(count > 0 ? 1 : 0, Math.round(count * getMapAreaScale())) : count;
}

function getUnscaledMapCount(key, fallback) {
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

function getResourceIconName(resourceKey) {
  const known = GAME_CONFIG.resources[resourceKey] || GAME_CONFIG.foodKinds[resourceKey];
  return known ? known.icon : 'bundle';
}

function getResourceIcon(resourceKey) {
  const resource = GAME_CONFIG.resources[resourceKey];
  return resource ? `[[${resource.icon}]]` : resourceKey;
}

function formatCost(cost = {}) {
  return Object.entries(cost)
    .map(([key, value]) => `${value}${getResourceIcon(key)}`)
    .join(' ');
}

function canAfford(cost = {}) {
  return Object.entries(cost).every(([key, amount]) => Number(stock[key] || 0) >= Number(amount || 0));
}

// Building materials promised to blueprints and not brought to them yet (#36): builders fetch them from
// storage (see build), so another building can't count on them
function getReservedForBlueprints(id) {
  let reserved = 0;
  for (const bp of blueprints) reserved += (bp.needs && bp.needs[id]) || 0;
  for (const s of settlers) if (s.carrying && s.carrying.forBlueprint && s.carrying.type === id) reserved -= s.carrying.amount;
  return Math.max(0, reserved);
}

const getFreeStock = id => Number(stock[id] || 0) - getReservedForBlueprints(id);

function canBuild(buildingType) {
  const item = getDefinition('buildings', buildingType);
  return item ? Object.entries(item.cost || {}).every(([id, amount]) => getFreeStock(id) >= amount) : false;
}

// Damaged and ordered by the player; tents mend themselves
function needsRepair(building) {
  if (!(building.hp < building.maxHp) || building.type === 'tent') return false;
  return !!building.repairRequested;
}

// One repair step for a building: its own GAME_CONFIG.repairs entry, or a share of its build cost
function getRepairStep(building) {
  const own = GAME_CONFIG.repairs[building.type];
  if (own) return own;
  const share = GAME_CONFIG.repairs.buildings;
  const item = getDefinition('buildings', building.type) || {};
  const cost = {};
  for (const [resource, amount] of Object.entries(item.cost || {})) cost[resource] = Math.ceil(amount * share.costShare);
  return { cost, hp: building.maxHp * share.hpShare, interval: share.interval };
}

// Order (or cancel) repairs of a damaged building; tents mend themselves
function toggleBuildingRepair(building) {
  if (!(building.hp < building.maxHp) || building.type === 'tent') return false;
  building.repairRequested = !building.repairRequested;
  const item = getDefinition('buildings', building.type);
  showNotification(building.repairRequested
    ? t('repair.ordered', { name: item ? item.label : '', cost: formatCost(getRepairStep(building).cost) })
    : t('repair.cancelled'), !building.repairRequested);
  return true;
}

// Order repairs of every damaged building and the town hall
function repairAllBuildings() {
  let count = 0;
  for (const b of buildings) {
    if (b.hp < b.maxHp && b.type !== 'tent') { b.repairRequested = true; count++; }
  }
  if (townHall.hp < townHall.maxHp) { townHall.repairRequested = true; count++; }
  showNotification(count > 0 ? t('repair.allOrdered', { count }) : t('repair.nothing'), count === 0);
}

function getSmelterLimits() {
  return GAME_CONFIG.buildings.smelter.build.smelter;
}

function createBuildingBlueprint(type, x, y) {
  const item = getDefinition('buildings', type);
  const build = item && item.build ? item.build : {};
  const blueprint = { type, x, y, progress: 0, maxProgress: build.maxProgress || 40 };
  if (build.hp) blueprint.hp = build.hp, blueprint.maxHp = build.hp;
  if (build.smelter) blueprint.smeltProgress = 0;
  if (build.trap) blueprint.usesLeft = build.trap.uses;
  if (build.tower) {
    blueprint.tower = { ...build.tower };
    blueprint.arrows = 0;
    blueprint.guards = [];
  }
  return blueprint;
}

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

function createDefaultSeed() {
  const values = new Uint32Array(2);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(values);
  else {
    values[0] = Date.now() >>> 0;
    values[1] = Math.floor(Math.random() * 4294967296);
  }
  return `lima-${Date.now().toString(36)}-${values[0].toString(36)}-${values[1].toString(36)}`;
}
