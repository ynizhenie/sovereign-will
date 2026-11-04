// A raid on an enemy camp (#255): Endless only

export const raidConfig = {
  // The camp is a small persistent territory on the Endless map, defended by a garrison and centred on one fire.
  // defenders: perSoldier for each armed settler of the player's (of its kind, in its armour and with its
  // shield, so an army in armour meets one; perSoldier as a settler is stronger than the enemy of its kind),
  // one more every extraEveryWaves waves, never fewer than min. They hold their posts till a raider comes
  // within guardTiles of it.
  // reward: on top of what the defenders carry, times 1 + rewardPerDefender for each of them.
  // marchSeconds: how long the party waits for stragglers before entering the camp
  raid: {
    campRadiusTiles: 4, fireFuelPerTend: 4,
    defenders: { perSoldier: 2, extraEveryWaves: 3, min: 4 },
    guardTiles: 7,
    reward: { wood: 30, stone: 20, iron: 6, leather: 6, food: 25 }, rewardPerDefender: 0.1,
    failWaveSeconds: 15, marchSeconds: 45,
    // A scout looks for scoutSeconds before it is spotted (or one of them comes within scoutSeenTiles) and runs home.
    scoutSeconds: 30, scoutSeenTiles: 3,
    // (#279) a shelter pitched in the camp (the faction's tent, grave or den, paid from the stock): built in
    // buildSeconds by one of the party; those within reach heal (healPerSecond) and archers fill their quivers
    // from the arrows the party took (arrowsPerArcher offered for each archer picked); in the auto battle one
    // under woundedShare of its hp goes to it till it's whole again
    shelter: { buildSeconds: 10, healPerSecond: 15, reach: 45, woundedShare: 0.35 },
    arrowsPerArcher: 12
  }
};
