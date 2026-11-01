// The door of domains/colony/settlers/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { playerControlled, tickSettlers } from './settlers.behaviours.js';
export { applyHeldItemPose, backBehind, bowDraw, drawArmor, drawDung, drawFigure, drawHandTorch, drawHealSparks, drawOrderBubble, drawQuiver, drawSelectedPaths, drawSettlers, drawShield, facesAway, faceTowards, handSide, heldBehind, humanPunch, itemScale, simpleUnit, SKIN, startSwing, tickAnimation, tinyUnit, unitKin, zombieReach } from './settlers.draw.js';
export { orderPossessed } from './settlers.orders.js';
export { getHungerSeconds, renderRecruitRow, renderSettlerInfo, updatePossessionView, updateUnitCounts } from './settlers.panel.js';
export { changeSettlerType, createSettler, damageSettler, deselectSettler, dismissSettler, dropSettlerLoot, getCurrentPop, getMaxPop, getPossessed, getRecentAttacker, getSelectedSettler, getSelection, getUpgrade, isBigBody, isPet, isUntouchable, newPetLook, petKindOf, removeDeadSettlers, selectAllSoldiers, spawnSettler, switchPossession, tickMeals, toggleInGroup, unpossess, upgradeRank, upgradeToBig } from './settlers.rules.js';
export { fetchNightTorch, lightTorches, needsTorches, nightReach, onFuelDuty, onWatch, sleepAtNight, tickNight } from './settlers.night.js';
export { drawAllSpeech, drawSpeech, noteDay, says, someoneSays, speak, tickVoices } from './settlers.voices.js';
export { hasPlayerOrderFor } from './settlers.corpses.js';
export { roleTitle } from './settlers.commanders.js';
export { drawHeldTool, drawHeldWeapon, drawWorkTool } from './settlers.items.js';
export { drawHair, lookOf, newLook } from './settlers.looks.js';
export { ensureUnitName, generateUnitName } from './settlers.names.js';
