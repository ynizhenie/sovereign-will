// The Endless mode's difficulty levels (#255: two)

export const difficultyConfig = {
  // the Endless mode's difficulty (main menu): enemies per wave and enemy hp are multiplied by these.
  // likePlayer: each enemy is as strong as the player's own unit of its kind would be (its faction's small
  // or big settler type's hp and speed, the damage its weapon deals in a settler's hands, a bow's rate of
  // fire), never weaker than it already is
  difficulty: {
    normal: { enemyCount: 1, enemyHp: 1 },
    hard: { enemyCount: 1, enemyHp: 1, likePlayer: true }
  }
};
