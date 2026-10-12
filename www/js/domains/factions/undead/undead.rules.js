// The undead: necromancy from the staff, blighted ground, raised zombies that crumble, the enemy's necromancer

// The necromancy a settler has from what it holds (the undead's staff, #164), or null
function getNecromancy(s) {
  return (getDefinition('tools', s.tool) || {}).necromancer || null;
}

// Blighted ground (#164): round the undead's graveyard and graves (`base`), and marked ground a
// necromancer has blighted. Worked out once per tick; tile keys 'x,y'.
let blightCache = { key: '', keys: new Set(), base: new Set() };

function updateBlightCache() {
  const cacheKey = `${pathTick}|${sides.player.faction}|${gameMode}|${buildings.length}|${blightZones.filter(z => z.done).length}|${townHall.x},${townHall.y}`;
  if (blightCache.key === cacheKey) return blightCache;
  const base = new Set();
  if (sides.player.faction === 'undead' && gameMode === 'endless') {
    const b = GAME_CONFIG.blight;
    // the tiles from (gx0, gy0) to (gx1, gy1) and r more on every side
    const around = (gx0, gy0, gx1, gy1, r) => {
      for (let gy = gy0 - r; gy <= gy1 + r; gy++) for (let gx = gx0 - r; gx <= gx1 + r; gx++) {
        if (!isBorderZone(gx, gy)) base.add(`${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`);
      }
    };
    // the graveyard stands on the 2×2 tiles round its centre, a tile corner (#186: as far on every side)
    const hx = Math.round(townHall.x / TILE_SIZE), hy = Math.round(townHall.y / TILE_SIZE);
    around(hx - 1, hy - 1, hx, hy, b.hallTiles);
    for (const grave of buildings) {
      if (grave.type !== 'grave') continue;
      const g = getGridPos(grave.x, grave.y);
      around(g.gx, g.gy, g.gx, g.gy, b.graveTiles);
    }
  }
  const keys = new Set(base);
  if (base.size) for (const z of blightZones) if (z.done) keys.add(`${z.x},${z.y}`);
  blightCache = { key: cacheKey, keys, base };
  return blightCache;
}

function getBlightKeys() {
  return updateBlightCache().keys;
}

// A tile blighted round the graveyard or a grave, not by a necromancer (no zone can be marked there, #186)
function isBaseBlighted(x, y) {
  return updateBlightCache().base.has(`${x},${y}`);
}

function isBlighted(x, y) {
  const g = getGridPos(x, y);
  return getBlightKeys().has(`${g.gx * TILE_SIZE + 15},${g.gy * TILE_SIZE + 15}`);
}

// Mark tile (x, y) as a farm zone for `crop` ('wheat' / 'sapling'), or unmark it: tapping a tile
// already in that zone, or with crop 'clear'. See canBeFarmZone for where it can go.
// A marked tile not blighted yet goes at once; blighted ground fades over clearSeconds (still blighted till
// then), and a tap while it fades keeps it. Ground blighted round the graveyard or a grave takes no mark (#186).
function toggleBlightZone(x, y, gx, gy, clearOnly) {
  const existing = blightZones.find(z => z.x === x && z.y === y);
  if (existing) {
    if (!existing.done) blightZones.splice(blightZones.indexOf(existing), 1);
    else if (existing.clearing === undefined) existing.clearing = GAME_CONFIG.blight.clearSeconds;
    else if (!clearOnly) delete existing.clearing;
    return;
  }
  if (clearOnly || isBorderZone(gx, gy) || isTileBlockedForSettler(gx, gy)) return;
  if (isBaseBlighted(x, y)) { showNotification(t('blight.already'), true); return; }
  blightZones.push({ x, y, done: false });
}

// Raised zombies crumble when their time is up (#164, #175); the player's leave rot behind
function updateTemporaryZombies(dt) {
  // gone at once: no corpse, no reward, and nothing can heal them back (a necromancer would)
  const crumbled = unit => unit.temporary !== undefined && (unit.temporary -= dt) <= 0;
  const gone = settlers.filter(crumbled);
  if (gone.length) {
    settlers = settlers.filter(s => !gone.includes(s));
    if (gone.includes(selectedSettler)) selectedSettler = null;
    stock.rot += gone.length * GAME_CONFIG.temporaryZombie.rot;
  }
  enemies = enemies.filter(en => !crumbled(en));
}

// A corpse on blighted ground rises as a temporary zombie after a while (#164)
function raiseOnBlight(dt) {
  if (sides.player.faction !== 'undead') return;
  for (const corpse of [...corpses]) {
    if (!isBlighted(corpse.x, corpse.y)) continue;
    corpse.blightAge = (corpse.blightAge || 0) + dt;
    if (corpse.blightAge >= GAME_CONFIG.blight.riseSeconds) raiseTemporaryZombie(corpse);
  }
}

// A corpse rises as a temporary zombie (#164): no room taken in the colony; it crumbles into rot after
// GAME_CONFIG.temporaryZombie.lifeSeconds (see updateTemporaryZombies)
function raiseTemporaryZombie(corpse) {
  const zombie = createSettler(corpse.big ? 'big_zombie' : 'zombie', Date.now() + rand(), corpse.x, corpse.y);
  zombie.temporary = GAME_CONFIG.temporaryZombie.lifeSeconds;
  settlers.push(zombie);
  corpses.splice(corpses.indexOf(corpse), 1);
  return zombie;
}

// An enemy necromancer (#43): heals the wounded enemies around it as it goes; with no settler close by
// it walks to a corpse within range and raises it into a zombie (a big corpse: a big zombie), as many
// times as it has raises. True while it's busy raising (it does nothing else then).
function enemyNecromancy(en, necro, dt) {
  if (en.raisesLeft === undefined) en.raisesLeft = necro.raises;
  for (const other of enemies) {
    if (other !== en && other.hp < other.maxHp && Math.hypot(other.x - en.x, other.y - en.y) < necro.healRange) {
      other.hp = Math.min(other.maxHp, other.hp + necro.healPerSecond * dt);
    }
  }
  if (en.raisesLeft <= 0 || settlers.some(s => Math.hypot(s.x - en.x, s.y - en.y) < 60)) return false;
  let corpse = null, best = necro.range;
  for (const c of corpses) {
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
    corpses.splice(corpses.indexOf(corpse), 1);
    const zombie = createConfiguredEnemy(corpse, corpse.big ? 'undead_big_zombie' : 'undead_zombie');
    zombie.fromWave = en.fromWave;
    zombie.temporary = GAME_CONFIG.temporaryZombie.lifeSeconds; // as the player's (#175)
    enemies.push(zombie);
  }
  return true;
}
