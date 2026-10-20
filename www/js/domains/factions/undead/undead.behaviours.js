// The colony's necromancer heals, raises and blights

// ---- Necromancers

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, isBorderZone, townHall } from '../../../engine/world/index.js';
import { moveSettlerToTownHall, stock, takeStock } from '../../colony/storage/index.js';
import { getBlightKeys, getNecromancy, raiseTemporaryZombie } from './undead.rules.js';
import { isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { faceTowards, getRecentAttacker, hasPlayerOrderFor } from '../../colony/settlers/index.js';
import { getBaseRadius, isDefenseAlert } from '../../conflict/combat/index.js';
import { getPlayerFaction } from '../index.js';

// The undead's necromancer: heals the wounded around it; in a fight raises corpses (any, a big one into a
// big zombie) while it has raises and there's room in the colony; with raises spent, or nothing to raise,
// it gets them back at the nearest grave (or the graveyard)
export function necromancy(s, tick) {
  const necro = getNecromancy(s);
  if (!necro) return false;
  if (s.raisesLeft === undefined) s.raisesLeft = necro.raises;
  const dt = tick.dt;
  const dist = o => Math.hypot(o.x - s.x, o.y - s.y);

  // (#279: no more stepping back from an enemy close by: it stepped back, went to heal one of its own
  // among the enemies, stepped back again... It keeps calmly to its work; hit, it strikes back, strikeBack)
  let corpse = null;
  const zombieType = c => (c.big ? 'big_zombie' : 'zombie');
  // raised in a fight; between waves the corpses give bones instead (collectBones, #199)
  if (s.raisesLeft > 0 && (tick.isWaveActive || isDefenseAlert())) {
    // not one with an enemy close to it: it would go for it and step back again (#232)
    const guarded = c => game.enemies.some(en => en.hp > 0 && Math.hypot(en.x - c.x, en.y - c.y) < GAME_CONFIG.morale.necroCorpseClear);
    for (const c of game.corpses) {
      if (tick.raiseAssignments.has(c) || dist(c) > necro.range || guarded(c)) continue;
      if (!corpse || dist(c) < dist(corpse)) corpse = c;
    }
  }
  const raise = () => {
    tick.raiseAssignments.add(corpse);
    s.patrolTarget = null;
    // raised from a distance (raiseReach), not standing over it (#203)
    if (dist(corpse) > necro.raiseReach) {
      moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, dt);
      s.raiseTimer = 0;
      return true;
    }
    s.working = 0.1;
    s.raising = { x: corpse.x, y: corpse.y, until: game.pathTick + 2 }; // its thread (drawRaising)
    faceTowards(s, corpse.x, corpse.y);
    s.raiseTimer = (s.raiseTimer || 0) + dt;
    if (s.raiseTimer >= necro.raiseSeconds) {
      s.raiseTimer = 0;
      s.raisesLeft--;
      raiseTemporaryZombie(corpse);
    }
    return true;
  };
  // a corpse within its reach first (no walking for it), then its wounded, then a corpse farther off
  if (corpse && dist(corpse) <= necro.raiseReach) return raise();

  let patient = null;
  for (const other of game.settlers) {
    if (other !== s && other.hp < other.maxHp && dist(other) < necro.range / 2 && (!patient || dist(other) < dist(patient))) patient = other;
  }
  if (patient) {
    s.patrolTarget = null;
    if (dist(patient) > necro.healRange) {
      moveEntityTowards(s, patient.x, patient.y, s.speed, false, dt);
    } else {
      patient.hp = Math.min(patient.maxHp, patient.hp + necro.healPerSecond * dt);
      s.working = 0.1;
      faceTowards(s, patient.x, patient.y);
    }
    return true;
  }
  if (corpse) return raise();
  // itself last of all (#279), where it stands
  if (s.hp < s.maxHp && (tick.isWaveActive || getRecentAttacker(s))) {
    s.hp = Math.min(s.maxHp, s.hp + necro.healPerSecond * dt);
    s.working = 0.1;
    return true;
  }

  // blighting by itself (#253): with none marked left, the tile nearest the base not blighted yet, queued
  // as if marked; none left anywhere, it's switched off
  if (game.autoBlight && stock.rot >= necro.blightRot && !game.blightZones.some(z => !z.done)) {
    const next = nextAutoBlightTile();
    if (next) game.blightZones.push({ x: next.x, y: next.y, done: false, auto: true });
    else { game.autoBlight = false; game.autoBlightDone = true; }
  }

  // marked ground to blight, while there's the rot for it (blightRot a tile, #204)
  const zone = stock.rot >= necro.blightRot ? game.blightZones.filter(z => !z.done && !tick.blightAssignments.has(z))
    .sort((a, b) => dist(a) - dist(b))[0] : null;
  if (zone) {
    tick.blightAssignments.add(zone);
    s.patrolTarget = null;
    if (dist(zone) > 16) {
      moveEntityTowards(s, zone.x, zone.y, s.speed, false, dt);
      s.blightTimer = 0;
    } else {
      s.working = 0.1;
      s.blightTimer = (s.blightTimer || 0) + dt;
      if (s.blightTimer >= necro.blightSeconds) { s.blightTimer = 0; zone.done = true; takeStock('rot', necro.blightRot); }
    }
    return true;
  }

  if (s.raisesLeft < necro.raises) {
    const graves = game.buildings.filter(b => b.type === 'grave');
    const grave = graves.length ? graves.reduce((a, b) => (dist(a) < dist(b) ? a : b)) : townHall;
    s.patrolTarget = null;
    if (grave === townHall ? dist(townHall) > townHall.radius + s.radius + 4 : dist(grave) > 32) {
      if (grave === townHall) moveSettlerToTownHall(s, s.speed, dt);
      else moveEntityTowards(s, grave.x, grave.y, s.speed, false, dt);
    } else {
      s.raisesLeft = necro.raises;
    }
    return true;
  }
  // between waves (not with one coming), a grave worked for its bones and rot (#253)
  if (!tick.isWaveActive && !isDefenseAlert() && workGrave(s, tick)) return true;
  return false;
}

