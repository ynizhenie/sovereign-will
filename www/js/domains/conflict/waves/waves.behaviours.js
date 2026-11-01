// What enemies do by themselves, each tick

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { TILE_SIZE, game, isDoor, someNear, townHall } from '../../../engine/world/index.js';
import { getFrontier, hasFog } from '../../world/index.js';
import { isBuildingSingle, removeBuilding } from '../../economy/building/index.js';
import { enemyDamagePerSecond, enemyHitCooldown, findNearestEnemyTent, getEnemyDef } from './waves.rules.js';
import { getEnemyFaction } from '../../factions/index.js';
import { damageSettler, faceTowards, isUntouchable, speak, startSwing } from '../../colony/settlers/index.js';
import { scheduleRespawn } from '../../economy/gathering/index.js';
import { isShelter } from '../healing/index.js';
import { enemyNecromancy } from '../../factions/undead/index.js';
import { clampEntityToBounds, collidesWithBoxList, invalidateAllPaths, moveEntityTowards } from '../../../engine/movement/index.js';
import { hasLineOfFire, hasMeleeReach } from '../combat/index.js';
import { findTowerExit } from '../towers/index.js';
import { playSound } from '../../../app/index.js';
import { enemyPanic, ghostScare, necromancerKeepsBack, shakeMorale } from '../morale/index.js';

// Every enemy's tick, last first
export function tickEnemies(dt) {
  for (let i = game.enemies.length - 1; i >= 0; i--) tickEnemy(game.enemies[i], dt);
}

/** @typedef {import('../../../engine/world/types.js').Settler} Settler */
/** @typedef {import('../../../engine/world/types.js').TownHall} TownHall */

// An enemy medic (#203): walks up to the most hurt of its side within range and heals it; with a settler
// at it, or nobody hurt, it fights like the rest (weakly). True while it heals
function enemyHeal(en, healer, dt) {
  if (game.settlers.some(s => Math.hypot(s.x - en.x, s.y - en.y) < 50)) return false;
  if (en.herbs === undefined) en.herbs = healer.bagSize;
  const battle = game.gameMode === 'battle';
  let patient = null;
  for (const other of game.enemies) {
    if (other === en || other.hp <= 0 || other.hp >= other.maxHp || Math.hypot(other.x - en.x, other.y - en.y) > healer.range) continue;
    if (!patient || other.hp / other.maxHp < patient.hp / patient.maxHp) patient = other;
  }
  if (!patient) return false;
  if (!battle && en.herbs <= 0) {
    const tent = game.enemyHerbStock > 0 ? findNearestEnemyTent(en) : null;
    if (!tent) return false;
    if (Math.hypot(tent.x - en.x, tent.y - en.y) > GAME_CONFIG.enemyTents.buildDistance) {
      moveEntityTowards(en, tent.x, tent.y, en.speed, true, dt);
      return true;
    }
    const refill = Math.min(healer.refill, game.enemyHerbStock);
    en.herbs += refill;
    game.enemyHerbStock -= refill;
  }
  if (Math.hypot(patient.x - en.x, patient.y - en.y) > healer.healRange + patient.radius) {
    moveEntityTowards(en, patient.x, patient.y, en.speed, true, dt);
  } else {
    if (battle) {
      patient.hp = Math.min(patient.maxHp, patient.hp + healer.healPerSecond * dt);
    } else {
      en.healTimer = (en.healTimer || 0) + dt;
      if (en.healTimer >= healer.healSeconds) {
        en.healTimer = 0;
        en.herbs--;
        patient.hp = Math.min(patient.maxHp, patient.hp + healer.healPerSecond * healer.healSeconds);
      }
    }
    patient.treatedAt = game.pathTick; // (#326: green crosses rising off it)
    en.working = 0.1;
    en.workKind = 'heal';
    faceTowards(en, patient.x, patient.y);
  }
  return true;
}

