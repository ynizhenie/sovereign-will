// A raid on an enemy camp (#255): Endless only

export const raidConfig = {
  // the camp: once fromWave waves are beaten, and every everyWaves after, a wave beaten opens a zone with
  // an enemy camp beyond a side of the map for `seconds`. zoneTiles: the zone's size (a square);
  // wallTiles: from the outpost to its palisade (stone from stoneFromWave), with `gaps` ways in;
  // tents (min-max) inside, each calling tentSummons more out once the fight's on; the outpost's hp.
  // defenders: perSoldier for each armed settler of the player's (of its kind, in its armour and with its
  // shield, so an army in armour meets one; perSoldier as a settler is stronger than the enemy of its kind),
  // one more every extraEveryWaves waves, never fewer than min. They hold their posts till a raider comes
  // within guardTiles of it.
  // reward: on top of what the defenders carry, times 1 + rewardPerDefender for each of them.
  // Lost (the whole party down): the next wave in failWaveSeconds; won: the next wave's wait doubled, once.
  // marchSeconds: Attack! can be pressed this long after setting out even with some still on the way
  raid: {
    fromWave: 2, everyWaves: 2, seconds: 150, zoneTiles: 26, wallTiles: 5, gaps: 2, stoneFromWave: 8,
    tents: { min: 1, max: 3 }, tentSummons: 2, outpostHp: 800,
    defenders: { perSoldier: 2, extraEveryWaves: 3, min: 4 },
    guardTiles: 7,
    reward: { wood: 30, stone: 20, iron: 6, leather: 6, food: 25 }, rewardPerDefender: 0.1,
    failWaveSeconds: 15, marchSeconds: 45
  }
};
