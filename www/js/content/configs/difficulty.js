// The Endless mode's difficulty levels (#255: two)

export const difficultyConfig = {
  // The difficulty levels, the same in every mode (Endless, Battles, raids). Every enemy is exactly the
  // player's own unit of its kind: its faction's settler type's speed, the damage what it carries does in
  // a settler's hands, a bow's rate of fire. Only the hp differs: enemyHp times the player's own.
  // enemyCount: enemies per wave.
  difficulty: {
    normal: { enemyCount: 0.75, enemyHp: 0.75 },
    hard: { enemyCount: 0.9, enemyHp: 1 }
  }
};