// (#314) Enemy ghosts keep to their necromancers, split between them, and dive at nearby settlers.
function enemyGhost(en) {
  const g = GAME_CONFIG.pets.ghost;
  const necros = game.enemies.filter(other => other.hp > 0 && getEnemyDef(other).necromancer);
  if (en.escort && !necros.includes(en.escort)) en.escort = null;
  if (!en.escort) {
    const taken = n => game.enemies.filter(other => other !== en && getEnemyDef(other).pet === 'ghost' && other.escort === n).length;
    let best = Infinity;
    for (const necro of necros) {
      if (taken(necro) >= g.carry) continue;
      const d = Math.hypot(necro.x - en.x, necro.y - en.y);
      if (d < best) { best = d; en.escort = necro; }
    }
  }

  const reach = g.diveTiles * TILE_SIZE;
  const nearby = x => game.settlers.filter(s => s.hp > 0 && !s.panic && !isUntouchable(s) && Math.hypot(s.x - x.x, s.y - x.y) <= reach);
  const targets = [...nearby(en), ...(en.escort ? nearby(en.escort) : [])];
  let target = null, best = Infinity;
  for (const settler of targets) {
    const d = Math.hypot(settler.x - en.x, settler.y - en.y);
    if (d < best) { best = d; target = settler; }
  }
  if (target) {
    const d = Math.hypot(target.x - en.x, target.y - en.y), step = g.diveSpeed * GAME_CONFIG.movementScale;
    faceTowards(en, target.x, target.y);
    if (d > Math.max(14, step)) { en.x += (target.x - en.x) / d * step; en.y += (target.y - en.y) / d * step; return; }
    target.ghostPanicFrom = { x: en.x, y: en.y };
    ghostScare(target, 'settler');
    Object.assign(en, { hp: 0, crumbled: true, rewardGranted: true, fled: true });
    return;
  }

  const homes = en.escort ? [en.escort] : game.enemyTents.length ? game.enemyTents : en.battleEntry ? [en.battleEntry] : [townHall];
  const home = homes[Math.abs(en.id || 0) % homes.length];
  const t = game.pathTick / 60 + (en.id || 0);
  const x = home.x + Math.cos(t * 0.8) * 26, y = home.y - 12 + Math.sin(t * 1.1) * 14;
  const d = Math.hypot(x - en.x, y - en.y), step = en.speed * 0.6 * GAME_CONFIG.movementScale;
  if (d > 0.5) {
    faceTowards(en, x, y);
    en.x += (x - en.x) / d * Math.min(step, d);
    en.y += (y - en.y) / d * Math.min(step, d);
  }
}

