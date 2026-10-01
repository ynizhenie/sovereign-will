import { test, expect } from '@playwright/test';
import { openGame, sim, iconText } from './helpers.mjs';

test('with the town hall full, gathered wood goes to a warehouse; the HUD counts both (#36)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'deliverToWarehouse');
  expect(r.hall).toEqual({ stone: 200 });
  expect(r.warehouse).toEqual({ wood: 3 });
  expect(r.totalWood).toBe(3);
  expect(r.capacity).toBe(100);
});

test('with every storage full, workers rest instead of gathering, and the player is told once (#36)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'everythingFull')).toEqual({ treeStands: true, mostlyIdle: true, warnings: 1 });
});

test('builders fetch the materials from the storage that has them; promised materials are not spent twice (#36)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'buildFromWarehouse')).toEqual({
    placed: 1, secondPlaced: false, woodRightAfter: 8, visitedWarehouse: true, built: true, warehouseWood: 3
  });
});

test('a destroyed warehouse leaves a pile per resource, and workers carry it all to the town hall (#36)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'warehouseDestroyed');
  expect(r.piles).toEqual(['food:4', 'stone:7', 'wood:12']);
  expect(r.onTile).toBe(true);
  expect(r.pilesLeft).toBe(0);
  expect(r.hall).toEqual({ wood: 12, stone: 7, food: 4 });
});

test('tapping a warehouse shows what it holds (#36)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'storagePopup')).toEqual({ shown: true });
  expect(await iconText(page, '#storage-title')).toEqual(['[[warehouse]] Склад']);
  expect(await iconText(page, '#storage-fill')).toEqual(['Заполнено: 15/100']);
  expect(await iconText(page, '#storage-items div')).toEqual(['[[wood]] Дерево: 12', '[[iron]] Железо: 3']);
});
