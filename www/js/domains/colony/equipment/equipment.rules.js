// Tools, weapons and gear: their families and stats, ordering and handing them out, crafting weapons and
// arrows, armour, shields, backpacks and watering cans

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/i18n.js';
import { game } from '../../../engine/world/state.js';
import { addResources, canAfford, payCost, showCostError, stock } from '../storage/storage.rules.js';
import { getPlayerFaction } from '../../factions/factions.rules.js';
import { showNotification } from '../../../ui/toasts.js';
import { changeSettlerType, getPossessed, getSelectedSettler, isBigBody } from '../settlers/settlers.rules.js';

// A shield only helps a melee soldier: a worker or an archer doesn't fight with it
export function canUseShield(s) {
  return s.role === 'soldier' && !isBowWeapon(s.weapon);
}

export function hasWorkingShield(s) {
  return !!s.shield && canUseShield(s);
}

// ---- Gear (GAME_CONFIG.gear): ordered with its button, put on / taken off at the town hall

// Who can wear each piece, and who gets it first when nobody who can is selected
export const GEAR_RULES = {
  backpack: { canWear: s => s.role !== 'archer', first: s => s.role === 'worker' && s.tool !== 'rod' },
  armor: { canWear: () => true, first: s => s.role === 'soldier' && !isBowWeapon(s.weapon) },
  shield: { canWear: canUseShield, first: () => true },
  wateringCan: { canWear: s => hasToolFamily(s.tool, 'hoe'), first: () => true }
};

export function hasGear(s, id) {
  return id === 'armor' ? s.armor === 'iron' : !!s[id];
}

// Pay for a piece of gear and send a settler to pick it up at the town hall: the selected one if it can
// wear it, otherwise the first one the rules prefer, otherwise anyone who can
export function orderGear(id) {
  const item = GAME_CONFIG.gear[id], rules = GEAR_RULES[id];
  const free = s => rules.canWear(s) && !hasGear(s, id) && !s.targetEquipment;
  const selected = getSelectedSettler() || getPossessed();
  const target = (selected && free(selected) ? selected : null) ||
    game.settlers.find(s => free(s) && rules.first(s)) || game.settlers.find(free);
  if (!target) {
    showNotification(t('gear.nobody', { name: item.label }), true);
    return;
  }
  if (!canAfford(item.cost)) {
    showCostError(item.cost, t('cost.notEnough'));
    return;
  }
  payCost(item.cost);
  target.targetEquipment = { gear: id };
  showNotification(t('gear.fetching', { icon: item.icon, name: item.label }), false);
}

// Send the selected settler wearing it (or the first one) to the town hall to hand it back
export function orderGearOff(id) {
  const item = GAME_CONFIG.gear[id];
  const selected = getSelectedSettler() || getPossessed();
  const target = selected && hasGear(selected, id) && !selected.targetEquipment
    ? selected
    : game.settlers.find(s => hasGear(s, id) && !s.targetEquipment);
  if (!target) {
    showNotification(t('gear.noneHas', { name: item.label }), true);
    return;
  }
  target.targetEquipment = { gearOff: id };
  showNotification(t('gear.returning', { icon: item.icon, name: item.label }), false);
}

// At the town hall (see equip()): put a piece on, or take it off and put its cost back in the stock
export function putOnGear(s, id) {
  if (id === 'armor') {
    s.armor = 'iron';
    const bonus = GAME_CONFIG.gear.armor.hpBonus;
    s.maxHp = (s.maxHp || 100) + bonus;
    s.hp += bonus;
  } else {
    s[id] = true;
  }
}

export function takeOffGear(s, id) {
  if (!hasGear(s, id)) return;
  if (id === 'armor') {
    s.armor = null;
    s.maxHp -= GAME_CONFIG.gear.armor.hpBonus;
    s.hp = Math.min(s.hp, s.maxHp);
  } else {
    s[id] = false;
  }
  addResources(GAME_CONFIG.gear[id].cost);
}

// weapon / tool families, from GAME_CONFIG
export function getToolFamily(tool) { const def = getDefinition('tools', tool); return def ? def.family : null; }

export function getWeaponFamily(weapon) { const def = getDefinition('weapons', weapon); return def ? def.family : null; }