// One enemy: builds its tent, or picks a target (a settler near it or the town hall), shoots or walks up,
// breaks through what blocks its way, and strikes
export function tickEnemy(en, dt) {
  if (en.hp <= 0) return;
  clampEntityToBounds(en);
  if (getEnemyDef(en).pet === 'ghost') { enemyGhost(en); return; } // (#314)
  if (game.gameMode === 'battle' && !game.settlers.some(s => s.hp > 0 && !isUntouchable(s))) return;
  if (en.trapped) return; // held in an iron trap (#248): it can't move or strike till it's free
  if (enemyPanic(en, dt)) { en.buildTarget = null; return; } // in a panic: away to heal (#207)
  if (en.buildTarget) { buildEnemyTent(en, dt); return; }
  if (en.guard && holdGuardPost(en, dt)) return; // (a defender of an enemy camp, #255)
  if (en.scout) { scoutFlees(en, dt); return; } // (a scout the player pointed at: it only runs, #279)
  if (en.captain) captainOrdersEnemies(en, dt); // (gathering too: the one it tells goes at once)
  if (en.musterUntil && musterHold(en, dt)) return; // (a wave gathering first, #279)

  const enemyDef = getEnemyDef(en);
  if (enemyDef.necromancer && enemyNecromancy(en, enemyDef.necromancer, dt)) return;
  if (enemyDef.necromancer && necromancerKeepsBack(en, dt)) return; // behind its own (#207)
  if (enemyDef.healer && enemyHeal(en, enemyDef.healer, dt)) return;
  if (enemyDef.ranged && enemyOnPlatform(en, enemyDef, dt)) return;
  // (#326) one that hit it a moment ago, still on its feet: it turns on that one, not on with the wall or tent it was breaking
  const struck = en.struckBy && game.settlers.includes(en.struckBy) && en.struckBy.hp > 0 && !isUntouchable(en.struckBy) &&
    game.pathTick - (en.struckTick || -Infinity) < STRUCK_TICKS ? en.struckBy : null;
  if (struck) en.attackTarget = struck;
  const { target, minDist } = chooseEnemyTarget(en);
  const { shooting, meleeDef, moveTarget } = chooseEnemyAttack(en, enemyDef, target);
  // (#326) an archer out of arrows (and tents to fill up at) draws its dagger, as the player's do
  en.weapon = enemyDef.ranged && meleeDef !== enemyDef ? 'dagger' : meleeDef.weapon || 'sword';
  const inMelee = !shooting && moveTarget === target;
  // an archer with no clear shot walks closer instead of standing off
  const clearShot = shooting && hasLineOfFire(en.x, en.y, target.x, target.y);
  const keepsAway = clearShot && minDist < enemyDef.ranged.keepAway;
  if (shooting) enemyShoot(en, enemyDef, target, minDist, clearShot, dt);

  // a melee enemy close enough to strike stands and fights instead of walking into its target
  // the drawn size of a settler: a big one is pushed off further (see separateSettlersFromEnemies)
  const attackRange = (target === townHall ? townHall.radius : (/** @type {Settler} */ (target).visualRadius || target.radius)) + en.radius + meleeDef.reach;
  // (#326: not through a shut door or a wall: it walks on, breaking its way to it, instead)
  const canStrike = inMelee && minDist < attackRange && (target === townHall || hasMeleeReach(en, target));
  const canShoot = shooting && clearShot && minDist < shotOf(enemyDef).range;
  const holdsGround = keepsAway || canStrike || canShoot;
  walkOrBreakThrough(en, enemyDef, moveTarget, holdsGround, dt, !!struck && target === struck);
  if (canStrike) enemyStrike(en, enemyDef, meleeDef, target, dt);
}
const STRUCK_TICKS = 120; // (2 s: how long a hit turns it)

// (#326) An enemy archer and its own side's platform (a watchtower of the red side's, in a battle): up a free one
// near it, it shoots from there, farther and over the walls, as the player's archers do from theirs. True
// while it's on its way up or on it
const PLATFORM_TILES = 12;
function enemyOnPlatform(en, enemyDef, dt) {
  if (game.gameMode !== 'battle' || !game.settlers.length) { en.platform = null; return false; }
  if (en.platform && !game.buildings.includes(en.platform)) en.platform = null;
  if (!en.platform && game.pathTick < (en.platformRestUntil || 0)) return false; // (down a while ago with nothing in reach)
  if (!en.platform) {
    const taken = new Set(game.enemies.map(o => o.platform).filter(Boolean));
    en.platform = game.buildings.filter(b => b.type === 'watchtower' && b.side === 'red' && !taken.has(b) && Math.hypot(b.x - en.x, b.y - en.y) < PLATFORM_TILES * 30)
      .sort((a, b) => Math.hypot(a.x - en.x, a.y - en.y) - Math.hypot(b.x - en.x, b.y - en.y))[0] || null;
    if (!en.platform) return false;
  }
  const tower = /** @type {any} */ (en.platform);
  if (Math.hypot(tower.x - en.x, tower.y - en.y) > 32) {
    moveEntityTowards(en, tower.x, tower.y, en.speed, true, dt);
    return true;
  }
  en.x = tower.x; en.y = tower.y;
  const range = shotOf(enemyDef).range * (tower.tower.reach || 1);
  const target = game.settlers.filter(s => s.hp > 0 && !isUntouchable(s) && Math.hypot(s.x - tower.x, s.y - tower.y) < range && hasLineOfFire(tower.x, tower.y, s.x, s.y, true))
    .sort((a, b) => Math.hypot(a.x - tower.x, a.y - tower.y) - Math.hypot(b.x - tower.x, b.y - tower.y))[0];
  // (#326) nothing in reach for a while (the player's archer up its own platform out of reach, say): down, and not up again
  // for a while: neither side waits for the other for ever
  if (!target) {
    en.platformIdle = (en.platformIdle || 0) + dt;
    if (en.platformIdle > (tower.tower.idleSeconds || 4)) {
      const down = findTowerExit(tower, en);
      Object.assign(en, { x: down.x, y: down.y, path: null, platformIdle: 0, platform: null, platformRestUntil: game.pathTick + (tower.tower.restSeconds || 10) * 60 });
      return false;
    }
    return true;
  }
  en.platformIdle = 0;
  enemyShoot(en, enemyDef, target, Math.hypot(target.x - tower.x, target.y - tower.y), true, dt, tower);
  return true;
}

