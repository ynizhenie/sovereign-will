// Fighting: a strike, arrows and what stops them, blood, burning, spikes, corpses, and the base's defence
// before and during a wave

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { getGridPos, getTileIndex } from '../../../engine/world/grid.js';
import { TILE_SIZE, game, townHall } from '../../../engine/world/state.js';
import { getWeaponStats, isBowWeapon } from '../../colony/equipment/equipment.rules.js';
import { damageSettler, isBigBody } from '../../colony/settlers/settlers.rules.js';
import { getReachSteps, getSettlerReach, invalidateAllPaths } from '../../../engine/movement/pathfinding.js';
import { woundBoar } from '../../economy/hunting/hunting.rules.js';
import { faceTowards, startSwing } from '../../colony/settlers/settlers.draw.js';
import { tileVariantHash } from '../../world/world.draw.js';
import { playSound } from '../../../app/sounds.js';

// Whether an arrow is stopped on tile (gx, gy). fromTower: shot from a watchtower, over walls and doors.
export function isArrowBlockedTile(gx, gy, fromTower) {
  const tiles = getTileIndex();
  const key = `${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`;
  return tiles.arrowBlockers.has(key) || (fromTower ? tiles.towerArrowBuildings : tiles.arrowBuildings).has(key);
}

export function isArrowBlockedAt(x, y, fromTower) {
  const g = getGridPos(x, y);
  return isArrowBlockedTile(g.gx, g.gy, fromTower);
}

// Whether an arrow from (x1, y1) would fly to (x2, y2) unstopped. Walks every tile the line touches
// (not just points along it), so an arrow never clips a corner the check missed. The shooter's own
// tile doesn't count.
export function hasLineOfFire(x1, y1, x2, y2, fromTower = false) {
  let gx = Math.floor(x1 / TILE_SIZE), gy = Math.floor(y1 / TILE_SIZE);
  const endGx = Math.floor(x2 / TILE_SIZE), endGy = Math.floor(y2 / TILE_SIZE);
  const dx = x2 - x1, dy = y2 - y1;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  // how far along the line (0..1) the next vertical / horizontal tile border is, and one tile's worth
  let nextX = stepX ? ((stepX > 0 ? gx + 1 : gx) * TILE_SIZE - x1) / dx : Infinity;
  let nextY = stepY ? ((stepY > 0 ? gy + 1 : gy) * TILE_SIZE - y1) / dy : Infinity;
  const tileX = stepX ? TILE_SIZE / Math.abs(dx) : Infinity;
  const tileY = stepY ? TILE_SIZE / Math.abs(dy) : Infinity;
  while (gx !== endGx || gy !== endGy) {
    if (Math.abs(nextX - nextY) < 1e-9) {
      // exactly through a corner: both side tiles count
      if (isArrowBlockedTile(gx + stepX, gy, fromTower) || isArrowBlockedTile(gx, gy + stepY, fromTower)) return false;
      gx += stepX; gy += stepY; nextX += tileX; nextY += tileY;
    } else if (nextX < nextY) {
      gx += stepX; nextX += tileX;
    } else {
      gy += stepY; nextY += tileY;
    }
    if (nextX > 1 + tileX && nextY > 1 + tileY) break; // safety: past the end
    if (isArrowBlockedTile(gx, gy, fromTower)) return false;
  }
  return true;
}

export function performAttack(attacker, targetX, targetY) {
  if (attacker.attackCooldown > 0) return;
  faceTowards(attacker, targetX, targetY);

  const stats = getWeaponStats(attacker, 'combat');

  if (isBowWeapon(attacker.weapon)) {
    if (!attacker.quiver || (attacker.arrows || 0) <= 0) return;
    let angle = Math.atan2(targetY - attacker.y, targetX - attacker.x);
    game.projectiles.push({ 
      x: attacker.x, 
      y: attacker.y, 
      vx: Math.cos(angle) * stats.projectileSpeed, 
      vy: Math.sin(angle) * stats.projectileSpeed, 
      damage: stats.damage * stats.multiplier,
      life: stats.projectileLife, 
      fromEnemy: false, 
      owner: attacker,
      fire: !!(getDefinition('settlerTypes', attacker.type) || {}).fireArrows // a fire imp's (#165)
    });
    playSound('bow', attacker);
    if (game.gameMode !== 'battle') attacker.arrows--; // arrows don't run out in battles (#166)
    attacker.attackCooldown = stats.cooldown;
    startSwing(attacker, 0.3);
  } else {
    const range = stats.range;
    const dmg = stats.damage * stats.multiplier;
    const inReach = (o, pad) => Math.hypot(o.x - attacker.x, o.y - attacker.y) <= range + pad;
    // everything within reach of the blow, and what hitting it does
    const struck = [
      ...game.enemies.filter(en => inReach(en, en.radius)).map(en => ({ at: en, hit: () => { en.hp -= dmg; bleed(en, attacker); playSound('hit', en); } })),
      ...game.enemyTents.filter(et => inReach(et, 15)).map(et => ({ at: et, hit: () => { et.hp -= dmg; } })),
      ...game.boars.filter(b => !b.isCarcass && !b.hidden && !b.hideTarget && inReach(b, 12) && !((b.fleeTimer || 0) > 0 && b.sprinting))
        .map(b => ({ at: b, hit: () => {
          woundBoar(b, dmg, attacker, attacker.x, attacker.y);
        } }))
    ];
    // a big settler's blow hits everything around it; anyone else hits one: the one aimed at (#144)
    if (isBigBody(attacker)) struck.forEach(target => target.hit());
    else if (struck.length > 0) {
      const aimed = struck.reduce((best, target) =>
        Math.hypot(target.at.x - targetX, target.at.y - targetY) < Math.hypot(best.at.x - targetX, best.at.y - targetY) ? target : best);
      aimed.hit();
    }

    attacker.attackCooldown = stats.cooldown;
    startSwing(attacker, Math.min(0.35, stats.cooldown * 0.8));
    playSound('swing', attacker);
  }
}

