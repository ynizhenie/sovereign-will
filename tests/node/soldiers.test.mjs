// soldiers: the game's logic, run in Node (moved from tests/soldiers.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('with fewer soldiers than two squads, each stands at a post of its own (#155)', async () => {
  expect(await sim.soldiersSingles()).toEqual({ posts: 4, slots: [0, 0, 0, 0] });
});

test('an enemy close to the base is gone for, however far from the posts (#155)', async () => {
  expect(await sim.soldiersNearBase()).toEqual({ farFromPosts: true, engaged: true });
});

test('archers climb a tower ahead of a wave with their own arrows, and stay up when enemies reach the hall (#155)', async () => {
  expect(await sim.soldiersTower()).toEqual({ up: true, stillUp: true, shotAt: true });
});

test('an enemy the player points at draws three soldiers, not all of them (#155)', async () => {
  expect(await sim.soldiersMarked()).toEqual({ goingForIt: 3 });
});

test('enemies break the wall in front of them rather than walk round to a far door, and walk over spikes (#155)', async () => {
  expect(await sim.soldiersWayIn({ ring: 'walls' })).toMatchObject({ throughWall: true, viaDoor: false });
  expect(await sim.soldiersWayIn({ ring: 'spikes' })).toMatchObject({ overSpikes: true });
});

test('tapping an enemy at a damaged wall, next to a soldier, marks it: not the wall\'s repair, not the soldier (#202)', () => {
  const r = (() => {
    const { makeSettler, placeBuilding, clearResources, tileCenter } = window.sim.helpers;
    window.sim.start('mark-at-wall');
    clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const at = tileCenter(g.gx + 5, g.gy);
    const wall = placeBuilding('wall_wood', at.x, at.y);
    wall.hp = wall.maxHp / 2;
    const en = createConfiguredEnemy({ x: at.x + 12, y: at.y }, 'raider'); // breaking the wall, over its tile
    const soldier = makeSettler(1, en.x + 22, en.y, { weapon: 'sword', role: 'soldier' });
    settlers = [soldier]; enemies = [en]; selectedSettler = null;
    setMode('interact');
    mouse.x = en.x - 4; mouse.y = en.y; // on the wall's tile too
    handleCanvasClick();
    return { marked: !!en.markedTarget, repair: !!wall.repairRequested, selected: selectedSettler === soldier };
  })();
  expect(r).toEqual({ marked: true, repair: false, selected: false });
});

test('a tap on an enemy tent marks it: three soldiers leave their posts and destroy it, before the nearer one (#203)', async () => {
  expect(await sim.soldiersMarkedTent()).toEqual({ marked: true, alert: true, going: 3, farDestroyed: true, nearStands: true });
});