// A defender of an enemy camp (#255): at its post till a raider comes within guardTiles of it, or of itself.
// True while it holds the post
// (#279) once off its post it goes after them, a retreat or a scout running too (guardOff), till the camp's
// gone back to
function holdGuardPost(en, dt) {
  const reach = GAME_CONFIG.raid.guardTiles * 30;
  if (en.guardOff) return false;
  if (game.settlers.some(s => Math.hypot(s.x - en.guard.x, s.y - en.guard.y) < reach || Math.hypot(s.x - en.x, s.y - en.y) < reach * 0.6)) { en.guardOff = true; return false; }
  if (Math.hypot(en.guard.x - en.x, en.guard.y - en.y) > 6) moveEntityTowards(en, en.guard.x, en.guard.y, en.speed, true, dt);
  return true;
}

// (#279) a wave's enemy gathering where it came in before it attacks: it stands facing the base and shouts at
// the settlers now and then; a settler coming close, or the time up, and it's off. True while it gathers
function musterHold(en, dt) {
  const m = GAME_CONFIG.waveMuster;
  if (game.pathTick >= en.musterUntil || game.settlers.some(s => Math.hypot(s.x - en.x, s.y - en.y) < m.musterBreak) || en.hp < en.maxHp) {
    en.musterUntil = 0;
    return false;
  }
  if (Math.hypot(en.muster.x - en.x, en.muster.y - en.y) > 6) moveEntityTowards(en, en.muster.x, en.muster.y, en.speed, true, dt);
  else faceTowards(en, townHall.x, townHall.y);
  if (Math.random() < dt * 0.12) speak(en, getEnemyFaction().id, 'taunt');
  return true;
}

// (#279) an enemy commander: every everySeconds it tells one of its own within reach, in turn, which settler
// to go for, one each, the nearest to it first (as the player's captain does, settlers.commanders.js)
function captainOrdersEnemies(en, dt) {
  const c = GAME_CONFIG.waveMuster.captain;
  en.orderIn = (en.orderIn ?? 0) - dt;
  if (en.orderIn > 0) return;
  en.orderIn = c.everySeconds;
  const squad = game.enemies.filter(o => o !== en && o.hp > 0 && !o.scout && Math.hypot(o.x - en.x, o.y - en.y) < c.reach);
  if (!squad.length) return;
  en.orderTurn = ((en.orderTurn || 0) + 1) % squad.length;
  const to = squad[en.orderTurn];
  const taken = new Set(squad.filter(o => o !== to).map(o => o.attackTarget).filter(Boolean));
  const target = game.settlers.filter(s => !taken.has(s)).sort((a, b) => Math.hypot(a.x - en.x, a.y - en.y) - Math.hypot(b.x - en.x, b.y - en.y))[0];
  if (!target) return;
  to.attackTarget = target;
  to.musterUntil = 0; // (told: it goes)
  to.orderBubble = { icon: 'swords', until: game.pathTick + 60 };
  en.orderBubble = { icon: 'swords', until: game.pathTick + 40 };
}

