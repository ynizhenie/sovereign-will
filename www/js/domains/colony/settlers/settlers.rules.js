// Settlers: making one, hiring and upgrading, population, kinds, getting hurt, meals, and which one the
// player has selected or possesses

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { game, rand, townHall } from '../../../engine/world/index.js';
import { armorOf, hasGear, hasWorkingShield } from '../equipment/index.js';
import { canAfford, payCost, showCostError, stock } from '../storage/index.js';
import { getPlayerFaction, isForPlayerFaction } from '../../factions/index.js';
import { showNotification } from '../../../ui/index.js';
import { addCorpse, bleed } from '../../conflict/combat/index.js';
import { isDefeated } from '../../../modes/endless/index.js';
import { battle } from '../../../modes/battle/index.js';
import { playSound } from '../../../app/index.js';
import { onUnitDeath, shakeOnHit } from '../../conflict/morale/index.js';
import { says } from './settlers.voices.js';
import { newLook } from './settlers.looks.js';
import { isNight } from '../../world/index.js';

// The start's limit, plus what each tent (or grave) adds
export function getMaxPop() {
  return game.buildings.reduce((sum, b) => sum + ((getDefinition('buildings', b.type) || {}).population || 0), GAME_CONFIG.start.population);
}

// Too many settlers: the hint names the player's own home (a tent, a grave, a sacrificial circle) (#200)
function showPopLimit() {
  const home = Object.values(GAME_CONFIG.buildings).find(b => b.population && isForPlayerFaction(b));
  showNotification(home ? t('pop.limit', { name: getDefinition('buildings', home.id).label, icon: home.icon }) : t('pop.limitNoHome'), true);
}

// Raised zombies don't count: they're temporary; nor one let go, on its way out (#314)
export function getCurrentPop() {
  return game.settlers.reduce((sum, s) => sum + (s.temporary || s.leaving ? 0 : GAME_CONFIG.settlerTypes[s.type].population), 0);
}

// (#314) Which pet it is (a dog, a beast, a ghost), or null for anyone else; a ghost can't be hurt or hit
export function petKindOf(unit) {
  return (getDefinition('settlerTypes', unit.type) || {}).pet || null;
}
export const isPet = unit => !!petKindOf(unit);
export const isUntouchable = unit => petKindOf(unit) === 'ghost';

// A pet's look: a female or a male (drawn a little smaller), one of its kind's coats
export function newPetLook(kind) {
  const c = GAME_CONFIG.pets;
  return { female: Math.random() < c.femaleChance, coat: Math.floor(Math.random() * c.coats[kind].length), style: 0, shade: 0 };
}

// A big body: a giant or a big zombie (settlerTypes with big), or a big enemy
export function isBigBody(unit) {
  return unit.type === 'big' || !!(getDefinition('settlerTypes', unit.type) || {}).big;
}

// A settler turns into another kind of its faction (a faction's bowUnits, if it has any), keeping
// its share of hp, its armour and everything it holds
export function changeSettlerType(s, type) {
  const t = GAME_CONFIG.settlerTypes[type];
  if (!t || s.type === type) return;
  const share = s.hp / s.maxHp;
  const bonus = armorOf(s) ? armorOf(s).hpBonus : 0;
  Object.assign(s, { type, speed: t.speed, radius: t.radius, visualRadius: t.visualRadius, maxHp: t.hp + bonus });
  s.hp = s.maxHp * share;
}

// A new settler of a GAME_CONFIG.settlerTypes kind, unarmed, as a worker; an archer kind
// comes with its bow and a full quiver, a necromancer with its raises
/** @returns {import('../../../engine/world/types.js').Settler} */
export function createSettler(typeKey, id, x, y, extra = {}) {
  const t = GAME_CONFIG.settlerTypes[typeKey];
  const s = {
    id, x, y, hp: t.hp, maxHp: t.hp, ...extra,
    isPossessed: false, speed: t.speed, radius: t.radius, visualRadius: t.visualRadius, weapon: 'fist', tool: 'none', role: 'worker', type: typeKey,
    carrying: null, targetEquipment: null, attackCooldown: 0, path: [], pathTarget: null, patrolTemplate: null, deadProcessed: false,
    look: extra.look || (t.pet ? newPetLook(t.pet) : newLook()) // (#306; a pet's its own, #314)
  };
  if (t.pet) s.role = 'pet';
  if (t.pet === 'ghost') Object.assign(s, { ghostly: true }); // (nobody pushes it or is pushed by it)
  if (t.archer) Object.assign(s, { weapon: t.archerWeapon || 'bow', role: 'archer', quiver: true, quiverCapacity: 12, arrows: 12 });
  return s;
}

