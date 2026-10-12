// The undead: necromancy from the staff, blighted ground, raised zombies that crumble, the enemy's necromancer

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { TILE_SIZE, game, getGridPos, isBorderZone, rand, townHall } from '../../../engine/world/index.js';
import { stock } from '../../colony/storage/index.js';
import { createConfiguredEnemy } from '../../conflict/waves/index.js';
import { getPlayerFaction, sides } from '../index.js';
import { showNotification } from '../../../ui/index.js';
import { createSettler, faceTowards } from '../../colony/settlers/index.js';
import { isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';

// The necromancy a settler has from what it holds (the undead's staff), or null
export function getNecromancy(s) {
  return (getDefinition('tools', s.tool) || {}).necromancer || null;
}

// Blighted ground: round the undead's graveyard and graves (`base`), and marked ground a
// necromancer has blighted. Worked out once per tick; tile keys 'x,y'.
export let blightCache = { key: '', keys: new Set(), base: new Set() };

export function updateBlightCache() {
  const cacheKey = `${game.pathTick}|${sides.player.faction}|${game.gameMode}|${game.buildings.length}|${game.blightZones.filter(z => z.done).length}|${townHall.x},${townHall.y}`;
  if (blightCache.key === cacheKey) return blightCache;
  const base = new Set();
  if (sides.player.faction === 'undead' && game.gameMode === 'endless') {
    const b = GAME_CONFIG.blight;
    // the tiles from (gx0, gy0) to (gx1, gy1) and r more on every side
    const around = (gx0, gy0, gx1, gy1, r) => {
      for (let gy = gy0 - r; gy <= gy1 + r; gy++) for (let gx = gx0 - r; gx <= gx1 + r; gx++) {
        if (!isBorderZone(gx, gy)) base.add(`${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`);
      }
    };
    // the graveyard stands on the 2×2 tiles round its centre, a tile corner (as far on every side)
    const hx = Math.round(townHall.x / TILE_SIZE), hy = Math.round(townHall.y / TILE_SIZE);
    around(hx - 1, hy - 1, hx, hy, b.hallTiles);
    for (const grave of game.buildings) {
      if (grave.type !== 'grave') continue;
      const g = getGridPos(grave.x, grave.y);
      around(g.gx, g.gy, g.gx, g.gy, b.graveTiles);
    }
  }
  const keys = new Set(base);
  if (base.size) for (const z of game.blightZones) if (z.done) keys.add(`${z.x},${z.y}`);
  blightCache = { key: cacheKey, keys, base };
  return blightCache;
}

export function getBlightKeys() {
  return updateBlightCache().keys;
}

// A tile blighted round the graveyard or a grave, not by a necromancer (no zone can be marked there)
export function isBaseBlighted(x, y) {
  return updateBlightCache().base.has(`${x},${y}`);
}

export function isBlighted(x, y) {
  const g = getGridPos(x, y);
  return getBlightKeys().has(`${g.gx * TILE_SIZE + 15},${g.gy * TILE_SIZE + 15}`);
}

// Mark tile (x, y) as a farm zone for `crop` ('wheat' / 'sapling'), or unmark it: tapping a tile
// already in that zone, or with crop 'clear'. See canBeFarmZone for where it can go.
// A marked tile not blighted yet goes at once; blighted ground fades over clearSeconds (still blighted till
// then), and a tap while it fades keeps it. Ground blighted round the graveyard or a grave takes no mark.
export function toggleBlightZone(x, y, gx, gy, clearOnly) {
  const existing = game.blightZones.find(z => z.x === x && z.y === y);
  if (existing) {
    if (!existing.done) game.blightZones.splice(game.blightZones.indexOf(existing), 1);
    else if (existing.clearing === undefined) existing.clearing = GAME_CONFIG.blight.clearSeconds;
    else if (!clearOnly) delete existing.clearing;
    return;
  }
  if (clearOnly || isBorderZone(gx, gy) || isTileBlockedForSettler(gx, gy)) return;
  if (isBaseBlighted(x, y)) { showNotification(t('blight.already'), true); return; }
  game.blightZones.push({ x, y, done: false });
}

// Raised zombies crumble when their time is up; the player's leave rot behind
export function updateTemporaryZombies(dt) {
  // gone at once: no corpse, no reward, and nothing can heal them back (a necromancer would)
  const crumbled = unit => unit.temporary !== undefined && (unit.temporary -= dt) <= 0;
  const gone = game.settlers.filter(crumbled);
  if (gone.length) {
    game.settlers = game.settlers.filter(s => !gone.includes(s));
    if (gone.includes(game.selectedSettler)) game.selectedSettler = null;
    stock.rot += gone.length * GAME_CONFIG.temporaryZombie.rot;
  }
  game.enemies = game.enemies.filter(en => !crumbled(en));
}

// A corpse on blighted ground rises as a temporary zombie after a while
export function raiseOnBlight(dt) {
  if (sides.player.faction !== 'undead') return;
  for (const corpse of [...game.corpses]) {
    if (!isBlighted(corpse.x, corpse.y)) continue;
    corpse.blightAge = (corpse.blightAge || 0) + dt;
    if (corpse.blightAge >= GAME_CONFIG.blight.riseSeconds) raiseTemporaryZombie(corpse);
  }
}

// A corpse rises as a temporary zombie: no room taken in the colony; it crumbles into rot after
// GAME_CONFIG.temporaryZombie.lifeSeconds (see updateTemporaryZombies)
export function raiseTemporaryZombie(corpse) {
  const zombie = createSettler(corpse.big ? 'big_zombie' : 'zombie', Date.now() + rand(), corpse.x, corpse.y);
  zombie.temporary = GAME_CONFIG.temporaryZombie.lifeSeconds;
  game.settlers.push(zombie);
  game.corpses.splice(game.corpses.indexOf(corpse), 1);
  return zombie;
}

// An enemy necromancer: heals the wounded enemies around it as it goes; with no settler close by
// it walks to a corpse within range and raises it into a zombie (a big corpse: a big zombie), as many
// times as it has raises. True while it's busy raising (it does nothing else then).
export function enemyNecromancy(en, necro, dt) {
  if (en.raisesLeft === undefined) en.raisesLeft = necro.raises;
  for (const other of game.enemies) {
    if (other !== en && other.hp < other.maxHp && Math.hypot(other.x - en.x, other.y - en.y) < necro.healRange) {
      other.hp = Math.min(other.maxHp, other.hp + necro.healPerSecond * dt);
    }
  }
  if (en.raisesLeft <= 0 || game.settlers.some(s => Math.hypot(s.x - en.x, s.y - en.y) < 60)) return false;
  let corpse = null, best = necro.range;
  for (const c of game.corpses) {
    const d = Math.hypot(c.x - en.x, c.y - en.y);
    if (d < best && (!c.raisedBy || c.raisedBy === en)) { best = d; corpse = c; }
  }
  if (!corpse) return false;
  corpse.raisedBy = en;
  if (best > 16) {
    moveEntityTowards(en, corpse.x, corpse.y, en.speed, true, dt);
    return true;
  }
  faceTowards(en, corpse.x, corpse.y);
  en.raiseTimer = (en.raiseTimer || 0) + dt;
  if (en.raiseTimer >= necro.raiseSeconds) {
    en.raiseTimer = 0;
    en.raisesLeft--;
    game.corpses.splice(game.corpses.indexOf(corpse), 1);
    const zombie = createConfiguredEnemy(corpse, corpse.big ? 'undead_big_zombie' : 'undead_zombie');
    zombie.fromWave = en.fromWave;
    zombie.temporary = GAME_CONFIG.temporaryZombie.lifeSeconds; // as the player's
    game.enemies.push(zombie);
  }
  return true;
}

// The undead make bones by themselves: their graveyard and each grave; and rot, from each grave
export function makeBonesAndRot(dt) {
  const bonesRate = getPlayerFaction().bonesPerSecond;
  if (bonesRate && game.gameMode === 'endless') {
    stock.bones += dt * (bonesRate.hall + game.buildings.filter(b => b.type === 'grave').length * bonesRate.grave);
  }
  const rotRate = getPlayerFaction().rotPerSecond;
  if (rotRate && game.gameMode === 'endless') {
    stock.rot += dt * (rotRate.hall + game.buildings.filter(b => b.type === 'grave').length * rotRate.grave);
  }
}

// Blighted zones taken away fade
export function fadeClearedBlight(dt) {
  for (const z of game.blightZones) if (z.clearing !== undefined) z.clearing -= dt;
  if (game.blightZones.some(z => z.clearing <= 0)) game.blightZones = game.blightZones.filter(z => !(z.clearing <= 0));
}
