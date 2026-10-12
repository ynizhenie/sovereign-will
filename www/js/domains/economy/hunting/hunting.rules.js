// Boars: hurt, they run (and hide in the bushes)

// sourceX/Y: what it's fleeing from. seekHide: also head for a bush to hide in once out of danger
// (only when attacked, not when merely startled by a settler walking close — see boars.forEach in update()).
// Run from (sourceX, sourceY): a sprint to hide in grass when hit, or (wary) a slower back-off when a
// settler just comes close. Never into the strip along the map edge, where it would get cornered.
// A blow or an arrow (#172): the boar bleeds (on itself and the ground), sometimes leaves dung out of
// fright, and runs; killed, it drops as a carcass for `collector` to butcher (see huntBoar)
function woundBoar(boar, damage, attacker, fromX, fromY) {
  boar.hp -= damage;
  bleed(boar, attacker);
  playSound('boar', boar);
  if (rand() < GAME_CONFIG.mapResources.boar.dungChance) dung.push({ x: boar.x, y: boar.y, age: 0, by: null, byLeft: true });
  if (boar.hp > 0) { makeBoarFlee(boar, fromX, fromY); return; }
  Object.assign(boar, { isCarcass: true, collector: attacker || null, fleeTimer: 0, hideTarget: null, hidden: false, butcher: 0 });
}

function makeBoarFlee(boar, sourceX, sourceY, seekHide = true, wary = false) {
  // already running: only a hit turns a wary back-off into a sprint
  if ((boar.fleeTimer || 0) > 0 && (wary || boar.sprinting)) return;

  let dx = boar.x - sourceX;
  let dy = boar.y - sourceY;
  let distance = Math.hypot(dx, dy);
  if (distance === 0) {
    let angle = rand() * Math.PI * 2;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distance = 1;
  }

  let fleeDistance = 80 + rand() * 60;
  const def = GAME_CONFIG.mapResources.boar;
  boar.fleeTimer = 1.2;
  boar.fleeSpeed = wary ? def.waryFleeSpeed : def.fleeSpeed;
  boar.sprinting = !wary;
  boar.hideTarget = null;

  let nearbyGrass = seekHide ? grassList.filter(grass => Math.hypot(grass.x - boar.x, grass.y - boar.y) <= 360) : [];
  let hideGrass = nearbyGrass.length > 0 ? nearbyGrass : (seekHide ? grassList : []);
  if (hideGrass.length > 0) {
    boar.hideTarget = hideGrass.reduce((nearest, grass) => {
      let nearestDistance = Math.hypot(nearest.x - boar.x, nearest.y - boar.y);
      let grassDistance = Math.hypot(grass.x - boar.x, grass.y - boar.y);
      return grassDistance < nearestDistance ? grass : nearest;
    });
    boar.targetX = boar.hideTarget.x;
    boar.targetY = boar.hideTarget.y;
  } else {
    const edge = (BORDER_MARGIN + 1) * TILE_SIZE;
    boar.targetX = Math.max(edge, Math.min(WORLD_WIDTH - edge, boar.x + dx / distance * fleeDistance));
    boar.targetY = Math.max(edge, Math.min(WORLD_HEIGHT - edge, boar.y + dy / distance * fleeDistance));
  }
}

// A new boar every 25 s while there are fewer than BOAR_LIMIT
function tickBoarRespawn(dt) {
  if (boars.length < BOAR_LIMIT) {
    boarRespawnTimer -= dt;
    if (boarRespawnTimer <= 0) {
      spawnResource('boar');
      boarRespawnTimer = 25;
    }
  } else {
    boarRespawnTimer = 25;
  }
}

// Boars: hide in the grass, run from settlers that come near, wander
function tickBoars(dt) {
  boars.forEach(b => {
    if (b.bloodAge !== undefined) b.bloodAge += dt;
    if (b.isCarcass) return;

    if (b.hidden) {
      b.hideTimer -= dt;
      if (b.hideTimer <= 0) {
        b.hidden = false;
        b.hideTarget = null;
        b.wanderTimer = 0;
      }
      return;
    }

    if (b.fleeTimer > 0) b.fleeTimer -= dt;

    if ((b.fleeTimer || 0) <= 0 && !b.hideTarget) {
      let nearest = null, nearestDist = Infinity;
      settlers.forEach(s => {
        let d = Math.hypot(s.x - b.x, s.y - b.y);
        if (d < nearestDist) { nearestDist = d; nearest = s; }
      });
      if (nearest && nearestDist <= GAME_CONFIG.mapResources.boar.wary) makeBoarFlee(b, nearest.x, nearest.y, false, true);
    }

    if (b.hideTarget) {
      if (!grassList.includes(b.hideTarget)) {
        b.hideTarget = null;
      } else {
        let hideDistance = Math.hypot(b.hideTarget.x - b.x, b.hideTarget.y - b.y);
        if (hideDistance <= 18) {
          b.x = b.hideTarget.x;
          b.y = b.hideTarget.y;
          b.hidden = true;
          b.hideTimer = 2;
          b.fleeTimer = 0;
          invalidateAllPaths();
          return;
        }
        let hideDx = (b.hideTarget.x - b.x) / hideDistance;
        let hideDy = (b.hideTarget.y - b.y) / hideDistance;
        let hideSpeed = (b.fleeSpeed || 1.35) * GAME_CONFIG.movementScale;
        if (!collidesWithWall(b.x + hideDx * hideSpeed, b.y + hideDy * hideSpeed, 12) &&
            !collidesWithWater(b.x + hideDx * hideSpeed, b.y + hideDy * hideSpeed, 12)) {
          b.x += hideDx * hideSpeed;
          b.y += hideDy * hideSpeed;
        } else {
          b.hideTarget = null;
          b.fleeTimer = 0;
        }
        return;
      }
    }

    b.wanderTimer = (b.wanderTimer || 0) + dt;
    if ((b.fleeTimer || 0) <= 0 && b.wanderTimer >= (b.wanderInterval || 4.0)) {
      b.wanderTimer = 0;
      b.wanderInterval = 3 + rand() * 3;
      let ang = rand() * Math.PI * 2;
      let dist = 15 + rand() * 35;
      b.targetX = Math.max(60, Math.min(WORLD_WIDTH - 60, b.x + Math.cos(ang) * dist));
      b.targetY = Math.max(60, Math.min(WORLD_HEIGHT - 60, b.y + Math.sin(ang) * dist));
    }
    let dx = (b.targetX !== undefined ? b.targetX : b.x) - b.x;
    let dy = (b.targetY !== undefined ? b.targetY : b.y) - b.y;
    let dist = Math.hypot(dx, dy);
    if (dist > 2) {
      let speed = (b.fleeTimer > 0 ? (b.fleeSpeed || 0.65) : 0.3) * GAME_CONFIG.movementScale;
      let vx = (dx / dist) * speed;
      let vy = (dy / dist) * speed;
      if (!collidesWithWall(b.x + vx, b.y + vy, 12) && !collidesWithWater(b.x + vx, b.y + vy, 12)) {
        b.x += vx;
        b.y += vy;
      } else {
        b.wanderTimer = b.wanderInterval || 4.0;
        if (b.fleeTimer > 0) b.fleeTimer = 0;
      }
    }
  });
}