export function spawnSettler(type = 'normal') {
  const settlerType = GAME_CONFIG.settlerTypes[type];
  if (!settlerType) return;

  if (settlerType.population > 0 && getCurrentPop() + settlerType.population > getMaxPop()) {
    showPopLimit();
    return;
  }
  // (#326) a ghost: needs a built grave, and at most the base's few plus one a grave (it takes no room otherwise)
  if (settlerType.pet === 'ghost') {
    const graves = game.buildings.filter(b => b.type === 'grave').length, limit = GAME_CONFIG.pets.ghost.limit;
    if (!graves) { showNotification(t('ghost.needGrave'), true); return; }
    if (game.settlers.filter(s => s.type === type).length >= limit.base + graves * limit.perGrave) { showNotification(t('ghost.limit', { n: limit.base + graves * limit.perGrave }), true); return; }
  }
  if (!canAfford(settlerType.hireCost)) {
    showCostError(settlerType.hireCost, t('cost.needs', { name: settlerType.label }));
    return;
  }
  payCost(settlerType.hireCost);
  const hired = createSettler(type, Date.now() + rand(), townHall.x + (rand() - 0.5) * 30, townHall.y + (rand() - 0.5) * 30, { armor: null, hasArmor: false }); // (#298: 'none' was taken for armour since leather)
  game.settlers.push(hired);
  says(hired, 'hired'); // (#252)
  showNotification(t('hire.done', { name: settlerType.label }), false);
  playSound('hire');
}

// The faction's upgrade: a worker into a giant, a zombie into a big zombie
export function getUpgrade() {
  const [from, to] = Object.entries(getPlayerFaction().upgrades || {})[0] || [];
  return from ? { from, to, normal: GAME_CONFIG.settlerTypes[from], big: GAME_CONFIG.settlerTypes[to] } : null;
}

// (#314) Who's turned big first: a soldier before a worker, then by its weapon (iron, then any, then fists) and
// its armour (iron, then leather) and a shield
const WEAPON_RANK = { iron: 3, plain: 2, club: 1, fist: 0 };
export function upgradeRank(s) {
  const weapon = s.weapon === 'fist' ? WEAPON_RANK.fist : s.weapon.startsWith('iron_') ? WEAPON_RANK.iron : s.weapon === 'club' ? WEAPON_RANK.club : WEAPON_RANK.plain;
  const armour = armorOf(s) ? (armorOf(s).armorKind === 'iron' ? 2 : 1) : 0;
  return (s.role !== 'worker' ? 100 : 0) + weapon * 10 + armour * 3 + (hasWorkingShield(s) ? 1 : 0);
}

