// The door of domains/colony/equipment/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { equip } from './equipment.behaviours.js';
export { assignTool, canUseShield, countHeld, countWithPending, craftArrows, craftWeapon, disarmSettler, getHeldItems, getWeaponStats, hasAxeTool, hasGear, hasPickaxeTool, hasToolFamily, hasWorkingShield, isBowWeapon, isClubWeapon, isSpearWeapon, isSwordWeapon, orderGear, orderGearOff, putOnGear, refundEquipment, takeFromArmory, tickQuotas } from './equipment.rules.js';
export { renderGearLabels, renderQuotas, renderToolsTab, renderWeaponsTab } from './equipment.panel.js';
export { craftItem, craftPlace, findWorkplace, orderCraft, pendingCrafts } from './equipment.crafting.js';
