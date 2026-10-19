// The door of domains/conflict/combat/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { clearEnemyTents, escortGatherers, fightEnemies, holdPost, joinsTentAssault, restockQuiver, strikeBack } from './combat.behaviours.js';
export { clearOrders, fightByOrders, orderTap } from './combat.orders.js';
export { drawBloodOnGround, drawBodyBlood, drawBurning, drawCorpses, drawProjectiles, drawTargetMark, drawWeaponBlood } from './combat.draw.js';
export { addCorpse, ageBloodAndDung, applySpikeTraps, bleed, damageEnemy, getBaseRadius, hasLineOfFire, isDefenseAlert, isInSafeArea, performAttack, tickProjectiles, trackAllFootprints, updateBurning, updateCorpses } from './combat.rules.js';
