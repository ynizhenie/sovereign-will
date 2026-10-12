// The necromancer's staff

// A necromancer's staff, a pale purple orb at its top (#43)
function drawStaff() {
  ctx.fillStyle = '#6d4520'; ctx.fillRect(4, -1, 20, 3);
  ctx.fillStyle = '#bb8fce'; ctx.beginPath(); ctx.arc(25, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8daef'; ctx.beginPath(); ctx.arc(24, -1, 1.5, 0, Math.PI * 2); ctx.fill();
}
