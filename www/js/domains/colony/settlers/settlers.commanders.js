// Commanders (#248): a worker with a whistle is a foreman, a soldier with a banner a captain (GAME_CONFIG.gear
// whistle / banner `commands`). Each has a squad, the nearest few of its kind, and gives them orders one at a
// time, which shows: a bubble with what it's about over the commander and the one told, and a line between
// them for a moment.
// A foreman, between waves, walks to the next of its squad and tells it what the colony needs most (the
// resource furthest under GAME_CONFIG.needs): it gathers that first for a while (`focus`), and if a tool in
// the armory does it and its own doesn't, it swaps (its own into the armory). Then it goes back to its work.
// A captain fights as ever; in a wave it gives the next of its squad the enemy nearest the town hall that
// none of them is on yet (`captainTarget`, see chooseSettlerTarget).

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { TILE_SIZE, game, townHall } from '../../../engine/world/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { getToolFamily, hasGear, isRangedWeapon, takeFromArmory } from '../equipment/index.js';
import { stock } from '../storage/index.js';
import { getPlayerFaction } from '../../factions/index.js';
import { isDefenseAlert } from '../../conflict/combat/index.js';
import { faceTowards } from './settlers.draw.js';

const SHOW_TICKS = 120; // how long an order shows (2 s)

// Its squad: the `size` nearest of those it commands, kept while they're about
function squadOf(s, size, fits) {
  const kept = (s.squadIds || []).map(id => game.settlers.find(o => o.id === id)).filter(o => o && fits(o));
  if (kept.length >= size || game.pathTick % 300 !== 0 && kept.length) return kept;
  const others = game.settlers.filter(o => o !== s && fits(o) && !kept.includes(o))
    .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
  const squad = [...kept, ...others].slice(0, size);
  s.squadIds = squad.map(o => o.id);
  return squad;
}

// An order shows over both, and a line between them
function showOrder(from, to, icon) {
  const until = game.pathTick + SHOW_TICKS;
  from.orderBubble = { icon, until };
  to.orderBubble = { icon, until };
  from.orderLine = { toId: to.id, until };
}

// What the colony needs most now, and the tool family that gathers it (null: by hand)
const NEED_TOOLS = { wood: 'axe', stone: 'pickaxe', ironOre: 'pickaxe', food: null };
function mostNeeded() {
  const needs = GAME_CONFIG.needs;
  let best = null, bestShare = Infinity;
  for (const [id, amount] of Object.entries(needs)) {
    if (id === 'food' && !getPlayerFaction().eats) continue;
    if (id === 'ironOre' && !game.buildings.some(b => b.type === 'smelter')) continue;
    const share = (stock[id] || 0) / amount;
    if (share < bestShare) { bestShare = share; best = id; }
  }
  if (!best || bestShare >= 1) return null; // (plenty of all)
  let family = NEED_TOOLS[best];
  // food: fish with a rod at a marked spot, wheat with a hoe in a farm zone, otherwise berries by hand
  if (best === 'food') family = game.waterTiles.some(w => w.isFishing) ? 'rod' : game.farmZones.length ? 'hoe' : null;
  return { resource: best, family };
}

// A tool in the armory of that family (the better one first: iron)
function storedTool(family) {
  const ids = Object.keys(GAME_CONFIG.tools).filter(id => getToolFamily(id) === family && (game.armory[`tools:${id}`] || 0) > 0);
  return ids.sort((a, b) => (b.startsWith('iron') ? 1 : 0) - (a.startsWith('iron') ? 1 : 0))[0] || null;
}

// (#279) a commander's orders go no further than rangeTiles from it: not across half the map
const inRange = (s, o, c) => Math.hypot(o.x - s.x, o.y - s.y) <= c.rangeTiles * TILE_SIZE;

const isForeman = s => hasGear(s, 'whistle') && s.role === 'worker';
const isCaptain = s => hasGear(s, 'banner') && (s.role === 'soldier' || s.role === 'archer');

// A foreman's turn (a behaviour): walking to give its next order; false between orders (it works)
export function foremanOrders(s, tick) {
  if (!isForeman(s) || s.isPossessed || s.carrying || tick.isWaveActive || isDefenseAlert()) return false;
  const c = GAME_CONFIG.gear.whistle.commands;
  s.orderIn = (s.orderIn ?? c.everySeconds) - tick.dt;
  if (s.orderIn > 0 && !s.orderTo) return false;
  const squad = squadOf(s, c.squad, o => o.role === 'worker' && !isForeman(o) && !o.isPossessed && inRange(s, o, c));
  if (!squad.length) { s.orderIn = c.everySeconds; return false; }
  let to = s.orderTo ? squad.find(o => o.id === s.orderTo) : null;
  if (!to) {
    s.orderTurn = ((s.orderTurn || 0) + 1) % squad.length;
    to = squad[s.orderTurn];
    s.orderTo = to.id;
  }
  s.patrolTarget = null;
  if (Math.hypot(to.x - s.x, to.y - s.y) > c.reach) { moveEntityTowards(s, to.x, to.y, s.speed, false, tick.dt); return true; }
  // there: the order
  faceTowards(s, to.x, to.y);
  const need = mostNeeded();
  s.orderTo = null;
  s.orderIn = c.everySeconds;
  if (!need) return true;
  to.focus = { resource: need.resource, until: game.pathTick + c.focusSeconds * 60 };
  if (need.family && getToolFamily(to.tool) !== need.family && !to.targetEquipment) {
    const tool = storedTool(need.family);
    if (tool && takeFromArmory(`tools:${tool}`)) to.targetEquipment = { weapon: 'fist', tool, role: 'worker', keep: true }; // (its own into the armory)
  }
  showOrder(s, to, GAME_CONFIG.resources[need.resource].icon);
  return true;
}