// (#279) a scout the player pointed at: off to the nearest edge of the map as fast as it can, gone there
// (#279: not at once: it stays looking till one of them comes within fleeTiles of it, or it's hit)
function scoutFlees(en, dt) {
  if (!en.fleeing) {
    if (en.hp < en.maxHp || game.settlers.some(s => Math.hypot(s.x - en.x, s.y - en.y) < GAME_CONFIG.scouts.fleeTiles * 30)) en.fleeing = true;
    else { faceTowards(en, townHall.x, townHall.y); return; }
  }
  // (#299: off past the frontier, a default map's edge)
  const f = getFrontier(), X0 = f.x0, Y0 = f.y0, W = f.x1, H = f.y1;
  const out = [{ x: X0 - 40, y: en.y, d: en.x - X0 }, { x: W + 40, y: en.y, d: W - en.x }, { x: en.x, y: Y0 - 40, d: en.y - Y0 }, { x: en.x, y: H + 40, d: H - en.y }].sort((a, b) => a.d - b.d)[0];
  moveEntityTowards(en, out.x, out.y, en.speed * 1.2, true, dt);
  if (en.x < X0 + 18 || en.y < Y0 + 18 || en.x > W - 18 || en.y > H - 18) { en.fled = true; en.crumbled = true; en.hp = 0; } // (gone: no corpse, no spoils)
}

// A tent builder walks to its site and builds; the tent stands once the work is done
function buildEnemyTent(en, dt) {
  let site = en.buildTarget;
  if (!game.enemyTentBlueprints.includes(site)) {
    en.buildTarget = null;
    return;
  }
  const tentConfig = GAME_CONFIG.enemyTents;
  let distToSite = Math.hypot(site.x - en.x, site.y - en.y);
  if (distToSite > tentConfig.buildDistance) {
    moveEntityTowards(en, site.x, site.y, en.speed, true, dt);
  } else {
    site.progress += dt * tentConfig.buildRate;
    if (site.progress >= site.maxProgress) {
      game.enemyTents.push({ x: site.x, y: site.y, hp: tentConfig.hp, maxHp: tentConfig.hp, summonTimer: 0, summonsLeft: tentConfig.summonsPerWave });
      playSound('tentUp', site);
      game.enemyTentBlueprints.splice(game.enemyTentBlueprints.indexOf(site), 1);
      en.buildTarget = null;
      invalidateAllPaths();
    }
  }
}

// What the enemy goes for: the settler it locked onto (unless another is much closer), the closest
// settler, or the town hall; and how far that is
/** @returns {{ target: Settler | TownHall, minDist: number }} */
function chooseEnemyTarget(en) {
  /** @type {Settler | TownHall} */
  let target = townHall;
  let minDist = Math.hypot(en.x - townHall.x, en.y - townHall.y);
  let closestSettler = /** @type {Settler | null} */ (null);

  // (#326) in the fog an enemy sees a settler only close to it (an archer: as far as it shoots), or one that has
  // hit it a moment ago; else it knows just its goal, the town hall
  const fog = GAME_CONFIG.fog, foggy = hasFog();
  const def = getEnemyDef(en);
  const sight = Math.max(fog.enemySightTiles * TILE_SIZE, def.ranged ? shotOf(def).range + 30 : 0);
  const sees = (s, d) => !foggy || d <= sight || (en.struckBy === s && game.pathTick - (en.struckTick || -Infinity) < fog.enemyRememberSeconds * 60);
  game.settlers.forEach(s => {
    if (isUntouchable(s)) return; // (a ghost: nothing to hit, #314)
    let d = Math.hypot(en.x - s.x, en.y - s.y);
    if (d < minDist && sees(s, d)) { minDist = d; closestSettler = s; }
  });

  let lockedTarget = en.attackTarget;
  if (lockedTarget && (!game.settlers.includes(lockedTarget) || isUntouchable(lockedTarget) || !sees(lockedTarget, Math.hypot(en.x - lockedTarget.x, en.y - lockedTarget.y) * (foggy ? 0.7 : 1)))) lockedTarget = null;
  if (lockedTarget) {
    let lockedDist = Math.hypot(en.x - lockedTarget.x, en.y - lockedTarget.y);
    if (!closestSettler || lockedDist <= minDist + 40) {
      target = lockedTarget;
      minDist = lockedDist;
    } else {
      target = closestSettler;
      en.attackTarget = closestSettler;
      minDist = Math.hypot(en.x - closestSettler.x, en.y - closestSettler.y);
    }
  } else if (closestSettler) {
    target = closestSettler;
    en.attackTarget = closestSettler;
    minDist = Math.hypot(en.x - closestSettler.x, en.y - closestSettler.y);
  }
  return { target, minDist };
}

