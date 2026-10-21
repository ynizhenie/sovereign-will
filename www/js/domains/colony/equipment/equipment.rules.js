// Tools, weapons and gear: their families and stats, ordering and handing them out, crafting weapons and
// arrows, armour, shields, backpacks and watering cans

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { game } from '../../../engine/world/index.js';
import { addResources, canAfford, payCost, showCostError, stock } from '../storage/index.js';
import { getPlayerFaction, isForPlayerFaction } from '../../factions/index.js';
import { showNotification } from '../../../ui/index.js';
import { changeSettlerType, getPossessed, getSelectedSettler, isBigBody } from '../settlers/index.js';
import { craftPlace, orderCraft } from './equipment.crafting.js';

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
  // (#298) not over iron
  leather_armor: { canWear: s => s.armor !== 'iron', first: s => s.role === 'soldier' && !isBowWeapon(s.weapon) },
  shield: { canWear: canUseShield, first: () => true },
  wateringCan: { canWear: s => hasToolFamily(s.tool, 'hoe'), first: () => true },
  // commanders (#248): a foreman a worker, a captain a soldier (or an archer)
  whistle: { canWear: s => s.role === 'worker', first: s => s.tool === 'none' },
  banner: { canWear: s => s.role === 'soldier' || s.role === 'archer', first: s => s.role === 'soldier' },
  // (#279) a flute: anyone (a worker first: the soldiers' nights are on watch)
  flute: { canWear: () => true, first: s => s.role === 'worker' }
};

// (#298) armour, of a kind: the gear a unit's `armor` ('iron', 'leather') is, or null
export function armorOf(unit) {
  return (unit && unit.armor && Object.values(GAME_CONFIG.gear).find(g => g.armorKind === unit.armor)) || null;
}
export const isArmorGear = id => !!(GAME_CONFIG.gear[id] && GAME_CONFIG.gear[id].armorKind);

export function hasGear(s, id) {
  return isArmorGear(id) ? s.armor === GAME_CONFIG.gear[id].armorKind : !!s[id];
}

// Pay for a piece of gear and send a settler to pick it up at the town hall: the selected one if it can
// wear it, otherwise the first one the rules prefer, otherwise anyone who can
// One in the armory goes at once; otherwise it's made first (#211), then handed out. auto: nothing said;
// forSettler: who it's for, if it's still free to take it
/** @param {string} id @param {boolean} [auto] @param {any} [forSettler] */
export function orderGear(id, auto = false, forSettler = null) {
  const item = GAME_CONFIG.gear[id], rules = GEAR_RULES[id];
  const free = s => rules.canWear(s) && !hasGear(s, id) && !s.targetEquipment && game.settlers.includes(s);
  const selected = forSettler || (auto ? null : getSelectedSettler() || getPossessed());
  if (!((game.armory[`gear:${id}`] || 0) > 0)) return orderMade('gear', id, auto, selected);
  const target = (selected && free(selected) ? selected : null) ||
    game.settlers.find(s => free(s) && rules.first(s)) || game.settlers.find(free);
  if (!target) {
    if (!auto) showNotification(t('gear.nobody', { name: item.label }), true);
    return false;
  }
  takeFromArmory(`gear:${id}`);
  target.targetEquipment = { gear: id };
  if (!auto) showNotification(t('gear.fetching', { icon: item.icon, name: item.label }), false);
  return true;
}

// Not in the armory: ordered made at a workshop or the smithy (#211, #248); true if it was. Made, it waits
// in the armory to be handed out (giveStored)
function orderMade(category, id, auto, forSettler) {
  const item = GAME_CONFIG[category][id];
  const result = orderCraft(category, id);
  if (result === 'ordered') {
    const order = game.craftOrders[game.craftOrders.length - 1];
    // who it's for is picked now, and that one makes it (#232), as a button would pick one to give it to
    order.for = forSettler || pickRecipient(category, id);
    if (!auto) showNotification(t({ smithy: 'craft.atSmithy', workshop: 'craft.atWorkshop', hand: 'craft.atHall' }[craftPlace(category, id)], { name: item.label }), false);
    return true;
  }
  if (!auto) {
    if (result === 'locked') showNotification(t('cards.locked', { name: item.label }), true);
    else if (result === 'noSmithy') showNotification(t('craft.needSmithy', { name: item.label }), true);
    else if (result === 'noWorkshop') showNotification(t('craft.needWorkshop', { name: item.label }), true);
    else showCostError(item.cost || {}, t('cost.notEnough'));
  }
  return false;
}

// ---- The craft lists (#248): make one (into the armory), hand one out of it, or take a stored one apart

