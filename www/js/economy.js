function resourceHudId(resourceKey) {
  return `resource-${resourceKey}-txt`;
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
  for (const id of ['resources-hud', 'build-actions', 'farming-actions', 'tool-actions', 'weapon-actions', 'recruit-row']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  }
  const details = document.getElementById('resource-details');
  if (details) details.remove();
  renderConfigHud();
  if (typeof updateUI === 'function' && gameStarted) { updateUI(); refreshAffordability(true); }
}

let renderedFaction = null; // whose units and buildings the HUD shows (#43)

function renderConfigHud() {
  // only what the player's faction has (#43): its resources, buildings, units to hire and upgrade
  renderedFaction = sides.player.faction;
  const ours = item => !item.factions || item.factions.includes(sides.player.faction);
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
      if (!ours(group)) continue; // the undead have no food groups (#164), nor its resources' tiles
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
    Object.values(GAME_CONFIG.resources).filter(r => !grouped.has(r.id) && ours(r)).forEach(r => resourceTile(r, resourcesHud));
    resourcesHud.after(details);
  }

  // the Building tab in sections (#181), the Farming tab as it is
  const buildSections = {};
  const sectionFor = group => {
    if (buildSections[group]) return buildSections[group];
    const section = document.createElement('div');
    section.className = 'panel-section';
    section.innerHTML = `<div class="panel-heading">${escapeHtml(t(`panel.${group}`))}</div><div class="btn-grid-2col"></div>`;
    document.getElementById('build-actions').appendChild(section);
    return (buildSections[group] = section.lastChild);
  };
  for (const group of ['defense', 'homes', 'economy']) sectionFor(group);
  Object.values(GAME_CONFIG.buildings).filter(ours).forEach(item => {
    const actions = item.tab ? document.getElementById(`${item.tab}-actions`) : sectionFor(item.group || 'economy');
    if (actions) actions.appendChild(createConfigButton(item, setMode));
  });
  for (const section of Object.values(buildSections)) section.parentNode.hidden = section.children.length === 0;

  const toolActions = document.getElementById('tool-actions');
  Object.values(GAME_CONFIG.tools).filter(ours).forEach(item => {
    if (toolActions) toolActions.appendChild(createConfigButton(item, assignTool));
  });

  const recruit = document.getElementById('recruit-row');
  for (const type of getPlayerFaction().units) {
    const unit = GAME_CONFIG.settlerTypes[type];
    const button = document.createElement('button');
    button.className = 'btn';
    button.id = `btn-hire-${type}`;
    setRichText(button, `[[${unit.icon}]] ${unit.label} (${formatCost(unit.hireCost)})`);
    onTap(button, () => spawnSettler(type));
    recruit.appendChild(button);
  }
  // craft / gear buttons in index.html get their text from the config
  const label = (id, text) => { const el = document.getElementById(id); if (el) setRichText(el, text); };
  const recipes = GAME_CONFIG.recipes;
  const upgrade = getUpgrade();
  if (upgrade) {
    const button = document.createElement('button');
    button.className = 'btn btn-armor';
    button.id = 'btn-upgrade';
    setRichText(button, t('btn.upgrade', { icon: upgrade.big.icon, cost: formatCost(upgrade.big.upgradeCost) }));
    onTap(button, () => upgradeToBig());
    recruit.appendChild(button);
    label('btn-upgrade-big', t('btn.upgradeWorker', { icon: upgrade.big.icon, cost: formatCost(upgrade.big.upgradeCost) }));
  }
  label('btn-craft-arrows', `[[${recipes.arrows.icon}]] ${recipes.arrows.label} (${formatCost(recipes.arrows.cost)} → ${recipes.arrows.produces.arrows})`);
  for (const item of Object.values(GAME_CONFIG.gear)) {
    label(`btn-${item.id}`, `[[${item.icon}]] ${item.label} (${formatCost(item.cost)})`);
    const button = document.getElementById(`btn-${item.id}`);
    if (button) button.hidden = !ours(item);
  }
  // the undead blight the ground instead of farming (#164)
  document.getElementById('tab-btn-farming').hidden = sides.player.faction === 'undead';
  document.getElementById('tab-btn-blight').hidden = sides.player.faction !== 'undead';

  const weaponActions = document.getElementById('weapon-actions');
  Object.values(GAME_CONFIG.weapons).forEach(item => {
    if (item.id !== 'fist' && !item.hidden && weaponActions) {
      weaponActions.appendChild(createConfigButton(item, craftWeapon));
    }
  });
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

// Building materials promised to blueprints and not brought to them yet (#36): builders fetch them from
// storage (see build), so another building can't count on them
function getReservedForBlueprints(id) {
  let reserved = 0;
  for (const bp of blueprints) reserved += (bp.needs && bp.needs[id]) || 0;
  for (const s of settlers) if (s.carrying && s.carrying.forBlueprint && s.carrying.type === id) reserved -= s.carrying.amount;
  return Math.max(0, reserved);
}

function canBuild(buildingType) {
  const item = getDefinition('buildings', buildingType);
  return item ? Object.entries(item.cost || {}).every(([id, amount]) => getFreeStock(id) >= amount) : false;
}

// Damaged and ordered by the player; tents mend themselves
function needsRepair(building) {
  if (!(building.hp < building.maxHp) || isShelter(building)) return false;
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
  if (!(building.hp < building.maxHp) || isShelter(building)) return false;
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
    if (b.hp < b.maxHp && !isShelter(b)) { b.repairRequested = true; count++; }
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