// A unit was hurt: blood on it, a splat under it (at most every half second per unit) and on the melee
// weapon that did it (GAME_CONFIG.blood)
export function bleed(unit, attacker) {
  unit.bloodAge = 0;
  if (attacker && !isBowWeapon(attacker.weapon) && Math.hypot(attacker.x - unit.x, attacker.y - unit.y) < 80) attacker.weaponBloodAge = 0;
  if (game.pathTick - (unit.lastBleedTick ?? -Infinity) < 30) return;
  unit.lastBleedTick = game.pathTick;
  const h = tileVariantHash(game.pathTick, game.bloodSplats.length);
  game.bloodSplats.push({ x: unit.x + (h % 11) - 5, y: unit.y + ((h >>> 8) % 11) - 5, r: 3 + (h >>> 16) % 4, age: 0 });
  if (game.bloodSplats.length > GAME_CONFIG.blood.maxSplats) game.bloodSplats.shift();
}

// Stepping in a pool of blood or in dung: the unit then leaves footprints for a few steps. Footprints
// themselves don't smear further. Whoever left the dung can't step in it until it has walked off first.
export function trackFootprints(unit) {
  for (const pile of game.dung) {
    if (pile.by === unit && !pile.byLeft && Math.hypot(unit.x - pile.x, unit.y - pile.y) > 20) pile.byLeft = true;
  }
  if (!unit.smear || unit.smear.steps <= 0) {
    const pool = game.bloodSplats.find(b => b.kind !== 'trail' && Math.hypot(unit.x - b.x, unit.y - b.y) < b.r + 4);
    const pile = game.dung.find(p => (p.by !== unit || p.byLeft) && Math.hypot(unit.x - p.x, unit.y - p.y) < 9);
    if (pool || pile) unit.smear = { color: pile ? 'dung' : 'blood', steps: GAME_CONFIG.smears.steps, x: unit.x, y: unit.y };
    return;
  }
  if (Math.hypot(unit.x - unit.smear.x, unit.y - unit.smear.y) < GAME_CONFIG.smears.stepGap) return;
  unit.smear.x = unit.x; unit.smear.y = unit.y;
  unit.smear.steps--;
  game.bloodSplats.push({ x: unit.x, y: unit.y, r: 2.2, age: 0, kind: 'trail', color: unit.smear.color });
  if (game.bloodSplats.length > GAME_CONFIG.blood.maxSplats) game.bloodSplats.shift();
}

// How visible the blood on a unit's body is: it doesn't dry while the unit is badly wounded
export function bodyBloodAlpha(unit) {
  if (unit.bloodAge === undefined) return 0;
  return bloodAlpha(unit.bloodAge, unit.hp <= unit.maxHp * GAME_CONFIG.blood.woundedShare);
}

// How visible blood of this age is (1..0); `wounded` blood on a badly hurt unit never fades
export function bloodAlpha(age, wounded = false) {
  if (age === undefined) return 0;
  const blood = GAME_CONFIG.blood;
  if (wounded || age <= blood.fadeAfter) return 1;
  return Math.max(0, 1 - (age - blood.fadeAfter) / blood.fadeSeconds);
}

// Burning arrows (#165): what they hit burns a few seconds
export function setBurning(unit) {
  unit.burning = GAME_CONFIG.burning.seconds;
}

