// The door of domains/colony/settlers/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { playerControlled, tickSettlers } from './settlers.behaviours.js';
export { applyBackPose, applyHeldItemPose, backBehind, bowDraw, drawArmor, drawDung, drawFigure, drawFigureShadows, drawHandTorch, drawSideTorch, drawHealSparks, drawLevelIndicator, drawOrderBubble, drawQuiver, drawSelectedPaths, drawSettlerShadows, drawSettlers, drawShield, drawSleepZs, facesAway, faceTowards, handSide, heldBehind, humanPunch, itemScale, simpleUnit, SKIN, startSwing, tickAnimation, tinyUnit, torchAtSide, unitKin, zombieReach } from './settlers.draw.js';
export { drawUnitPicture, facingStep, POSES_PER_SECOND, unitPictures, unitPictureTotals } from './settlers.pictures.js';
export { orderPossessed } from './settlers.orders.js';
export { getHungerSeconds, isPossessionCameraFollowing, renderRecruitRow, renderSettlerInfo, updatePossessionView } from './settlers.panel.js';
export { changeSettlerType, createSettler, damageSettler, deselectSettler, dismissSettler, dropSettlerLoot, getCurrentPop, getMaxPop, getPossessed, getRecentAttacker, getRetaliationTarget, getSelectedSettler, getSelection, getUpgrade, isBigBody, isPet, isUntouchable, newPetLook, petKindOf, removeDeadSettlers, selectAllSoldiers, spawnSettler, switchPossession, tickMeals, toggleInGroup, unpossess, upgradeRank, upgradeToBig } from './settlers.rules.js';
export { fetchNightTorch, lightTorches, needsTorches, nightReach, onFuelDuty, onWatch, sleepAtNight, tickNight } from './settlers.night.js';
export { drawAllSpeech, drawSpeech, noteDay, says, someoneSays, speak, tauntOnSight, tickVoices } from './settlers.voices.js';
export { hasPlayerOrderFor } from './settlers.corpses.js';
export { roleTitle } from './settlers.commanders.js';
export { drawHeldTool, drawHeldWeapon, drawWorkTool } from './settlers.items.js';
export { drawHair, lookOf, newLook } from './settlers.looks.js';
export { ensureUnitName, generateUnitName } from './settlers.names.js';
export { addUnitExperience, copyUnitProgression, getUnitAttackSpeedMultiplier, getUnitDisplayProgressionTrack, getUnitExperience, getUnitExperienceForLevel, getUnitHealthBonus, getUnitHealingSpeedMultiplier, getUnitHuntingDamageMultiplier, getUnitLevel, getUnitLevelForTrack, getUnitProgressionTrack, getUnitWeaponProgressionTrack, getUnitWorkSpeedMultiplier, hasUnitProgression, setUnitExperience, UNIT_PROGRESSION_TRACKS } from './settlers.progression.js';