export function hasAxeTool(tool) { return getToolFamily(tool) === 'axe'; }

export function hasPickaxeTool(tool) { return getToolFamily(tool) === 'pickaxe'; }

export function isClubWeapon(weapon) { return getWeaponFamily(weapon) === 'club'; }

export function isSwordWeapon(weapon) { return getWeaponFamily(weapon) === 'sword'; }

export function isSpearWeapon(weapon) { return getWeaponFamily(weapon) === 'spear'; }

export function isBowWeapon(weapon) { return getWeaponFamily(weapon) === 'bow'; }

// A settler's weapon stats for `use` ('combat' or 'hunt'). Damage: the weapon's, or, for fists (and weapons
// with no damage for that use), the carried tool's, else bare hands; times the settler type's multiplier.
export function getWeaponStats(s, use) {
  const fist = GAME_CONFIG.weapons.fist;
  const weapon = getDefinition('weapons', s.weapon) || fist;
  const stats = weapon[use];
  let damage = s.weapon !== 'fist' ? stats.damage : undefined;
  if (damage === undefined) {
    const tool = getDefinition('tools', s.tool);
    const toolDamage = tool && (use === 'combat' ? tool.combatDamage : tool.huntDamage);
    damage = toolDamage !== undefined && toolDamage !== null ? toolDamage : fist[use].damage;
  }
  const settlerType = GAME_CONFIG.settlerTypes[s.type];
  return { ...stats, damage, multiplier: settlerType ? settlerType.damageMultiplier : 1 };
}

export function refundEquipment(settler, includeArmor = false, includeQuiver = false) {
  // a medic's herbs go back with the bag
  if (settler.bagHerbs > 0) { stock.herbs += settler.bagHerbs; settler.bagHerbs = 0; }
  // refund exactly what the item cost, as defined in GAME_CONFIG
  for (const item of [getDefinition('weapons', settler.weapon), getDefinition('tools', settler.tool)]) {
    addResources((item && item.cost) || {});
  }

  if (includeArmor && settler.armor === 'iron') takeOffGear(settler, 'armor');
  if (includeQuiver && settler.quiver) {
    stock.leather += 5;
    stock.arrows += settler.arrows || 0;
  }
}

export function assignTool(toolType) {
  const item = getDefinition('tools', toolType);
  if (!item) {
    showNotification(t('tool.unknown', { id: toolType }), true);
    return;
  }

  const cost = item.cost || {};
  if (!canAfford(cost)) {
    showCostError(cost, t('cost.notEnough'));
    return;
  }

  let target = getSelectedSettler() || getPossessed();

  if (!target) {
    if (toolType === 'rod') {
      target = game.settlers.find(s => !isBigBody(s) && s.role === 'worker' && s.tool === 'none' && !s.targetEquipment) ||
               game.settlers.find(s => !isBigBody(s) && s.role === 'worker' && s.tool !== toolType && !s.targetEquipment);
    } else {
      target = game.settlers.find(s => !isBigBody(s) && s.role === 'worker' && s.tool === 'none' && !s.targetEquipment) ||
               game.settlers.find(s => s.role === 'worker' && s.tool === 'none' && !s.targetEquipment) || 
               game.settlers.find(s => s.role === 'worker' && s.tool !== toolType && !s.targetEquipment);
    }
  }

  if (!target) {
    showNotification(t('tool.nobody'), true);
    return;
  }

  payCost(cost);
  target.targetEquipment = { weapon: 'fist', tool: toolType, role: 'worker' };
  showNotification(t('tool.given', { name: item.label }), false);
}

export function craftWeapon(type) {
  const item = getDefinition('weapons', type);
  if (!item) {
    showNotification(t('weapon.unknown', { id: type }), true);
    return;
  }

  const cost = item.cost || {};
  if (!canAfford(cost)) {
    showCostError(cost, t('cost.notEnough'));
    return;
  }

  let target = getSelectedSettler() || getPossessed();

  if (!target) {
    target = game.settlers.find(s => isBigBody(s) && s.weapon === 'fist' && !s.targetEquipment) ||
             game.settlers.find(s => s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.targetEquipment) ||
             game.settlers.find(s => s.weapon !== type && !s.targetEquipment);
  }

  if (!target) {
    showNotification(t('weapon.nobody'), true);
    return;
  }

  payCost(cost);
  target.targetEquipment = { weapon: type, tool: 'none', role: type === 'bow' ? 'archer' : 'soldier' };
  if (type === 'bow') {
    target.targetEquipment.quiver = true;
    target.targetEquipment.quiverOnly = true;
  }
  showNotification(t('weapon.made', { name: item.label }), false);
}

