// Settlers: making one, hiring and upgrading, population, kinds, getting hurt, meals, and which one the
// player has selected or possesses

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { game, rand, townHall } from '../../../engine/world/index.js';
import { hasWorkingShield, refundEquipment } from '../equipment/index.js';
import { canAfford, payCost, showCostError, stock } from '../storage/index.js';
import { getPlayerFaction, isForPlayerFaction } from '../../factions/index.js';
import { showNotification } from '../../../ui/index.js';
import { addCorpse, bleed } from '../../conflict/combat/index.js';
import { isDefeated } from '../../../modes/endless/index.js';
import { battle } from '../../../modes/battle/index.js';
import { playSound } from '../../../app/index.js';
import { onUnitDeath, shakeOnHit } from '../../conflict/morale/index.js';

// The start's limit, plus what each tent (or grave) adds
export function getMaxPop() {
  return game.buildings.reduce((sum, b) => sum + ((getDefinition('buildings', b.type) || {}).population || 0), GAME_CONFIG.start.population);
}

// Too many settlers: the hint names the player's own home (a tent, a grave, a sacrificial circle) (#200)
function showPopLimit() {
  const home = Object.values(GAME_CONFIG.buildings).find(b => b.population && isForPlayerFaction(b));
  showNotification(home ? t('pop.limit', { name: getDefinition('buildings', home.id).label, icon: home.icon }) : t('pop.limitNoHome'), true);
}

// Raised zombies don't count: they're temporary
export function getCurrentPop() {
  return game.settlers.reduce((sum, s) => sum + (s.temporary ? 0 : GAME_CONFIG.settlerTypes[s.type].population), 0);
}

// A big body: a giant or a big zombie (settlerTypes with big), or a big enemy
export function isBigBody(unit) {
  return unit.type === 'big' || !!(getDefinition('settlerTypes', unit.type) || {}).big;
}

// A settler turns into another kind of its faction (a zombie given a bow into a skeleton), keeping
// its share of hp, its armour and everything it holds
export function changeSettlerType(s, type) {
  const t = GAME_CONFIG.settlerTypes[type];
  if (!t || s.type === type) return;
  const share = s.hp / s.maxHp;
  const bonus = s.armor === 'iron' ? GAME_CONFIG.gear.armor.hpBonus : 0;
  Object.assign(s, { type, speed: t.speed, radius: t.radius, visualRadius: t.visualRadius, maxHp: t.hp + bonus });
  s.hp = s.maxHp * share;
}

// A new settler of a GAME_CONFIG.settlerTypes kind, unarmed, as a worker; an archer kind (skeletons)
// comes with its bow and a full quiver, a necromancer with its raises
/** @returns {import('../../../engine/world/types.js').Settler} */
export function createSettler(typeKey, id, x, y, extra = {}) {
  const t = GAME_CONFIG.settlerTypes[typeKey];
  const s = {
    id, x, y, hp: t.hp, maxHp: t.hp, ...extra,
    isPossessed: false, speed: t.speed, radius: t.radius, visualRadius: t.visualRadius, weapon: 'fist', tool: 'none', role: 'worker', type: typeKey,
    carrying: null, targetEquipment: null, attackCooldown: 0, path: [], pathTarget: null, patrolTemplate: null, deadProcessed: false
  };
  if (t.archer) Object.assign(s, { weapon: t.archerWeapon || 'bow', role: 'archer', quiver: true, quiverCapacity: 12, arrows: 12 });
  return s;
}

export function spawnSettler(type = 'normal') {
  const settlerType = GAME_CONFIG.settlerTypes[type];
  if (!settlerType) return;

  if (getCurrentPop() + settlerType.population > getMaxPop()) {
    showPopLimit();
    return;
  }
  if (!canAfford(settlerType.hireCost)) {
    showCostError(settlerType.hireCost, t('cost.needs', { name: settlerType.label }));
    return;
  }
  payCost(settlerType.hireCost);
  game.settlers.push(createSettler(type, Date.now() + rand(), townHall.x + (rand() - 0.5) * 30, townHall.y + (rand() - 0.5) * 30, { armor: 'none', hasArmor: false }));
  showNotification(t('hire.done', { name: settlerType.label }), false);
  playSound('hire');
}

// The faction's upgrade: a worker into a giant, a zombie into a big zombie
export function getUpgrade() {
  const [from, to] = Object.entries(getPlayerFaction().upgrades || {})[0] || [];
  return from ? { from, to, normal: GAME_CONFIG.settlerTypes[from], big: GAME_CONFIG.settlerTypes[to] } : null;
}

