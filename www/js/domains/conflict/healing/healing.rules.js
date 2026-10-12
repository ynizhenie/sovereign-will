// Shelters: where settlers heal (the humans' tent, the undead's grave)

// A shelter: a building settlers heal at (the humans' tent, the undead's grave, #43)
function isShelter(building) {
  return !!(getDefinition('buildings', building.type) || {}).healPerSecond;
}