export function updateBurning(dt) {
  for (const unit of [...game.settlers, ...game.enemies]) {
    if (!(unit.burning > 0)) continue;
    unit.burning -= dt;
    if (game.settlers.includes(unit)) damageSettler(unit, GAME_CONFIG.burning.dps * dt, null);
    else unit.hp -= GAME_CONFIG.burning.dps * dt;
  }
}

// Spike traps: a unit stepping onto a spike tile takes its damage once per visit; each visit uses one
// of the trap's uses, and it breaks when they run out. Runs once a tick after movement.
export function applySpikeTraps() {
  const tiles = getTileIndex();
  if (tiles.spikes.size === 0) return;
  const spikesAt = new Map(game.buildings.filter(b => b.type === 'spikes').map(b => [`${b.x},${b.y}`, b]));
  const step = (unit, hurt) => {
    const g = getGridPos(unit.x, unit.y);
    const key = `${g.gx * TILE_SIZE + 15},${g.gy * TILE_SIZE + 15}`;
    const trap = spikesAt.get(key);
    if (!trap) { unit.spikeTile = null; return; }
    if (unit.spikeTile === key || trap.usesLeft <= 0) return;
    unit.spikeTile = key;
    hurt(getDefinition('buildings', 'spikes').build.trap.damage);
    trap.usesLeft--;
    if (trap.usesLeft <= 0) {
      game.buildings.splice(game.buildings.indexOf(trap), 1);
      invalidateAllPaths();
    }
  };
  for (const s of game.settlers) if (!s.towerAssignment) step(s, damage => damageSettler(s, damage));
  for (const en of game.enemies) step(en, damage => { en.hp -= damage; bleed(en, null); });
}

// ---- Corpses (#42): where a settler or enemy fell, grey, until GAME_CONFIG.corpses.seconds pass. A
// later mechanic (e.g. raising the dead) can use one up by removing it from `corpses`.
export function addCorpse(unit, side, kind) {
  playSound('death', unit, side === 'enemy');
  const big = isBigBody(unit);
  game.corpses.push({ x: unit.x, y: unit.y, radius: unit.visualRadius || unit.radius, side, kind, age: 0, big, wormsTaken: false });
}

export function updateCorpses(dt) {
  const lifetime = GAME_CONFIG.corpses.seconds;
  for (const corpse of game.corpses) corpse.age += dt;
  game.corpses = game.corpses.filter(corpse => corpse.age < lifetime);
}

// a normal settler's drawn radius plus a normal enemy's: what melee `approach` distances are set for
export const NORMAL_BODIES = 21;

// ---- Pre-wave deployment (#14)

// From deploySeconds before a wave until its enemies are beaten, not in battle mode
export function isDefenseAlert() {
  if (game.gameMode === 'battle' || !game.gameStarted) return false;
  return game.waveTimer <= GAME_CONFIG.defense.deploySeconds || game.enemies.some(en => en.fromWave);
}

// How far the base reaches from the town hall: its farthest building, at least minRadius tiles
export function getBaseRadius() {
  const far = game.buildings.reduce((max, b) => Math.max(max, Math.hypot(b.x - townHall.x, b.y - townHall.y)), 0);
  return Math.max(far, GAME_CONFIG.defense.minRadius * TILE_SIZE);
}

// From the warning until the wave is beaten, settlers go no farther from the town hall than the base's
// farthest building (plus a tile) on their own; only what the player marked takes them farther
export function getSafeRadius() {
  return isDefenseAlert() ? getBaseRadius() + TILE_SIZE : Infinity;
}

export function isInSafeArea(x, y) {
  return Math.hypot(x - townHall.x, y - townHall.y) <= getSafeRadius();
}

// An enemy inside the base, or next to one of its buildings or the town hall
export function isInsideBase(en) {
  const near = GAME_CONFIG.defense.nearBaseTiles * TILE_SIZE;
  return Math.hypot(en.x - townHall.x, en.y - townHall.y) <= getBaseRadius() + near + townHall.radius ||
    game.buildings.some(b => Math.hypot(en.x - b.x, en.y - b.y) <= near);
}