// A captain's orders in a wave (a behaviour that never takes the tick: it fights as ever)
export function captainOrders(s, tick) {
  if (!isCaptain(s) || s.isPossessed || !tick.isWaveActive) return false;
  const c = GAME_CONFIG.gear.banner.commands;
  s.orderIn = (s.orderIn ?? 0) - tick.dt;
  if (s.orderIn > 0) return false;
  s.orderIn = c.everySeconds;
  const squad = squadOf(s, c.squad, o => (o.role === 'soldier' || o.role === 'archer') && !isCaptain(o) && !o.isPossessed && !o.towerAssignment && inRange(s, o, c));
  if (!squad.length) return false;
  s.orderTurn = ((s.orderTurn || 0) + 1) % squad.length;
  const to = squad[s.orderTurn];
  if (Math.hypot(to.x - s.x, to.y - s.y) > c.reach) return false; // (too far to be heard)
  const taken = new Set(squad.filter(o => o !== to).map(o => o.captainTarget).filter(Boolean));
  const from = game.gameMode === 'battle' ? s : townHall; // (a battle has no town hall to defend: the nearest to the captain)
  const enemy = game.enemies.filter(en => en.hp > 0 && !taken.has(en))
    .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
  if (!enemy) return false;
  to.captainTarget = enemy;
  showOrder(s, to, 'swords');
  return false;
}

// (#279) a captain arms the unarmed before a wave: from armSeconds before it (or with the alert, or in it),
// every everySeconds it tells the next within reach with no tool and no weapon to take a melee weapon from the
// store (the best there is), lent; once the wave's over, in turn, it tells each it lent one to (wherever it
// is) to put it back
export function captainArms(s, tick) {
  if (!isCaptain(s) || s.isPossessed || game.gameMode !== 'endless') return false;
  const c = GAME_CONFIG.gear.banner.commands;
  s.armIn = (s.armIn ?? 0) - tick.dt;
  if (s.armIn > 0) return false;
  s.armIn = c.everySeconds;
  const near = o => o !== s && !o.isPossessed && !o.targetEquipment && Math.hypot(o.x - s.x, o.y - s.y) <= Math.min(c.reach, c.rangeTiles * TILE_SIZE);
  const arming = tick.isWaveActive || isDefenseAlert() || game.waveTimer <= c.armSeconds;
  if (arming) {
    const to = game.settlers.find(o => near(o) && o.role === 'worker' && o.weapon === 'fist' && o.tool === 'none' && !o.whistle && o.temporary === undefined);
    const weapon = to && bestStoredWeapon();
    if (!weapon || !takeFromArmory(`weapons:${weapon}`)) return false;
    to.targetEquipment = { weapon, tool: 'none', role: 'soldier', keep: true };
    to.lentBy = s.id;
    showOrder(s, to, 'swords');
  } else {
    // (lent till the wave's over: it brings it back by itself, no order across the map; one near is told, #279)
    const to = game.settlers.find(o => o.lentBy === s.id && !o.isPossessed && !o.targetEquipment);
    if (!to) return false;
    to.targetEquipment = { weapon: 'fist', tool: 'none', role: 'worker', keep: true }; // (into the store whole)
    delete to.lentBy;
    if (inRange(s, to, c)) showOrder(s, to, 'ok');
    else to.orderBubble = { icon: 'ok', until: game.pathTick + SHOW_TICKS };
  }
  return false;
}

// The best melee weapon in the store: the most damage a hit
function bestStoredWeapon() {
  return Object.values(GAME_CONFIG.weapons).filter(w => w.id !== 'fist' && !isRangedWeapon(w.id) && (game.armory[`weapons:${w.id}`] || 0) > 0)
    .sort((a, b) => b.combat.damage - a.combat.damage)[0]?.id || null;
}

// (#279) what a settler is, by what it holds: a foreman, a captain, a necromancer, an archer, a soldier, by its
// tool a woodcutter, a miner, a fisher, a farmer, a medic; nothing in its hands, a handyman
export function roleTitle(s) {
  if (s.role === 'pet') return `${t('role.pet')}, ${t((s.petHunger || 0) >= 1 ? 'pet.hungry' : 'pet.fed')}`; // (#314)
  if (s.whistle) return t('role.foreman');
  if (s.banner) return t('role.captain');
  const family = getToolFamily(s.tool);
  if (family === 'necro') return t('role.necromancer');
  if (s.weapon !== 'fist') return t(s.role === 'archer' || isRangedWeapon(s.weapon) ? 'role.archer' : 'role.soldier');
  const byTool = { axe: 'woodcutter', pickaxe: 'miner', rod: 'fisher', hoe: 'farmer', medic: 'medic' }[family];
  return t(`role.${byTool || 'handyman'}`);
}
