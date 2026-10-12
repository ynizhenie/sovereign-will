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