export function upgradeToBig(target) {
  const upgrade = getUpgrade();
  if (!upgrade) return;
  const { normal, big } = upgrade;
  if (!target) target = getSelectedSettler() || getPossessed();
  // (#314) none picked: the best armed and armoured first, soldiers before workers
  if (!target || target.type !== upgrade.from) {
    target = game.settlers.filter(s => s.type === upgrade.from && !s.leaving).sort((a, b) => upgradeRank(b) - upgradeRank(a))[0];
  }

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

// (#314) Let one go (reverse hiring): what it wears and holds into the store (and its load into the stock),
// and it walks to the town hall and is gone there (see leaveColony, #326); its place in the population free
// at once. A raised zombie can't be let go: it's not hired
export function dismissSettler(s) {
  if (!s || s.leaving || s.temporary || !game.settlers.includes(s)) return false;
  const keep = (category, id) => { game.armory[`${category}:${id}`] = (game.armory[`${category}:${id}`] || 0) + 1; };
  if (s.weapon && s.weapon !== 'fist') keep('weapons', s.weapon);
  if (s.tool && s.tool !== 'none') keep('tools', s.tool);
  const armour = armorOf(s);
  if (armour) keep('gear', armour.id);
  for (const id of Object.keys(GAME_CONFIG.gear)) if (!GAME_CONFIG.gear[id].armorKind && hasGear(s, id)) keep('gear', id);
  if (s.carrying && s.carrying.type && stock[s.carrying.type] !== undefined) stock[s.carrying.type] += s.carrying.amount || 0;
  Object.assign(s, { leaving: true, weapon: 'fist', tool: 'none', role: 'worker', armor: null, carrying: null, targetEquipment: null, isPossessed: false, markTarget: null, path: [], pathTarget: null });
  for (const id of Object.keys(GAME_CONFIG.gear)) if (!GAME_CONFIG.gear[id].armorKind && s[id]) s[id] = false;
  s.hp = Math.min(s.hp, s.maxHp = GAME_CONFIG.settlerTypes[s.type].hp);
  if (game.selectedSettler === s) game.selectedSettler = null;
  says(s, 'dismissed');
  showNotification(t('dismiss.done', { name: GAME_CONFIG.settlerTypes[s.type].label }), false);
  return true;
}

// attacker: the enemy dealing the damage, remembered so the settler can strike back (see update())
export function damageSettler(settler, amount, attacker = null) {
  if (isUntouchable(settler)) return; // (a ghost, #314)
  let damage = armorOf(settler) ? amount * (1 - armorOf(settler).damageReduction) : amount;
  if (hasWorkingShield(settler)) damage *= 1 - GAME_CONFIG.gear.shield.damageReduction;
  const wasWell = settler.hp >= settler.maxHp * 0.3;
  settler.hp -= damage;
  if (damage > 0) { bleed(settler, attacker); playSound('hurt', settler); shakeOnHit(settler); }
  if (wasWell && settler.hp > 0 && settler.hp < settler.maxHp * 0.3) says(settler, 'hurt', true); // (#252)
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

export function unpossess() {
  game.settlers.forEach(s => s.isPossessed = false);
}

// (#326) The selected settler possessed (by its card's button), or let go again; a battle's only in a fight
export function switchPossession() {
  const s = getSelectedSettler();
  if (!s || isDefeated()) return;
  if (game.gameMode === 'battle' && battle.phase !== 'fight') return;
  const was = s.isPossessed;
  unpossess();
  if (!was) { s.isPossessed = true; s.order = null; s.path = null; }
}

export function deselectSettler() { game.selectedSettler = null; game.selectedGroup = []; game.addingToGroup = false; }

// (#326) Who's picked: the selected one and the group with it (those still about)
export function getSelection() {
  const lead = getSelectedSettler();
  if (!lead) return [];
  game.selectedGroup = game.selectedGroup.filter(s => s !== lead && game.settlers.includes(s));
  return [lead, ...game.selectedGroup];
}

// (#326) All the soldiers and archers into the group with the selected one
export function selectAllSoldiers() {
  const lead = getSelectedSettler();
  if (!lead) return;
  game.selectedGroup = game.settlers.filter(s => s !== lead && (s.role === 'soldier' || s.role === 'archer') && !s.leaving);
}

// (#326) A settler into the group, or out of it again (the selected one: it stays)
export function toggleInGroup(s) {
  if (s === getSelectedSettler()) return;
  const i = game.selectedGroup.indexOf(s);
  if (i >= 0) game.selectedGroup.splice(i, 1); else game.selectedGroup.push(s);
}

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
  if (Math.random() < 0.12) says(s, 'ate'); // (#279)
}

// Meals, each settler on its own clock, for a faction that eats (the undead don't)
export function tickMeals(dt) {
  if (game.gameMode === 'endless' && getPlayerFaction().eats) {
    const meals = GAME_CONFIG.meals;
    for (const s of game.settlers) {
      if (s.hunger === undefined) s.hunger = meals.seconds * (meals.firstShare + (1 - meals.firstShare) * rand());
      // its meal eaten here, not only while goEat runs: put to bed, called away or in a wave, it's done in its time
      // and doesn't stay frozen at its mouth (#279); asleep, it's put away
      if (isPet(s)) continue; // (fed their own way, #314)
      if (s.eating) { s.eating.left -= dt; if (s.eating.left <= 0 || s.asleep) s.eating = null; }
      if (s.asleep) continue; // (it stands still in its sleep, #257)
      s.hunger -= dt * (isNight() ? meals.nightFactor : 1); // (awake at night, slower, #279)
      // hungry: it goes and gets its meal (goEat, #248); the last one still not eaten, it's eaten on the go
      if (s.hunger <= 0) { s.hunger = meals.seconds; if (s.wantsMeal) eatMeal(s); else s.wantsMeal = true; }
    }
  }
}

// What a fallen settler held (#279): each thing, with the same chance as an enemy's (GAME_CONFIG.loot), lies
// where it fell for the others to pick up (into the armory); the rest is lost. A medic's herbs go back to the
// stock. Endless only (a battle's units come back as they were placed)
export function dropSettlerLoot(s) {
  if (s.bagHerbs > 0) { stock.herbs += s.bagHerbs; s.bagHerbs = 0; }
  if (game.gameMode !== 'endless') return;
  const held = [];
  if (s.weapon && s.weapon !== 'fist' && getDefinition('weapons', s.weapon)) held.push(`weapons:${s.weapon}`);
  if (s.tool && s.tool !== 'none' && getDefinition('tools', s.tool)) held.push(`tools:${s.tool}`);
  for (const id of Object.keys(GAME_CONFIG.gear)) if (hasGear(s, id) && getDefinition('gear', id)) held.push(`gear:${id}`);
  held.forEach((key, i) => {
    if (rand() >= GAME_CONFIG.loot.itemChance) return;
    const a = i * 2.1;
    game.loot.push({ x: s.x + Math.cos(a) * 8 * i, y: s.y + Math.sin(a) * 8 * i, hp: 1, maxHp: 1, priority: 0, yield: {}, items: [key] });
  });
}

// Dead settlers: what they held dropped (or lost), a corpse, and off the list
export function removeDeadSettlers() {
  game.settlers.forEach(s => {
    if (s.hp <= 0 && !s.deadProcessed) {
      s.deadProcessed = true;
      onUnitDeath(s, 'settler');
      dropSettlerLoot(s);
      if (!s.crumbled) addCorpse(s, 'settler', s.type); // a crumbled zombie leaves only rot
      if (game.selectedSettler === s) game.selectedSettler = null;
    }
  });
  game.settlers = game.settlers.filter(s => s.hp > 0);
}
