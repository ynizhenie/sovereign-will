// The necromancer's staff

// A necromancer's staff, a pale purple orb at its top (#43)
function drawStaff() {
  ctx.fillStyle = '#6d4520'; ctx.fillRect(4, -1, 20, 3);
  ctx.fillStyle = '#bb8fce'; ctx.beginPath(); ctx.arc(25, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8daef'; ctx.beginPath(); ctx.arc(24, -1, 1.5, 0, Math.PI * 2); ctx.fill();
}

// The undead's blighted ground (#164), and ground marked for it (while the Blight tab is open)
function drawBlight() {
  const fading = new Map(game.blightZones.filter(z => z.clearing !== undefined).map(z => [`${z.x},${z.y}`, z.clearing / GAME_CONFIG.blight.clearSeconds]));
  const blight = updateBlightCache();
  for (const key of blight.keys) {
    const [bx, by] = key.split(',').map(Number);
    const share = blight.base.has(key) ? 1 : (fading.get(key) ?? 1);
    ctx.fillStyle = `rgba(74, 35, 90, ${0.28 * Math.max(0, share)})`;
    ctx.fillRect(bx - 15, by - 15, TILE_SIZE, TILE_SIZE);
  }
  if (activeTab === 'tab-blight') game.blightZones.forEach(z => {
    if (z.done) return;
    ctx.strokeStyle = 'rgba(187, 143, 206, 0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(z.x - 13.5, z.y - 13.5, TILE_SIZE - 3, TILE_SIZE - 3);
  });
}
