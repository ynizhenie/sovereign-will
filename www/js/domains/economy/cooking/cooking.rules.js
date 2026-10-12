// Campfires

// A lit campfire burns down when nobody cooks at it
function tickCampfires(dt) {
  buildings.forEach(b => { if (b.type === 'campfire' && b.burning > 0) b.burning = Math.max(0, b.burning - dt); });
}
