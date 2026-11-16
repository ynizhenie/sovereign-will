import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('distant buildings influence a narrow base-zone sector, capped by player territory', () => {
  expect(sim.baseZoneReach({})).toEqual({
    farBuildingInfluencesNarrowSector: true,
    radiusCappedAtTerritory: true,
    boundaryInsideTerritory: true,
    beyondBoundaryOutsideTerritory: true
  });
});
