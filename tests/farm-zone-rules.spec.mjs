import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

test('nothing can be built on a farm zone until the zone is removed (#92)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const g = getGridPos(townHall.x, townHall.y);
    const { x: tx, y: ty } = window.sim.helpers.tileCenter(g.gx + 4, g.gy + 4);
    for (const list of [trees, cacti, boulders, grassList, berryBushes, sticks, pebbles, ironOres, coalOres, naturalRocks, waterTiles]) {
      const i = list.findIndex(o => o.x === tx && o.y === ty); if (i !== -1) list.splice(i, 1);
    }
    desertTiles = desertTiles.filter(d => d.x !== tx || d.y !== ty); beachTiles = beachTiles.filter(d => d.x !== tx || d.y !== ty); desertRegion = null;
    stock.wood = 100;
    toggleFarmZone(tx, ty, 'wheat');
    const zoned = farmZones.length;
    const tap = () => { mouse.x = tx; mouse.y = ty; handleCanvasClick(); };
    setMode('wall_wood'); tap();
    const blockedWhileZoned = blueprints.length === 0;
    setMode('zone_clear'); tap();
    setMode('wall_wood'); tap();
    return { zoned, blockedWhileZoned, builtAfterClearing: blueprints.length === 1 };
  });
  expect(r).toEqual({ zoned: 1, blockedWhileZoned: true, builtAfterClearing: true });
});

test('watering darkens soil while fertilizing adds only scattered granules', async ({ page }) => {
  await openGame(page);
  const visuals = await page.evaluate(() => {
    const fillRect = ctx.fillRect, stroke = ctx.stroke, fill = ctx.fill;
    let current;
    ctx.fillRect = function (...args) {
      if (args[2] === 26 && args[3] === 26) current.soil = this.fillStyle;
      return fillRect.apply(this, args);
    };
    ctx.stroke = function (...args) {
      if (this.strokeStyle === '#79d4de') current.waterMarks++;
      return stroke.apply(this, args);
    };
    ctx.fill = function (...args) {
      if (this.fillStyle === '#e0b56d') current.fertilizerGranules++;
      return fill.apply(this, args);
    };
    const draw = (state, x) => {
      current = { soil: null, waterMarks: 0, fertilizerGranules: 0 };
      drawFarmPlotArt({ x, y: 100, growth: 0, ...state });
      return { ...current };
    };
    try {
      return {
        plain: draw({}, 100),
        watered: draw({ watered: true }, 140),
        fertilized: draw({ fertilized: true }, 180),
        both: draw({ watered: true, fertilized: true }, 220)
      };
    } finally {
      ctx.fillRect = fillRect;
      ctx.stroke = stroke;
      ctx.fill = fill;
    }
  });
  expect(visuals).toEqual({
    plain: { soil: '#5c4033', waterMarks: 0, fertilizerGranules: 0 },
    watered: { soil: '#4a3020', waterMarks: 0, fertilizerGranules: 0 },
    fertilized: { soil: '#5c4033', waterMarks: 0, fertilizerGranules: 8 },
    both: { soil: '#4a3020', waterMarks: 0, fertilizerGranules: 8 }
  });
});

test('ripe rice plots draw rice grains instead of wheat heads', async ({ page }) => {
  await openGame(page);
  const grainColors = await page.evaluate(() => {
    const fill = ctx.fill, colors = [];
    ctx.fill = function (...args) {
      colors.push(this.fillStyle);
      return fill.apply(this, args);
    };
    try {
      drawFarmPlotArt({ x: 100, y: 100, growth: 100, crop: 'wheat' });
      const wheat = [...colors];
      colors.length = 0;
      drawFarmPlotArt({ x: 140, y: 100, growth: 100, crop: 'rice' });
      return { wheat, rice: colors };
    } finally {
      ctx.fill = fill;
    }
  });
  expect(grainColors.wheat).toContain('#f4d03f');
  expect(grainColors.rice).toContain('#e6c85c');
  expect(grainColors.rice).not.toContain('#f4d03f');
});
