
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

// A demon portal opens on a free tile the settlers can reach, anywhere but near the town hall (#43)
function openDemonPortal() {
  const reach = getSettlerReach({ x: townHall.x, y: townHall.y });
  const minDist = getEnemyFaction().minPortalTiles * TILE_SIZE;
  for (let attempt = 0; attempt < 200; attempt++) {
    const gx = BORDER_MARGIN + Math.floor(rand() * (COLS - 2 * BORDER_MARGIN));
    const gy = BORDER_MARGIN + Math.floor(rand() * (ROWS - 2 * BORDER_MARGIN));
    const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
    if (Math.hypot(x - townHall.x, y - townHall.y) < minDist || isTileOccupied(x, y) || getReachSteps(reach, gx, gy) < 0) continue;
    if (enemyTents.some(t => Math.hypot(t.x - x, t.y - y) < 4 * TILE_SIZE)) continue;
    const tents = GAME_CONFIG.enemyTents;
    enemyTents.push({ x, y, hp: tents.hp, maxHp: tents.hp, summonTimer: 0, summonsLeft: tents.summonsPerWave, portal: true });
    return true;
  }
  return false;
}