// How it attacks: an archer shoots; with an empty quiver it walks to the nearest enemy tent for more
// arrows, or fights like its melee enemy when the tents have none left. moveTarget: where it walks.
/** @returns {{ shooting: boolean, meleeDef: Object, moveTarget: { x: number, y: number } }} */
function chooseEnemyAttack(en, enemyDef, target) {
  let shooting = en.type === 'archer';
  let meleeDef = enemyDef;
  /** @type {{ x: number, y: number }} */
  let moveTarget = target;
  const quiver = enemyDef.quiver;
  if (quiver && en.arrows <= 0) {
    const tent = game.enemyArrowStock > 0 ? findNearestEnemyTent(en) : null;
    if (tent) {
      if (Math.hypot(tent.x - en.x, tent.y - en.y) <= GAME_CONFIG.enemyTents.buildDistance) {
        const taken = Math.min(quiver.refill, game.enemyArrowStock);
        en.arrows += taken;
        game.enemyArrowStock -= taken;
      } else {
        shooting = false;
        moveTarget = tent;
      }
    } else {
      shooting = false;
      meleeDef = getDefinition('enemies', quiver.melee) || enemyDef;
    }
  }
  return { shooting, meleeDef, moveTarget };
}

// (#326) An archer's shot as the player's own with that bow or crossbow: its reach, its arrows' speed and flight (its
// damage and rate are already the player's unit's, see asPlayerUnit); a kind's own numbers only for a weapon with none
function shotOf(enemyDef) {
  const ranged = enemyDef.ranged, w = (getDefinition('weapons', enemyDef.weapon) || {}).combat;
  if (!w || !w.projectileSpeed) return { range: ranged.range, arrowSpeed: ranged.arrowSpeed, arrowLife: ranged.arrowLife, cooldown: ranged.cooldown };
  return { range: w.approach, arrowSpeed: w.projectileSpeed, arrowLife: w.projectileLife, cooldown: w.cooldown };
}

// An archer's shot, when its cooldown is over and it has a clear line within range
// (fromTower: up a platform, #326: its reach, over the walls)
/** @param {any} [fromTower] */
function enemyShoot(en, enemyDef, target, minDist, clearShot, dt, fromTower = null) {
  const shot = shotOf(enemyDef), reach = fromTower ? fromTower.tower.reach || 1 : 1;
  en.attackCooldown = (en.attackCooldown || 0) - dt;
  if (clearShot && minDist < shot.range * reach && en.attackCooldown <= 0) {
    let angle = Math.atan2(target.y - en.y, target.x - en.x);
    const bolt = enemyDef.weapon === 'crossbow';
    playSound(bolt ? 'crossbow' : 'bow', en);
    game.projectiles.push({ x: en.x, y: en.y, vx: Math.cos(angle) * shot.arrowSpeed, vy: Math.sin(angle) * shot.arrowSpeed, damage: en.damage * (en.panic && getEnemyFaction().id === 'undead' ? GAME_CONFIG.morale.panicDamage : 1),
      life: shot.arrowLife * reach, fromEnemy: true, owner: en, fromTower: !!fromTower, bolt });
    startSwing(en, 0.3);
    faceTowards(en, target.x, target.y);
    en.attackCooldown = game.gameMode === 'battle' ? (en.shotCooldown || shot.cooldown) / (en.battleAttackSpeed || 1) : en.shotCooldown || shot.cooldown; // (a bow's rate in a settler's hands, #255)
    en.shotAt = game.pathTick; en.shotLen = en.attackCooldown; // (its next arrow drawn, #306)
    if (enemyDef.quiver && game.gameMode !== 'battle') en.arrows--;
  }
}