// Between waves (no one to fight, a raised zombie would only crumble), a necromancer with nothing else to
// do takes the bones from a corpse in or near the base: `bones` (twice that from a big one) in boneSeconds
// (GAME_CONFIG.idle, #199)
export function collectBones(s, tick) {
  const necro = getNecromancy(s);
  if (!necro || s.isPossessed || s.carrying || tick.isWaveActive) return false;
  const c = GAME_CONFIG.idle;
  const dist = o => Math.hypot(o.x - s.x, o.y - s.y);
  const reach = getBaseRadius() + 3 * TILE_SIZE;
  // (not one lying by a grave: it keeps the grave working, #253)
  const graves = game.buildings.filter(b => b.type === 'grave');
  const corpse = game.corpses.filter(k => !tick.raiseAssignments.has(k) && Math.hypot(k.x - townHall.x, k.y - townHall.y) <= reach && !graves.some(g => liesBy(k, g)))
    .sort((a, b) => dist(a) - dist(b))[0];
  if (!corpse) { s.boneTimer = 0; return false; }
  tick.raiseAssignments.add(corpse);
  s.patrolTarget = null;
  if (dist(corpse) > 18) { moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt); s.boneTimer = 0; return true; }
  faceTowards(s, corpse.x, corpse.y);
  s.working = 0.1;
  s.boneTimer = (s.boneTimer || 0) + tick.dt;
  if (s.boneTimer >= c.boneSeconds) {
    s.boneTimer = 0;
    game.corpses.splice(game.corpses.indexOf(corpse), 1);
    stock.bones = (stock.bones || 0) + c.bones * (corpse.big ? 2 : 1);
  }
  return true;
}

// ---- Graves (#253)

const graveWork = () => GAME_CONFIG.graveWork;
// A corpse lying by a grave (within nearTiles): the grave needs no rest
function liesBy(corpse, grave) {
  const r = (graveWork().nearTiles + 0.5) * TILE_SIZE;
  return Math.max(Math.abs(corpse.x - grave.x), Math.abs(corpse.y - grave.y)) <= r;
}
function corpseBy(grave) {
  return game.corpses.some(c => liesBy(c, grave));
}

// A necromancer works the nearest grave that isn't resting (another necromancer not on it): a while at it,
// then its bones and rot; then the grave rests restSeconds, unless a corpse lies by it
function workGrave(s, tick) {
  const c = graveWork();
  const taken = new Set(game.settlers.filter(o => o !== s && o.graveTarget).map(o => o.graveTarget));
  const ready = b => b.type === 'grave' && (!((b.rest || 0) > 0) || corpseBy(b)) && !taken.has(b);
  let grave = s.graveTarget && game.buildings.includes(s.graveTarget) && ready(s.graveTarget) ? s.graveTarget : null;
  if (!grave) grave = game.buildings.filter(ready).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0] || null;
  s.graveTarget = grave;
  if (!grave) return false;
  s.patrolTarget = null;
  if (Math.hypot(grave.x - s.x, grave.y - s.y) > 32) { moveEntityTowards(s, grave.x, grave.y, s.speed, false, tick.dt); s.graveTimer = 0; return true; }
  faceTowards(s, grave.x, grave.y);
  s.working = 0.1;
  s.raising = { x: grave.x, y: grave.y, until: game.pathTick + 2 }; // (its thread to the grave)
  s.graveTimer = (s.graveTimer || 0) + tick.dt;
  if (s.graveTimer < c.seconds) return true;
  s.graveTimer = 0;
  stock.bones = (stock.bones || 0) + c.bones;
  stock.rot = (stock.rot || 0) + c.rot;
  if (!corpseBy(grave)) grave.rest = c.restSeconds;
  s.graveTarget = null;
  return true;
}