// Squads and their posts, rebuilt when the soldiers or the buildings change: squads of squadSize melee
// soldiers (plus an archer each while there are any), posts at the doors first, the rest spread evenly
// around the town hall at the base's radius, each on a tile a settler can stand on
export function getDefensePlan() {
  const melee = game.settlers.filter(s => s.role === 'soldier' && !s.isPossessed);
  const archers = game.settlers.filter(s => s.role === 'archer' && !s.isPossessed && !s.towerAssignment);
  const key = [...melee, ...archers].map(s => s.id).join(',') + '|' + game.buildings.length;
  if (game.defensePlan && game.defensePlan.key === key) return game.defensePlan;
  const size = GAME_CONFIG.defense.squadSize;
  // too few for two squads: everyone on a post of their own round the base (#155)
  const singles = melee.length < 2 * size;
  const count = singles ? melee.length + archers.length : Math.ceil(melee.length / size);
  const radius = getBaseRadius();
  const hallReach = getSettlerReach({ x: townHall.x, y: townHall.y });
  const standable = (x, y) => {
    const g = getGridPos(x, y);
    for (let ring = 0; ring <= 3; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          if (getReachSteps(hallReach, g.gx + dx, g.gy + dy) >= 0) return { x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 };
        }
      }
    }
    return { x, y };
  };
  const posts = [];
  for (const door of game.buildings.filter(b => b.type === 'door')) {
    if (posts.length >= count) break;
    // just inside the door, on the town hall's side
    const angle = Math.atan2(door.y - townHall.y, door.x - townHall.x);
    posts.push(standable(door.x - Math.cos(angle) * TILE_SIZE, door.y - Math.sin(angle) * TILE_SIZE));
  }
  const ring = count - posts.length;
  for (let i = 0; i < ring; i++) {
    const angle = (i / ring) * Math.PI * 2 - Math.PI / 2;
    posts.push(standable(townHall.x + Math.cos(angle) * radius, townHall.y + Math.sin(angle) * radius));
  }
  const squadOf = new Map();
  if (singles) {
    [...melee, ...archers].forEach((s, i) => squadOf.set(s, { post: posts[i], slot: 0 }));
  } else {
    melee.forEach((s, i) => squadOf.set(s, { post: posts[Math.floor(i / size)], slot: i % size }));
    archers.forEach((s, i) => squadOf.set(s, { post: posts[i % posts.length], slot: size + Math.floor(i / posts.length) }));
  }
  game.defensePlan = { key, posts, squadOf };
  return game.defensePlan;
}

// Arrows fly, hit what they reach (settlers and the town hall, or enemies, tents and boars), stop at obstacles
export function tickProjectiles() {
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    let proj = game.projectiles[i];
    if (!proj.startTile) proj.startTile = getGridPos(proj.x, proj.y);
    proj.x += proj.vx; proj.y += proj.vy; proj.life--;
    let hit = false;

    if (proj.fromEnemy) {
      if (Math.hypot(townHall.x - proj.x, townHall.y - proj.y) < townHall.radius) {
        townHall.hp -= proj.damage;
        hit = true;
      }
      for (let s of game.settlers) {
        if (hit) break;
        if (Math.hypot(s.x - proj.x, s.y - proj.y) < s.radius + 3) {
          damageSettler(s, proj.damage, proj.owner);
          if (proj.fire) setBurning(s);
          hit = true;
        }
      }
    } else {
      for (let j = game.enemies.length - 1; j >= 0 && !hit; j--) {
        let en = game.enemies[j];
        if (Math.hypot(en.x - proj.x, en.y - proj.y) < en.radius + 3) {
          en.hp -= proj.damage;
          bleed(en, proj.owner);
          playSound('arrowHit', en);
          if (proj.fire) setBurning(en);
          hit = true;
        }
      }
      for (let j = game.enemyTents.length - 1; j >= 0 && !hit; j--) {
        let et = game.enemyTents[j];
        if (Math.hypot(et.x - proj.x, et.y - proj.y) < 18) {
          et.hp -= proj.damage;
          hit = true;
        }
      }
      for (let j = game.boars.length - 1; j >= 0 && !hit; j--) {
        let b = game.boars[j];
        if (!b.isCarcass && !b.hidden && !b.hideTarget && Math.hypot(b.x - proj.x, b.y - proj.y) < 12) {
          woundBoar(b, proj.damage, proj.owner || null, proj.owner ? proj.owner.x : proj.x, proj.owner ? proj.owner.y : proj.y);
          hit = true;
        }
      }
    }
    // gone: it hit something, flew its full range, or struck an obstacle past its shooter's own tile
    const tile = getGridPos(proj.x, proj.y);
    const leftStartTile = tile.gx !== proj.startTile.gx || tile.gy !== proj.startTile.gy;
    if (hit || proj.life <= 0 || (leftStartTile && isArrowBlockedAt(proj.x, proj.y, !!proj.fromTower))) game.projectiles.splice(i, 1);
  }
}

// Blood on the ground dries; dung goes after a while
export function ageBloodAndDung(dt) {
  for (const splat of game.bloodSplats) splat.age += dt;
  game.bloodSplats = game.bloodSplats.filter(splat => bloodAlpha(splat.age) > 0);
  for (const pile of game.dung) pile.age += dt;
  game.dung = game.dung.filter(pile => pile.age < GAME_CONFIG.relief.dungSeconds);
}

// Units stepping in blood or dung leave footprints
export function trackAllFootprints() {
  for (const unit of game.settlers) trackFootprints(unit);
  for (const unit of game.enemies) trackFootprints(unit);
}