// Walking on, or breaking what's in the way: a building it touches, or (on a blocked path) a resource.
// turned: going for one that just hit it: a building it touches is broken only if it's what blocks the only way there
function walkOrBreakThrough(en, enemyDef, moveTarget, holdsGround, dt, turned = false) {
  // box distance, not center distance: an enemy pressed against a wall off-center is still touching it.
  // Use the same collision body as movement, so big enemies don't hit things beside the corridor.
  const contactRadius = Math.min(en.radius, 13) + 2;
  // spikes are walked over, not besieged; (#326) its own doors (the red side's) walked through
  let touchingBuilding = game.buildings.find(b => !(getDefinition('buildings', b.type) || {}).walkable && !(b.side === 'red' && isDoor(b)) && collidesWithBoxList(en.x, en.y, contactRadius, [b], 15));
  if (touchingBuilding) {
    // (#326) its own it never breaks: round it
    const own = touchingBuilding.side === 'red';
    if (!own && isShelter(touchingBuilding) && !turned) {
      breakBuilding(touchingBuilding, enemyDef, dt);
    } else if (!own && (turned ? en.isBlockedPath : en.type === 'big' || en.isBlockedPath || (!isBuildingSingle(touchingBuilding) && !en.pathViaSpikes))) {
      // a lone wall can be walked around, unless it's what blocks the only way in; an enemy on its
      // way in over spikes squeezes past the walls beside them
      breakBuilding(touchingBuilding, enemyDef, dt);
    } else {
      let dx = en.x - touchingBuilding.x;
      let dy = en.y - touchingBuilding.y;
      let dist = Math.hypot(dx, dy);
      let minDist = en.radius + 15;
      if (dist < minDist && dist > 0) {
        en.x += (dx / dist) * (minDist - dist);
        en.y += (dy / dist) * (minDist - dist);
      }
      if (!holdsGround) moveEntityTowards(en, moveTarget.x, moveTarget.y, en.speed, true, dt);
    }
    return;
  }
  const blockedRes = en.isBlockedPath ? findBlockingResource(en, contactRadius) : null;
  if (blockedRes) breakResource(en, blockedRes, enemyDef, dt);
  else if (!holdsGround) moveEntityTowards(en, moveTarget.x, moveTarget.y, en.speed, true, dt);
}

function breakBuilding(building, enemyDef, dt) {
  building.hp -= dt * enemyDef.siege.buildings;
  if (building.hp <= 0) removeBuilding(building);
}

// The resource in the way on a blocked path: trees, boulders, bushes and grass; a big one breaks cacti
// and ore too (not natural rock: paths never go through rock, so a brute only ever grazed rock beside its
// corridor and then spent ~25s chewing through 100 hp instead of walking on)
// (#322: looked for by the tiles round it, not through every tree and bush of a big map, every tick)
function findBlockingResource(en, contactRadius) {
  const lists = en.type === 'big' ? [game.trees, game.boulders, game.berryBushes, game.grassList, game.cacti, game.ironOres, game.coalOres] : [game.trees, game.boulders, game.berryBushes, game.grassList];
  for (const list of lists) {
    let found = null;
    someNear(list, en.x, en.y, contactRadius + 15, r => !(list === game.trees && r.isGrowing) && collidesWithBoxList(en.x, en.y, contactRadius, [r], 15) && (found = r));
    if (found) return found;
  }
  return null;
}

