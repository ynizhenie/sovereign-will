// The door of domains/colony/equipment/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { equip } from './equipment.behaviours.js';
export { assignTool, canUseShield, countHeld, craftArrows, craftRecipe, craftWeapon, disarmSettler, getHeldItems, getToolFamily, getWeaponStats, hasAxeTool, armorOf, hasGear, isArmorGear, hasPickaxeTool, hasToolFamily, giveStored, hasWorkingShield, isBowWeapon, isClubWeapon, isSpearWeapon, isSwordWeapon, makeToStore, orderGear, orderGearOff, putOnGear, refundEquipment, takeApartRecipe, takeApartStored, takeFromArmory } from './equipment.rules.js';
export { renderCraftLists, showCraftKind, updateCraftLists } from './equipment.panel.js';
export { craftItem, craftPlace, findWorkplace, orderCraft } from './equipment.crafting.js';
