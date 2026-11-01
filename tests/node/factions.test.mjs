// factions: the game's logic, run in Node (moved from tests/factions.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('units are drawn in their side\'s colour; waves are the enemy faction\'s kinds (#43)', async () => {
  const r = await (() => {
    sides.player.color = '#3498db'; sides.enemy.color = '#9b59b6';
    window.sim.start('faction-colours');
    waveNum = 11; startNextWave();
    const kinds = new Set(enemies.map(en => en.enemyKey));
    return {
      settler: getSettlerColor(), enemyBase: getEnemyColor(null),
      enemyDarkened: getEnemyColor({ type: 'normal' }) === shadeColor(getEnemyColor(null), -0.28),
      bigDarker: getEnemyColor({ type: 'big' }) !== '#9b59b6',
      kindsFromFaction: [...kinds].every(k => getEnemyFaction().enemies.includes(k)), enemies: enemies.length
    };
  })();
  expect(r).toMatchObject({ settler: '#3498db', enemyBase: '#9b59b6', enemyDarkened: true, bigDarker: true, kindsFromFaction: true });
  expect(r.enemies).toBeGreaterThan(0);
});

test('demon units have the same base health as comparable units from other factions', () => {
  expect({
    imp: GAME_CONFIG.settlerTypes.imp.hp,
    demon: GAME_CONFIG.settlerTypes.demon.hp,
    beast: GAME_CONFIG.settlerTypes.beast.hp
  }).toEqual({ imp: 100, demon: 250, beast: 70 });
});

test('a settler type can be limited to some kinds of orders (#133)', async () => {
  const r = await (() => {
    window.sim.start('orders-limited');
    const s = settlers[0];
    s.isPossessed = true; s.tool = 'axe';
    const tree = trees.find(t => !t.isGrowing);
    GAME_CONFIG.settlerTypes.normal.orders = ['attack'];
    const limited = orderPossessed(s, tree.x, tree.y) ? s.order && s.order.kind : null;
    delete GAME_CONFIG.settlerTypes.normal.orders;
    orderPossessed(s, tree.x, tree.y);
    return { limited, free: s.order && s.order.kind };
  })();
  expect(r).toEqual({ limited: 'walk', free: 'harvest' }); // (#326: what it can't do, it walks to)
});

test('soldiers are a shade off the workers, in any colour (#167)', async () => {
  const r = await (() => {
    window.sim.start('soldier-shade');
    return GAME_CONFIG.factionColors.map(color => {
      sides.player.color = color;
      return getSettlerColor({ role: 'worker' }) !== getSettlerColor({ role: 'soldier' }) && getSettlerColor({ role: 'worker' }) === color;
    });
  })();
  expect(r.every(Boolean)).toBe(true);
});