// Trees and boulders take a while and grow back; bushes and grass go at once; a big one wears down the rest
function breakResource(en, blockedRes, enemyDef, dt) {
  if (game.trees.includes(blockedRes)) {
    blockedRes.hp -= dt * enemyDef.siege.resources;
    if (blockedRes.hp <= 0) {
      game.trees.splice(game.trees.indexOf(blockedRes), 1);
      scheduleRespawn('tree');
      invalidateAllPaths();
    }
  } else if (game.boulders.includes(blockedRes)) {
    blockedRes.hp -= dt * enemyDef.siege.resources;
    if (blockedRes.hp <= 0) {
      game.boulders.splice(game.boulders.indexOf(blockedRes), 1);
      scheduleRespawn('boulder');
      invalidateAllPaths();
    }
  } else if (game.berryBushes.includes(blockedRes)) {
    game.berryBushes.splice(game.berryBushes.indexOf(blockedRes), 1);
    scheduleRespawn('berry_bush');
    invalidateAllPaths();
  } else if (game.grassList.includes(blockedRes)) {
    game.grassList.splice(game.grassList.indexOf(blockedRes), 1);
    scheduleRespawn('grass');
    invalidateAllPaths();
  } else if (en.type === 'big') {
    blockedRes.hp -= dt * enemyDef.siege.resources;
    if (blockedRes.hp <= 0) {
      const resourceLists = [game.cacti, game.ironOres, game.coalOres, game.naturalRocks];
      const list = resourceLists.find(resources => resources.includes(blockedRes));
      if (list) list.splice(list.indexOf(blockedRes), 1);
      invalidateAllPaths();
    }
  }
}

// A melee strike at its target; a big one hits the nearest others round it (or the hall) too, up to
// splashMax in all (#209)
function enemyStrike(en, enemyDef, meleeDef, target, dt) {
  // the undead fight on in a panic, weaker (#232: morale.panicDamage); an archer out of arrows and tents
  // fights at its melee kind's strength, as the player's own would (#255)
  const shaken = en.panic && getEnemyFaction().id === 'undead' ? GAME_CONFIG.morale.panicDamage : 1;
  const dagger = enemyDef.ranged && meleeDef !== enemyDef ? (GAME_CONFIG.weapons[enemyDef.weapon] || {}).dagger : null; // (#326: weak)
  const meleeDamage = (dagger ? dagger.damage / dagger.cooldown : meleeDef === enemyDef ? en.damage : (en.meleeDamage ?? (en.meleeDamage = enemyDamagePerSecond(meleeDef)))) * shaken;
  faceTowards(en, target.x, target.y);
  // (#326) a blow at a time, as the player's own strike, not hp drained a little every tick: one every
  // cooldown of its kind's weapon, as much as that many seconds of its damage; the first at once
  // (27.10, 16: the wait runs on whether it's in reach or not, as a settler's attackCooldown: stepping out of
  // reach and back for a moment, as bodies jostle, gave it its next blow at once, and it won every even fight)
  const cooldown = dagger ? dagger.cooldown : enemyHitCooldown(meleeDef);
  if (game.gameMode === 'battle' && en.nextStrikeTick == null) {
    en.nextStrikeTick = game.pathTick + 1;
    return;
  }
  if (game.pathTick < (en.nextStrikeTick || 0)) return;
  const attackCooldown = game.gameMode === 'battle' ? cooldown / (en.battleAttackSpeed || 1) : cooldown;
  en.nextStrikeTick = game.pathTick + Math.max(1, Math.round(attackCooldown / dt));
  startSwing(en, enemyDef.healer ? 0.3 : Math.min(0.5, cooldown)); en.struckAt = game.pathTick; // (#326: a dog's bite drawn from its swing)
  const blow = cooldown * shaken;
  if (en.type === 'big') {
    let splashRadius = enemyDef.splash.radius;
    let splashDamage = blow * en.damage * enemyDef.splash.share;
    if (target === townHall) townHall.hp -= blow * en.damage;
    else damageSettler(target, blow * en.damage, en);

    /** @type {any[]} */
    const around = game.settlers.filter(s => s !== target && Math.hypot(en.x - s.x, en.y - s.y) < splashRadius + s.radius);
    if (target !== townHall && Math.hypot(en.x - townHall.x, en.y - townHall.y) < splashRadius + townHall.radius) around.push(townHall);
    const edge = o => Math.hypot(en.x - o.x, en.y - o.y) - (o.radius || 0);
    for (const o of around.sort((a, b) => edge(a) - edge(b)).slice(0, GAME_CONFIG.combatAI.splashMax - 1)) {
      if (o === townHall) townHall.hp -= splashDamage;
      else damageSettler(o, splashDamage, en);
    }
  } else {
    if (target === townHall) townHall.hp -= cooldown * meleeDamage;
    else damageSettler(target, cooldown * meleeDamage, en);
  }
}