// Undead workers with free hands carry the corpses about (not by a grave already) to a grave with room by
// it (corpsesBy), between waves: there it needs no rest while the corpse lasts
export function corpsesToGraves(s, tick) {
  // a wave coming with one in its arms: down where it stands
  if (s.carrying && s.carrying.forGrave && (tick.isWaveActive || isDefenseAlert())) {
    game.corpses.push(Object.assign(s.carrying.corpse, { x: s.x, y: s.y }));
    s.carrying = null;
  }
  // (not with a wave coming, nor a raised one that'll crumble with it in its arms)
  if (getPlayerFaction().id !== 'undead' || s.isPossessed || tick.isWaveActive || isDefenseAlert() || s.temporary !== undefined || s.role !== 'worker' || s.tool !== 'none') return false;
  const c = graveWork();
  const byGrave = liesBy;
  const graves = game.buildings.filter(b => b.type === 'grave');
  const load = s.carrying && s.carrying.type === 'corpse' && s.carrying.forGrave ? s.carrying : null;
  if (load) {
    const grave = load.forGrave;
    if (!game.buildings.includes(grave)) { game.corpses.push(Object.assign(load.corpse, { x: s.x, y: s.y })); s.carrying = null; return false; }
    s.patrolTarget = null;
    if (Math.hypot(grave.x - s.x, grave.y - s.y) > 26) { moveEntityTowards(s, grave.x, grave.y, s.speed * GAME_CONFIG.corpseHaul.speed, false, tick.dt); return true; }
    const n = game.corpses.filter(k => byGrave(k, grave)).length;
    game.corpses.push(Object.assign(load.corpse, { x: grave.x + (n % 2 ? 10 : -10), y: grave.y + 12 }));
    s.carrying = null;
    return true;
  }
  if (s.carrying || !graves.length || hasPlayerOrderFor(s, tick)) return false; // (an order of the player's first, #279)
  const coming = g => game.settlers.filter(o => o.carrying && o.carrying.forGrave === g).length;
  const room = g => game.corpses.filter(k => byGrave(k, g)).length + coming(g) < c.corpsesBy;
  const grave = graves.filter(room).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  if (!grave) return false;
  const taken = new Set(game.settlers.filter(o => o !== s && o.corpseTarget).map(o => o.corpseTarget));
  let corpse = s.corpseTarget && game.corpses.includes(s.corpseTarget) ? s.corpseTarget : null;
  if (!corpse) {
    const near = Math.max(getBaseRadius(), 0) + 6 * TILE_SIZE;
    corpse = game.corpses.filter(k => !taken.has(k) && !tick.raiseAssignments.has(k) && !graves.some(g => byGrave(k, g)) && Math.hypot(k.x - townHall.x, k.y - townHall.y) <= near)
      .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0] || null;
  }
  s.corpseTarget = corpse;
  if (!corpse) return false;
  tick.raiseAssignments.add(corpse);
  s.patrolTarget = null;
  if (Math.hypot(corpse.x - s.x, corpse.y - s.y) > 14) { moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt); return true; }
  game.corpses.splice(game.corpses.indexOf(corpse), 1);
  s.carrying = { type: 'corpse', amount: 1, corpse, forGrave: grave };
  s.corpseTarget = null;
  return true;
}

// The tile nearest the base that blight can still spread to: free ground, not the map's edge, not
// blighted, not marked; null when there's none left
export function nextAutoBlightTile() {
  const g = getGridPos(townHall.x, townHall.y);
  const keys = getBlightKeys();
  const marked = new Set(game.blightZones.map(z => `${z.x},${z.y}`));
  for (let ring = 1; ring < Math.max(game.COLS, game.ROWS); ring++) {
    let best = null, bestD = Infinity;
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const gx = g.gx + dx, gy = g.gy + dy;
        if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS || isBorderZone(gx, gy) || isTileBlockedForSettler(gx, gy)) continue;
        const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15, key = `${x},${y}`;
        if (keys.has(key) || marked.has(key)) continue;
        const d = Math.hypot(x - townHall.x, y - townHall.y);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    if (best) return best;
  }
  return null;
}
