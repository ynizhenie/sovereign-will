// The undead: necromancy from the staff, blighted ground, raised zombies that crumble, the enemy's necromancer

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { TILE_SIZE, game, getGridPos, isBorderZone, rand, townHall } from '../../../engine/world/index.js';
import { stock } from '../../colony/storage/index.js';
import { createConfiguredEnemy } from '../../conflict/waves/index.js';
import { getPlayerFaction, sides } from '../index.js';
import { showNotification } from '../../../ui/index.js';
import { createSettler, dropSettlerLoot, faceTowards } from '../../colony/settlers/index.js';
import { canUseShield, isRangedWeapon, putOnGear } from '../../colony/equipment/index.js';
import { isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { playSound } from '../../../app/index.js';

// The necromancy a settler has from what it holds (the undead's staff), or null
export function getNecromancy(s) {
  return (getDefinition('tools', s.tool) || {}).necromancer || null;
}

// Blighted ground: round the undead's graveyard and graves (`base`), and marked ground a
// necromancer has blighted. Worked out once per tick; tile keys 'x,y'.
export let blightCache = { key: '', keys: new Set(), base: new Set() };

export function updateBlightCache() {
  const cacheKey = `${game.pathTick}|${sides.player.faction}|${game.gameMode}|${game.buildings.length}|${game.blightZones.filter(z => z.done).length}|${townHall.x},${townHall.y}|${!!game.battleBlight}`;
  if (blightCache.key === cacheKey) return blightCache;
  const base = new Set();
  // (#326) a battle on blighted ground (its settings): all of the field, the strip outside the red line too, working as in Endless (the red side slowed on it)
  if (game.gameMode === 'battle' && game.battleBlight) {
    for (let gy = 0; gy < game.ROWS; gy++) for (let gx = 0; gx < game.COLS; gx++) base.add(`${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`);
  }
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

// Raised zombies crumble when their time is up; the player's leave a little rot and bones on the ground
// where they were (#253), picked up like loot
export function updateTemporaryZombies(dt) {
  // gone at once: no corpse, no reward, and nothing can heal them back (a necromancer would)
  const crumbled = unit => unit.temporary !== undefined && (unit.temporary -= dt) <= 0;
  const gone = game.settlers.filter(crumbled);
  if (gone.length) {
    game.settlers = game.settlers.filter(s => !gone.includes(s));
    if (game.selectedSettler && gone.includes(game.selectedSettler)) game.selectedSettler = null;
    const z = GAME_CONFIG.temporaryZombie;
    for (const s of gone) {
      const times = s.type === 'big_zombie' ? z.bigTimes : 1;
      game.loot.push({ x: s.x, y: s.y, hp: 1, maxHp: 1, priority: 0, yield: { rot: z.rot * times, bones: z.bones * times }, items: [] });
      dropSettlerLoot(s); // (what it held, as from any that falls, #279)
    }
  }
  game.enemies = game.enemies.filter(en => !crumbled(en));
}

// A corpse on blighted ground rises as a temporary zombie after a while; not one lying by a grave: it's
// there to keep the grave working (#253)
export function raiseOnBlight(dt) {
  if (sides.player.faction !== 'undead') return;
  const r = (GAME_CONFIG.graveWork.nearTiles + 0.5) * TILE_SIZE;
  const graves = game.buildings.filter(b => b.type === 'grave');
  for (const corpse of [...game.corpses]) {
    if (!isBlighted(corpse.x, corpse.y) || graves.some(g => Math.max(Math.abs(corpse.x - g.x), Math.abs(corpse.y - g.y)) <= r)) continue;
    corpse.blightAge = (corpse.blightAge || 0) + dt;
    if (corpse.blightAge >= GAME_CONFIG.blight.riseSeconds) raiseTemporaryZombie(corpse);
  }
}

// (#326) The temporary zombies a necromancer holds now
/** @param {{ id: number }} necro */
export function zombiesOf(necro) {
  return game.settlers.filter(z => z.masterId === necro.id && z.temporary !== undefined && z.hp > 0);
}

// (#326) What lies by a corpse (what it dropped: a weapon, armour, a shield) the new zombie takes up: a weapon
// if it has none (a bow with a quiver of arrows), armour, a shield (a melee one's)
function armFromCorpse(zombie, corpse, reach) {
  const piles = game.loot.filter(p => p.items.length && Math.hypot(p.x - corpse.x, p.y - corpse.y) <= reach);
  for (const pile of piles) {
    for (const key of [...pile.items]) {
      const [category, id] = key.split(':');
      let taken = false;
      if (category === 'weapons' && zombie.weapon === 'fist') {
        zombie.weapon = id; taken = true;
        if (isRangedWeapon(id)) { zombie.quiver = true; zombie.arrows = 15; }
      } else if (category === 'gear' && GAME_CONFIG.gear[id]) {
        if (GAME_CONFIG.gear[id].armorKind) { if (!zombie.armor) { putOnGear(zombie, id); taken = true; } }
        else if (id === 'shield' && !zombie.shield) { zombie.shield = true; taken = true; }
      }
      if (taken) pile.items.splice(pile.items.indexOf(key), 1);
    }
  }
  zombie.role = zombie.weapon === 'fist' ? 'worker' : isRangedWeapon(zombie.weapon) ? 'archer' : 'soldier';
  if (zombie.shield && !canUseShield(zombie)) zombie.shield = false;
  game.loot = game.loot.filter(p => p.items.length || Object.keys(p.yield || {}).length);
}

// A corpse rises as a temporary zombie: no room taken in the colony; it crumbles into rot after
// GAME_CONFIG.temporaryZombie.lifeSeconds (see updateTemporaryZombies). (#326) One raised by a necromancer is
// its own: it keeps by it, is sent where it sends it, and takes up what lies by the corpse
/** @param {any} corpse @param {import('../../../engine/world/types.js').Settler | null} [master] */
export function raiseTemporaryZombie(corpse, master = null) {
  const zombie = createSettler(corpse.big ? 'big_zombie' : 'zombie', Date.now() + rand(), corpse.x, corpse.y);
  zombie.temporary = GAME_CONFIG.temporaryZombie.lifeSeconds;
  if (master) {
    zombie.masterId = master.id;
    armFromCorpse(zombie, corpse, getNecromancy(master).armReach);
    giveSoul(master, corpse);
  }
  game.settlers.push(zombie);
  game.corpses.splice(game.corpses.indexOf(corpse), 1);
  playSound('raise', corpse);
  return zombie;
}

// ---- Souls (#326): each zombie a necromancer raises gives one, which flies into the soul lantern at its side (no
// limit to what it holds); near a grave or the hall they fly out one after another into the stock (souls are no
// thing: they lie in no storage). The flights are only drawn (game.soulFx), the count is kept at once

// A soul from `from` into the lantern of `necro` (none without one: it's lost)
export function giveSoul(necro, from) {
  if (!necro.soul_lantern) return;
  necro.lanternSouls = (necro.lanternSouls || 0) + 1;
  game.soulFx.push({ x: from.x, y: from.y, who: necro, t: 0, dur: GAME_CONFIG.gear.soul_lantern.lantern.flySeconds, kind: 'in' });
}

// Each tick: a lantern near a grave or the hall lets its souls out, one every releaseSeconds
export function tickLanterns(dt) {
  const c = GAME_CONFIG.gear.soul_lantern.lantern, reach = c.nearTiles * TILE_SIZE;
  for (const s of game.settlers) {
    if (!s.soul_lantern || !((s.lanternSouls || 0) > 0)) { s.lanternTimer = 0; continue; }
    const home = game.buildings.find(b => b.type === 'grave' && Math.hypot(b.x - s.x, b.y - s.y) <= reach) ||
      (Math.hypot(townHall.x - s.x, townHall.y - s.y) <= townHall.radius + reach ? townHall : null);
    if (!home) { s.lanternTimer = 0; continue; }
    const timer = (s.lanternTimer || 0) + dt;
    if (timer < c.releaseSeconds) { s.lanternTimer = timer; continue; }
    s.lanternTimer = 0;
    s.lanternSouls = (s.lanternSouls || 0) - 1;
    stock.souls = (stock.souls || 0) + 1;
    game.soulFx.push({ x: s.x, y: s.y, to: { x: home.x, y: home.y }, t: 0, dur: c.flySeconds, kind: 'out' });
  }
  for (const fx of game.soulFx) fx.t += dt;
  if (game.soulFx.length) game.soulFx = game.soulFx.filter(fx => fx.t < fx.dur);
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
  // (while raising it holds on unless a settler is right on it: no stepping back and forth, #232)
  const near = en.raiseTimer > 0 ? 40 : 60;
  if (en.raisesLeft <= 0 || game.settlers.some(s => Math.hypot(s.x - en.x, s.y - en.y) < near)) return false;
  // only corpses no settler (nor the town hall) is close to: going for one by the colony's fighters it was
  // pushed back (necromancerKeepsBack) and came again, twitching to and fro (#232)
  const guarded = c => game.settlers.some(s => Math.hypot(s.x - c.x, s.y - c.y) < GAME_CONFIG.morale.necroCorpseClear) ||
    Math.hypot(townHall.x - c.x, townHall.y - c.y) < townHall.radius + GAME_CONFIG.morale.necroCorpseClear;
  let corpse = null, best = necro.range;
  for (const c of game.corpses) {
    const d = Math.hypot(c.x - en.x, c.y - en.y);
    if (d < best && (!c.raisedBy || c.raisedBy === en) && (c.raisedBy === en || !guarded(c))) { best = d; corpse = c; }
  }
  if (!corpse) return false;
  corpse.raisedBy = en;
  if (best > necro.raiseReach) { // raised from a distance, as the player's (#203)
    moveEntityTowards(en, corpse.x, corpse.y, en.speed, true, dt);
    return true;
  }
  faceTowards(en, corpse.x, corpse.y);
  en.raising = { x: corpse.x, y: corpse.y, until: game.pathTick + 2 }; // its thread (drawRaising)
  en.raiseTimer = (en.raiseTimer || 0) + dt;
  if (en.raiseTimer >= necro.raiseSeconds) {
    en.raiseTimer = 0;
    en.raisesLeft--;
    game.corpses.splice(game.corpses.indexOf(corpse), 1);
    const zombie = createConfiguredEnemy(corpse, corpse.big ? 'undead_big_zombie' : 'undead_zombie');
    zombie.fromWave = en.fromWave;
    zombie.temporary = GAME_CONFIG.temporaryZombie.lifeSeconds; // as the player's
    game.enemies.push(zombie);
    playSound('raise', corpse);
  }
  return true;
}

// The undead's graveyard makes a little bones and rot by itself (graves don't any more: a necromancer works
// them, workGrave, #253); and a grave's rest runs down
export function makeBonesAndRot(dt) {
  const bonesRate = getPlayerFaction().bonesPerSecond;
  if (bonesRate && game.gameMode === 'endless') stock.bones += dt * bonesRate.hall;
  const rotRate = getPlayerFaction().rotPerSecond;
  if (rotRate && game.gameMode === 'endless') stock.rot += dt * rotRate.hall;
  for (const b of game.buildings) if (b.type === 'grave' && (b.rest || 0) > 0) b.rest = (b.rest || 0) - dt;
}

// Blighted zones taken away fade
export function fadeClearedBlight(dt) {
  for (const z of game.blightZones) if (z.clearing !== undefined) z.clearing -= dt;
  if (game.blightZones.some(z => z.clearing <= 0)) game.blightZones = game.blightZones.filter(z => !(z.clearing <= 0));
}
