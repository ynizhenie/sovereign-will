// The Endless mode's difficulty levels

Object.assign(GAME_CONFIG, {
  // the Endless mode's difficulty (main menu): enemies per wave and enemy hp are multiplied by these
  difficulty: {
    easy: { enemyCount: 0.7, enemyHp: 0.8 },
    normal: { enemyCount: 1, enemyHp: 1 },
    hard: { enemyCount: 1.4, enemyHp: 1.3 }
  }
});
