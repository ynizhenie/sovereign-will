// Blood, arrows, flames and the target mark

// Blood on the blade of the held item, fading (see bleed)
function drawWeaponBlood(unit) {
  const alpha = bloodAlpha(unit.weaponBloodAge);
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(120, 0, 0, ${0.85 * alpha})`;
  ctx.fillRect(14, -2, 7, 4);
}

// Blood on a hurt unit's body: a few blotches at spots fixed per unit; stays while badly wounded
function drawBodyBlood(unit, radius) {
  const alpha = bodyBloodAlpha(unit);
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(110, 0, 0, ${0.8 * alpha})`;
  const h = tileVariantHash(Math.round(unit.id || unit.maxHp || 1), 7);
  for (let i = 0; i < 3; i++) {
    const a = ((h >>> (i * 5)) % 360) * Math.PI / 180, d = radius * 0.45;
    ctx.beginPath(); ctx.arc(unit.x + Math.cos(a) * d, unit.y + Math.sin(a) * d, 2.2 + i * 0.6, 0, Math.PI * 2); ctx.fill();
  }
}

// An arrow in flight: a shaft along its way, a grey head, pale fletching (enemies' red)
function drawArrow(proj) {
  ctx.save();
  ctx.translate(proj.x, proj.y);
  ctx.rotate(Math.atan2(proj.vy, proj.vx));
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-9, -0.75, 13, 1.5);
  ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(3, -2.5); ctx.lineTo(3, 2.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = proj.fromEnemy ? '#e74c3c' : '#ecf0f1';
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12, -2.5); ctx.lineTo(-7, 0); ctx.lineTo(-12, 2.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Flames licking up a burning unit (#165)
function drawBurning(x, y, r) {
  const flicker = Math.sin(game.pathTick * 0.5) * 2;
  ctx.fillStyle = 'rgba(230, 126, 34, 0.85)';
  ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.quadraticCurveTo(x, y - r * 1.6 - flicker, x + r * 0.6, y); ctx.fill();
  ctx.fillStyle = 'rgba(241, 196, 15, 0.9)';
  ctx.beginPath(); ctx.moveTo(x - r * 0.3, y); ctx.quadraticCurveTo(x, y - r - flicker, x + r * 0.3, y); ctx.fill();
}

// Enemy the player marked as a priority target: a red reticle
function drawTargetMark(en) {
  const r = en.radius + 6;
  ctx.strokeStyle = '#ff5c5c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(en.x, en.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(en.x - r - 4, en.y); ctx.lineTo(en.x - r + 3, en.y);
  ctx.moveTo(en.x + r - 3, en.y); ctx.lineTo(en.x + r + 4, en.y);
  ctx.moveTo(en.x, en.y - r - 4); ctx.lineTo(en.x, en.y - r + 3);
  ctx.moveTo(en.x, en.y + r - 3); ctx.lineTo(en.x, en.y + r + 4);
  ctx.stroke();
}

// Blood on the ground, and footprints out of blood or dung
function drawBloodOnGround() {
  game.bloodSplats.forEach(b => {
    const rgb = b.color === 'dung' ? '92, 64, 26' : '100, 0, 0';
    ctx.fillStyle = `rgba(${rgb}, ${0.55 * bloodAlpha(b.age)})`;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * 1.3, b.r, 0, 0, Math.PI * 2); ctx.fill();
  });
}

// Corpses: grey, fading out over their last 10 seconds; worms on them
function drawCorpses() {
  game.corpses.forEach(c => {
    const left = GAME_CONFIG.corpses.seconds - c.age;
    ctx.globalAlpha = Math.max(0, Math.min(1, left / 10)) * 0.9;
    ctx.fillStyle = c.side === 'enemy' ? '#6e6e6e' : '#8a8a8a';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 2; ctx.stroke();
    // a cross for the eyes
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.5;
    for (const ex of [-4, 4]) {
      ctx.beginPath(); ctx.moveTo(c.x + ex - 2, c.y - 4); ctx.lineTo(c.x + ex + 2, c.y); ctx.moveTo(c.x + ex + 2, c.y - 4); ctx.lineTo(c.x + ex - 2, c.y); ctx.stroke();
    }
    if (corpseHasWorms(c)) {
      // worms: a few pink squiggles on it
      ctx.strokeStyle = '#e91e63'; ctx.lineWidth = 1.5;
      for (const [wx, wy] of [[-5, 4], [3, 6], [5, -3]]) {
        ctx.beginPath(); ctx.moveTo(c.x + wx - 3, c.y + wy); ctx.quadraticCurveTo(c.x + wx, c.y + wy - 3, c.x + wx + 3, c.y + wy); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  });
}

// Arrows and fireballs in flight
function drawProjectiles() {
  game.projectiles.forEach(proj => {
    // fireballs (#43) bigger and orange; everything else is an arrow, pointing where it flies (#173)
    if (proj.fire) { ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f1c40f'; }
    else { drawArrow(proj); return; }
    ctx.beginPath(); ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2); ctx.fill();
  });
}