export function craftArrows() {
  let target = getSelectedSettler() || getPossessed();
  if (!target) target = game.settlers.find(s => s.weapon === 'bow' && s.quiver);
  if (!target || target.weapon !== 'bow' || !target.quiver) {
    showNotification(t('arrows.needArcher'), true);
    return;
  }
  const recipe = GAME_CONFIG.recipes.arrows;
  if (!canAfford(recipe.cost)) {
    showCostError(recipe.cost, t('cost.needs', { name: recipe.label }));
    return;
  }

  payCost(recipe.cost);
  addResources(recipe.produces);
  showNotification(t('arrows.made', { count: recipe.produces.arrows }), false);
}

export function disarmSettler(type = 'all') {
  let target = getSelectedSettler() || getPossessed();

  const hasTargetItem = (s) => {
    if (type === 'tool') return s.tool && s.tool !== 'none';
    if (type === 'weapon') return (s.weapon && s.weapon !== 'fist') || s.role !== 'worker';
    return (s.tool !== 'none' || s.weapon !== 'fist' || s.role !== 'worker');
  };

  if (target && !hasTargetItem(target)) {
    target = null;
  }

  if (!target) {
    target = game.settlers.find(s => hasTargetItem(s) && !s.targetEquipment);
  }

  if (target) {
    const isDisarmingWeapon = type === 'weapon' || type === 'all';
    const isDisarmingTool = type === 'tool' || type === 'all';

    target.targetEquipment = {
      weapon: isDisarmingWeapon ? 'fist' : (target.weapon || 'fist'),
      tool: isDisarmingTool ? 'none' : (target.tool || 'none'),
      role: isDisarmingWeapon ? 'worker' : (target.role || 'worker'),
      armor: target.armor || 'none', // armour has its own button now (orderGearOff)
      quiver: isDisarmingWeapon ? false : (target.quiver || false)
    };

    const notificationText = t(type === 'tool' ? 'disarm.tool' : type === 'weapon' ? 'disarm.weapon' : 'disarm.item');
    showNotification(notificationText, false);
  } else {
    const errorText = t(type === 'tool' ? 'disarm.noTool' : type === 'weapon' ? 'disarm.noWeapon' : 'disarm.noItem');
    showNotification(errorText, true);
  }
}

// Given a bow (or having it taken), a kind that has a bow form turns into it (and back): the undead's
// zombie into a skeleton, the demons' imp into a fire imp (#164, #165)
export function applyBowUnit(s) {
  const forms = getPlayerFaction().bowUnits || {};
  if (isBowWeapon(s.weapon) && forms[s.type]) changeSettlerType(s, forms[s.type]);
  const base = Object.keys(forms).find(k => forms[k] === s.type);
  if (!isBowWeapon(s.weapon) && base) changeSettlerType(s, base);
}

// Whether the tool belongs to that family (GAME_CONFIG.tools.*.family: axe, pickaxe, rod, hoe)
export function hasToolFamily(tool, family) {
  return getToolFamily(tool) === family;
}

// The [category, id] pairs a `held` HUD group counts (see GAME_CONFIG.resourceGroups)
export function getHeldItems(group) {
  const items = [];
  for (const [category, ids] of Object.entries(group.held)) {
    const all = Object.keys(GAME_CONFIG[category]).filter(id => id !== 'fist');
    for (const id of ids === 'all' ? all : ids) items.push([category, id]);
  }
  return items;
}

// How many settlers hold that tool, weapon or piece of gear
export function countHeld(category, id) {
  if (category === 'tools') return game.settlers.filter(s => s.tool === id).length;
  if (category === 'weapons') return game.settlers.filter(s => s.weapon === id).length;
  return game.settlers.filter(s => hasGear(s, id)).length;
}
