// Storages (the town hall and warehouses) and what the device remembers
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a warehouse counts as a storage as soon as it is built, and not once it is gone, in the same tick', () => {
  sim.start('storage-cache');
  const { placeBuilding, tileCenter } = sim.helpers;
  const g = getGridPos(townHall.x, townHall.y), at = tileCenter(g.gx + 4, g.gy);
  expect(getStorages()).toEqual([townHall]);
  const warehouse = placeBuilding('warehouse', at.x, at.y);
  expect(getStorages().includes(warehouse)).toBe(true);
  removeBuilding(warehouse);
  expect(getStorages()).toEqual([townHall]);
});

test('saves, maps and settings are kept under the keys they always were', () => {
  saveData('maps', { Lake: { cols: 30 } });
  expect(JSON.parse(localStorage.getItem('sovereign-will-maps'))).toEqual({ Lake: { cols: 30 } });
  localStorage.setItem('sovereign-will-saves', JSON.stringify({ old: 1 }));
  expect(loadData('saves', {})).toEqual({ old: 1 });
  localStorage.setItem('sovereign-will-saves', 'not json');
  expect(loadData('saves', {})).toEqual({});
  saveSetting('fps', '30');
  expect(loadSetting('fps', 'display')).toBe('30');
});