// Make one: the selected settler makes it, or the one a button would give it to; into the armory
export function makeToStore(category, id) {
  return orderMade(category, id, false, getSelectedSettler() || getPossessed() || null);
}

// Hand a stored one out: to the selected settler if it can take it, otherwise as the button always did
export function giveStored(category, id) {
  if (!((game.armory[`${category}:${id}`] || 0) > 0)) return false;
  if (category === 'tools') return assignTool(id);
  if (category === 'weapons') return craftWeapon(id);
  if (category === 'gear') return orderGear(id);
  return false;
}

// Take a stored one apart: what it cost back in the stock
export function takeApartStored(category, id) {
  const key = `${category}:${id}`;
  if (!takeFromArmory(key)) return false;
  addResources(GAME_CONFIG[category][id].cost || {});
  showNotification(t('craft.takenApart', { name: GAME_CONFIG[category][id].label }), false);
  return true;
}

// Who a thing ordered without a settler picked would go to: a worker with nothing for a tool, the big or an
// unarmed worker for a weapon; not one another order is already for (null: whoever's free when it's made)
function pickRecipient(category, id) {
  const promised = new Set(game.craftOrders.map(o => o.for).filter(Boolean));
  const free = s => !s.targetEquipment && !s.isPossessed && !promised.has(s);
  if (category === 'tools') {
    return game.settlers.find(s => free(s) && s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !(id === 'rod' && isBigBody(s))) ||
      game.settlers.find(s => free(s) && s.role === 'worker' && s.tool !== id && !(id === 'rod' && isBigBody(s))) || null;
  }
  if (category === 'weapons') {
    const armable = s => free(s) && !s.whistle; // (a foreman takes no weapon, #279)
    return game.settlers.find(s => armable(s) && isBigBody(s) && s.weapon === 'fist') ||
      game.settlers.find(s => armable(s) && s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist') ||
      game.settlers.find(s => armable(s) && s.weapon !== id) || null;
  }
  return null;
}


// Send the selected settler wearing it (or the first one) to the town hall to hand it back
// keep (#248): into the armory whole; otherwise taken apart
export function orderGearOff(id, keep = false) {
  const item = GAME_CONFIG.gear[id];
  const selected = getSelectedSettler() || getPossessed();
  const target = selected && hasGear(selected, id) && !selected.targetEquipment
    ? selected
    : game.settlers.find(s => hasGear(s, id) && !s.targetEquipment);
  if (!target) {
    showNotification(t('gear.noneHas', { name: item.label }), true);
    return;
  }
  target.targetEquipment = { gearOff: id, keep };
  showNotification(t('gear.returning', { icon: item.icon, name: item.label }), false);
}

// At the town hall (see equip()): put a piece on, or take it off and put its cost back in the stock
export function putOnGear(s, id) {
  if (isArmorGear(id)) {
    const old = armorOf(s);
    if (old) takeOffGear(s, old.id, true); // (the other kind off first, into the armory)
    const def = GAME_CONFIG.gear[id];
    s.armor = def.armorKind;
    s.maxHp = (s.maxHp || 100) + def.hpBonus;
    s.hp += def.hpBonus;
  } else {
    s[id] = true;
  }
}

// keep (#248): whole into the armory; otherwise taken apart, its cost back in the stock
export function takeOffGear(s, id, keep = false) {
  if (!hasGear(s, id)) return;
  if (isArmorGear(id)) {
    s.armor = null;
    s.maxHp -= GAME_CONFIG.gear[id].hpBonus;
    s.hp = Math.min(s.hp, s.maxHp);
  } else {
    s[id] = false;
  }
  if (keep) game.armory[`gear:${id}`] = (game.armory[`gear:${id}`] || 0) + 1;
  else addResources(GAME_CONFIG.gear[id].cost);
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

// A settler's weapon stats for `use` ('combat' or 'hunt': the same numbers, a boar takes twice the damage
// in woundBoar, #232; a hunt's range is the weapon's reach, a bow's its shooting distance). Damage: the
// weapon's, or, for fists, the carried tool's, else bare hands; times the settler type's multiplier.
export function getWeaponStats(s, use) {
  const fist = GAME_CONFIG.weapons.fist;
  const weapon = getDefinition('weapons', s.weapon) || fist;
  const stats = use === 'hunt' ? { ...weapon.combat, range: weapon.combat.range || weapon.combat.approach } : weapon.combat;
  let damage = s.weapon !== 'fist' ? stats.damage : undefined;
  if (damage === undefined) {
    const tool = getDefinition('tools', s.tool);
    damage = tool && tool.combatDamage !== undefined && tool.combatDamage !== null ? tool.combatDamage : fist.combat.damage;
  }
  const settlerType = GAME_CONFIG.settlerTypes[s.type];
  // trained at a dummy (#199): a little more in a fight
  const trained = use === 'combat' ? 1 + (s.trained || 0) : 1;
  // the undead fight on in a panic, weaker (#232; the others run, hitting back at full strength if cornered)
  const shaken = s.panic && getPlayerFaction().id === 'undead' && game.settlers.includes(s) ? GAME_CONFIG.morale.panicDamage : 1;
  return { ...stats, damage, multiplier: (settlerType ? settlerType.damageMultiplier : 1) * trained * shaken };
}

/** What comes off goes back: the weapon and the tool (only those that come off: #261, taking the tool off
 * paid the weapon back too), armour and quiver if asked. keep (#248): a weapon, tool or armour whole into the
 * armory; otherwise taken apart, its cost back in the stock
 * @param {any} settler
 * @param {{ weapon?: boolean, tool?: boolean, armor?: boolean, quiver?: boolean, keep?: boolean }} [what] */
export function refundEquipment(settler, { weapon = true, tool = true, armor = false, quiver = false, keep = false } = {}) {
  // a medic's herbs go back with the bag
  if (tool && settler.bagHerbs > 0) { stock.herbs += settler.bagHerbs; settler.bagHerbs = 0; }
  for (const [category, id, off] of [['weapons', settler.weapon, weapon], ['tools', settler.tool, tool]]) {
    const item = off && getDefinition(category, id);
    if (!item || !item.cost || !Object.keys(item.cost).length) continue; // (a fist, no tool)
    if (keep) game.armory[`${category}:${id}`] = (game.armory[`${category}:${id}`] || 0) + 1;
    else addResources(item.cost);
  }
  if (armor && armorOf(settler)) takeOffGear(settler, armorOf(settler).id, keep);
  if (quiver && settler.quiver) {
    stock.leather += 5;
    stock.arrows += settler.arrows || 0;
  }
}

// auto (a thing just made, #211): only a worker with no tool, nothing said; true if it was given. A tool in the armory
// goes first, else it's paid for
/** @param {string} toolType @param {boolean} [auto] @param {any} [forSettler] */
export function assignTool(toolType, auto = false, forSettler = null) {
  const item = getDefinition('tools', toolType);
  if (!item) {
    if (!auto) showNotification(t('tool.unknown', { id: toolType }), true);
    return false;
  }

  // none in the armory: made first (#211)
  if (!((game.armory[`tools:${toolType}`] || 0) > 0)) return orderMade('tools', toolType, auto, forSettler || (auto ? null : getSelectedSettler() || getPossessed()));

  let target = forSettler && game.settlers.includes(forSettler) && !forSettler.targetEquipment ? forSettler : auto ? null : getSelectedSettler() || getPossessed();

  if (target) {
    // (the one it's for)
  } else if (auto) {
    target = game.settlers.find(s => s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.targetEquipment && !s.isPossessed &&
      !(toolType === 'rod' && isBigBody(s))) || null;
  } else if (!target) {
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
    if (!auto) showNotification(t('tool.nobody'), true);
    return false;
  }

  takeFromArmory(`tools:${toolType}`);
  target.targetEquipment = { weapon: 'fist', tool: toolType, role: 'worker' };
  if (!auto) showNotification(t('tool.given', { name: item.label }), false);
  return true;
}

// auto (a thing just made, #211): only an unarmed settler with no tool, nothing said; true if it was made. A weapon in
// the armory goes first, else it's paid for
/** @param {string} type @param {boolean} [auto] @param {any} [forSettler] */
export function craftWeapon(type, auto = false, forSettler = null) {
  const item = getDefinition('weapons', type);
  if (!item) {
    if (!auto) showNotification(t('weapon.unknown', { id: type }), true);
    return false;
  }

  // none in the armory: made first (#211)
  if (!((game.armory[`weapons:${type}`] || 0) > 0)) return orderMade('weapons', type, auto, forSettler || (auto ? null : getSelectedSettler() || getPossessed()));

  let target = forSettler && game.settlers.includes(forSettler) && !forSettler.targetEquipment ? forSettler : auto ? null : getSelectedSettler() || getPossessed();

  if (target) {
    // (the one it's for)
  } else if (auto) {
    target = game.settlers.find(s => !s.whistle && isBigBody(s) && s.weapon === 'fist' && s.tool === 'none' && !s.targetEquipment && !s.isPossessed) ||
             game.settlers.find(s => !s.whistle && s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.targetEquipment && !s.isPossessed) || null;
  } else if (!target) {
    target = game.settlers.find(s => !s.whistle && isBigBody(s) && s.weapon === 'fist' && !s.targetEquipment) ||
             game.settlers.find(s => !s.whistle && s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist' && !s.targetEquipment) ||
             game.settlers.find(s => !s.whistle && s.weapon !== type && !s.targetEquipment);
  }
  if (target && target.whistle) { if (!auto) showNotification(t('weapon.foreman'), true); return false; } // (#279)

  if (!target) {
    if (!auto) showNotification(t('weapon.nobody'), true);
    return false;
  }

  takeFromArmory(`weapons:${type}`);
  target.targetEquipment = { weapon: type, tool: 'none', role: type === 'bow' ? 'archer' : 'soldier' };
  if (type === 'bow') {
    target.targetEquipment.quiver = true;
    target.targetEquipment.quiverOnly = true;
  }
  if (!auto) showNotification(t('weapon.made', { name: item.label }), false);
  return true;
}

// One from the armory (#210), if it has one: true
export function takeFromArmory(key) {
  if (!((game.armory[key] || 0) > 0)) return false;
  game.armory[key]--;
  return true;
}

// A recipe makes something for the stock, not conjured (#249): paid for at once, then `batches` jobs of
// produces/batches each where it's made (craftPlace); arrows by the archers (anyone free while there are
// none)
export function craftRecipe(id) {
  const recipe = GAME_CONFIG.recipes[id];
  const result = orderCraft('recipes', id);
  if (result === 'locked') { showNotification(t('cards.locked', { name: recipe.label }), true); return; } // (#306)
  if (result === 'noSmithy' || result === 'noWorkshop') { showNotification(t(result === 'noSmithy' ? 'craft.needSmithy' : 'craft.needWorkshop', { name: recipe.label }), true); return; }
  if (result !== 'ordered') { showCostError(recipe.cost, t('cost.needs', { name: recipe.label })); return; }
  const batches = recipe.batches || 1;
  const yields = Object.fromEntries(Object.entries(recipe.produces).map(([res, n]) => [res, n / batches]));
  game.craftOrders[game.craftOrders.length - 1].yields = yields;
  game.craftOrders[game.craftOrders.length - 1].for = null;
  for (let i = 1; i < batches; i++) {
    game.craftOrders.push({ key: `recipes:${id}`, category: 'recipes', id, crafter: null, stage: 'fetch', progress: 0, for: null, yields });
  }
  showNotification(id === 'arrows' ? t('arrows.ordered', { count: recipe.produces.arrows }) : t(`craft.at${{ hand: 'Hall', workshop: 'Workshop', smithy: 'Smithy' }[craftPlace('recipes', id)]}`, { name: recipe.label }), false);
}

export function craftArrows() { craftRecipe('arrows'); }

// keep (#248): what comes off goes into the armory whole; otherwise it's taken apart
export function disarmSettler(type = 'all', keep = false) {
  let target = getSelectedSettler() || getPossessed();

  const hasTargetItem = (s) => {
    if (type === 'tool') return s.tool && s.tool !== 'none';
    if (type === 'weapon') return (s.weapon && s.weapon !== 'fist') || s.role !== 'worker';
    return (s.tool !== 'none' || s.weapon !== 'fist' || s.role !== 'worker');
  };

  if (target && !hasTargetItem(target)) {
    target = undefined;
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
      quiver: isDisarmingWeapon ? false : (target.quiver || false),
      keep
    };

    const notificationText = t(type === 'tool' ? 'disarm.tool' : type === 'weapon' ? 'disarm.weapon' : 'disarm.item');
    showNotification(notificationText, false);
  } else {
    const errorText = t(type === 'tool' ? 'disarm.noTool' : type === 'weapon' ? 'disarm.noWeapon' : 'disarm.noItem');
    showNotification(errorText, true);
  }
}

// Given a bow (or having it taken), a kind that has a bow form turns into it (and back): the
// faction's bowUnits (none now: a zombie or an imp with a bow stays one, #249)
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
  return items.filter(([category, id]) => isForPlayerFaction(GAME_CONFIG[category][id])); // the faction's own (#200)
}

// How many settlers hold that tool, weapon or piece of gear
export function countHeld(category, id) {
  if (category === 'tools') return game.settlers.filter(s => s.tool === id).length;
  if (category === 'weapons') return game.settlers.filter(s => s.weapon === id).length;
  return game.settlers.filter(s => hasGear(s, id)).length;
}