export function upgradeToBig(target) {
  const upgrade = getUpgrade();
  if (!upgrade) return;
  const { normal, big } = upgrade;
  if (!target) target = getSelectedSettler() || getPossessed();
  if (!target || target.type !== upgrade.from) target = game.settlers.find(s => s.type === upgrade.from);

  if (!target || target.type !== upgrade.from) {
    showNotification(t('upgrade.noone'), true);
    return;
  }
  if (getCurrentPop() + big.population - normal.population > getMaxPop()) {
    showPopLimit();
    return;
  }
  if (!canAfford(big.upgradeCost)) {
    showCostError(big.upgradeCost, t('upgrade.needs', { name: big.label }));
    return;
  }

  payCost(big.upgradeCost);

  target.type = upgrade.to;
  target.maxHp = big.hp;
  target.hp = Math.min(target.hp + (big.hp - normal.hp), big.hp);
  target.speed = big.speed;
  target.radius = big.radius;
  target.visualRadius = big.visualRadius;
  showNotification(t('upgrade.done', { name: big.label }), false);
}

// attacker: the enemy dealing the damage, remembered so the settler can strike back (see update())
export function damageSettler(settler, amount, attacker = null) {
  let damage = settler.armor === 'iron' ? amount * (1 - GAME_CONFIG.gear.armor.damageReduction) : amount;
  if (hasWorkingShield(settler)) damage *= 1 - GAME_CONFIG.gear.shield.damageReduction;
  settler.hp -= damage;
  if (damage > 0) { bleed(settler, attacker); playSound('hurt', settler); shakeOnHit(settler); }
  if (attacker) {
    settler.lastAttacker = attacker;
    settler.lastAttackedTick = game.pathTick;
  }
}

// The enemy that hit this settler in the last few seconds, if it's still alive
export function getRecentAttacker(settler) {
  const recent = game.pathTick - (settler.lastAttackedTick || -Infinity) < 4 * 60;
  return recent && game.enemies.includes(settler.lastAttacker) ? settler.lastAttacker : null;
}

export function getPossessed() { return game.settlers.find(s => s.isPossessed); }

// the settler picked in the UI, if it's still alive
export function getSelectedSettler() {
  return game.selectedSettler && game.settlers.includes(game.selectedSettler) ? game.selectedSettler : null;
}

export let lastPossessedIndex = -1;

export function unpossess() {
  const currentIdx = game.settlers.findIndex(s => s.isPossessed);
  if (currentIdx !== -1) {
    lastPossessedIndex = currentIdx;
  }
  game.settlers.forEach(s => s.isPossessed = false);
}

export function switchPossession() {
  if (game.settlers.length === 0 || isDefeated()) return;
  if (game.gameMode === 'battle' && battle.phase !== 'fight') return; // only once a fight is on

  const currentPossessed = getPossessed();

  if (game.selectedSettler) {
    if (currentPossessed === game.selectedSettler) {
      unpossess();
    } else {
      unpossess();
      game.selectedSettler.isPossessed = true;

      const idx = game.settlers.indexOf(game.selectedSettler);
      if (idx !== -1) lastPossessedIndex = idx;
    }
    return;
  }

  if (currentPossessed) {
    unpossess();
  } else {
    let nextIdx = (lastPossessedIndex + 1) % game.settlers.length;
    if (nextIdx >= game.settlers.length || nextIdx < 0) nextIdx = 0;

    game.settlers[nextIdx].isPossessed = true;
    lastPossessedIndex = nextIdx;
  }
}

export function deselectSettler() { game.selectedSettler = null; }

// One settler's meal: food from the stock (2 for a big one), worms when it runs short; a few
// meals in, it needs to go (see relieve)
export function eatMeal(s) {
  playSound('eat', s);
  const cost = isBigBody(s) ? 2 : 1;
  const short = Math.max(0, cost - stock.food);
  stock.food = Math.max(0, stock.food - cost);
  stock.worms = Math.max(0, (stock.worms || 0) - short);
  s.meals = (s.meals || 0) + 1;
  if (s.meals >= GAME_CONFIG.relief.mealsBefore) s.needsRelief = true;
}

// Meals, each settler on its own clock, for a faction that eats (the undead don't)
export function tickMeals(dt) {
  if (game.gameMode === 'endless' && getPlayerFaction().eats) {
    const meals = GAME_CONFIG.meals;
    for (const s of game.settlers) {
      if (s.hunger === undefined) s.hunger = meals.seconds * (meals.firstShare + (1 - meals.firstShare) * rand());
      s.hunger -= dt;
      if (s.hunger <= 0) { s.hunger = meals.seconds; eatMeal(s); }
    }
  }
}

// Dead settlers: their equipment back to the stock, a corpse, and off the list
export function removeDeadSettlers() {
  game.settlers.forEach(s => {
    if (s.hp <= 0 && !s.deadProcessed) {
      s.deadProcessed = true;
      onUnitDeath(s, 'settler');
      refundEquipment(s);
      if (!s.crumbled) addCorpse(s, 'settler', s.type); // a crumbled zombie leaves only rot
      if (game.selectedSettler === s) game.selectedSettler = null;
    }
  });
  game.settlers = game.settlers.filter(s => s.hp > 0);
}
