import { test, expect, openGame } from './helpers.mjs';

test('zoomed nature sprites keep their savanna appearance', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const position = { x: townHall.x + 180, y: townHall.y + 180 };
    const originalTiles = game.savannaTiles;
    const originalDrawImage = ctx.drawImage;
    const output = {};
    try {
      for (const kind of ['tree', 'bush', 'grass']) {
        const samples = [];
        ctx.drawImage = image => samples.push(Array.from(image.getContext('2d').getImageData(0, 0, image.width, image.height).data));
        game.savannaTiles = [{ ...position }];
        drawSprites(kind, [position]);
        game.savannaTiles = [];
        drawSprites(kind, [position]);
        output[kind] = samples;
      }
    } finally {
      ctx.drawImage = originalDrawImage;
      game.savannaTiles = originalTiles;
    }
    return output;
  });
  for (const kind of ['tree', 'bush', 'grass']) {
    expect(result[kind]).toHaveLength(2);
    expect(result[kind][0]).not.toEqual(result[kind][1]);
  }
});

test('savanna generation leaves the town hall footprint unchanged', async ({ page }) => {
  await openGame(page);
  const overlap = await page.evaluate(() => {
    setWorldSize(64, 64);
    game.gameMode = 'endless';
    for (const _ of generateMapSteps());
    return game.savannaTiles.some(tile => Math.hypot(tile.x - townHall.x, tile.y - townHall.y) < townHall.radius + TILE_SIZE / 2);
  });
  expect(overlap).toBe(false);
});

test('natural resources stay two tiles away from the town hall', async ({ page }) => {
  await openGame(page);
  const nearby = await page.evaluate(() => {
    setWorldSize(128, 128);
    game.gameMode = 'endless';
    for (const _ of generateMapSteps());
    const hall = getGridPos(townHall.x, townHall.y);
    const nearby = resource => {
      const tile = getGridPos(resource.x, resource.y);
      return Math.abs(tile.gx - hall.gx) <= 2 && Math.abs(tile.gy - hall.gy) <= 2;
    };
    return {
      rocks: naturalRocks.filter(nearby).length,
      water: waterTiles.filter(nearby).length,
      iron: ironOres.filter(nearby).length,
      coal: coalOres.filter(nearby).length
    };
  });
  expect(nearby).toEqual({ rocks: 0, water: 0, iron: 0, coal: 0 });
});

test('natural rocks, ores, and water do not touch tile corners', async ({ page }) => {
  await openGame(page);
  const touches = await page.evaluate(() => {
    setWorldSize(128, 128);
    game.gameMode = 'endless';
    for (const _ of generateMapSteps());
    const contacts = [];
    const water = game.waterTiles.map(tile => `${(tile.x - 15) / TILE_SIZE},${(tile.y - 15) / TILE_SIZE}`);
    const waterSet = new Set(water);
    for (const resource of [...game.naturalRocks, ...game.ironOres, ...game.coalOres]) {
      const gx = (resource.x - 15) / TILE_SIZE, gy = (resource.y - 15) / TILE_SIZE;
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (waterSet.has(`${gx + dx},${gy + dy}`)) contacts.push(`${resource.x},${resource.y}:${gx + dx},${gy + dy}`);
      }
    }
    return contacts;
  });
  expect(touches).toEqual([]);
});

test('naturally spawned apple trees stay out of the savanna', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const oldTrees = game.trees, oldSavanna = game.savannaTiles, share = GAME_CONFIG.appleTrees.share;
    try {
      GAME_CONFIG.appleTrees.share = 1;
      game.trees = [{ x: 120, y: 120 }, { x: 240, y: 120 }];
      game.savannaTiles = [{ x: 120, y: 120 }];
      placeAppleTrees();
      return game.trees.map(tree => !!tree.apple);
    } finally {
      GAME_CONFIG.appleTrees.share = share;
      game.trees = oldTrees;
      game.savannaTiles = oldSavanna;
    }
  });
  expect(result).toEqual([false, true]);
});

test('beach sand still draws over a savanna tile', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const old = {
      water: game.waterTiles, beach: game.beachTiles, savanna: game.savannaTiles,
      rocks: game.naturalRocks, desert: game.desertTiles
    };
    try {
      const water = { x: 450, y: 300 };
      const side = (tileVariantHash(water.x + 1, water.y) % 360) * Math.PI / 180;
      const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      const target = directions.map(([dx, dy]) => ({ x: water.x + dx * TILE_SIZE, y: water.y + dy * TILE_SIZE }))
        .find(tile => {
          let off = Math.abs(Math.atan2(tile.y - water.y, tile.x - water.x) - side) % (Math.PI * 2);
          if (off > Math.PI) off = Math.PI * 2 - off;
          return off <= Math.PI * 0.4;
        });
      if (!target) throw new Error('No beach-facing adjacent tile found');
      game.waterTiles = [water];
      game.beachTiles = [];
      game.savannaTiles = [target];
      game.naturalRocks = [];
      game.desertTiles = [];
      placeBeaches();
      return game.beachTiles.some(tile => tile.x === target.x && tile.y === target.y);
    } finally {
      game.waterTiles = old.water;
      game.beachTiles = old.beach;
      game.savannaTiles = old.savanna;
      game.naturalRocks = old.rocks;
      game.desertTiles = old.desert;
    }
  });
  expect(result).toBe(true);
});

test('ordinary trees and apple trees render with the shared leafy canopy', async ({ page }) => {
  await openGame(page);
  const imageSize = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const g = canvas.getContext('2d');
    for (const tree of [
      { x: 48, y: 48 },
      { x: 48, y: 48, apple: true, applesReady: true }
    ]) drawTreeArt(tree);
    return canvas.toDataURL().length;
  });
  expect(imageSize).toBeGreaterThan(100);
});

test('berry bushes are drawn before trees at close zoom', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const old = { trees: game.trees, bushes: game.berryBushes, stumps: game.stumps, zoom: camera.zoom };
    const position = { x: townHall.x + 150, y: townHall.y + 150 };
    const expected = [], actual = [];
    const originalDrawImage = ctx.drawImage;
    const signature = image => {
      const pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
      let hash = image.width * 31 + image.height;
      for (let i = 0; i < pixels.length; i += 29) hash = (hash * 33 + pixels[i]) | 0;
      return hash;
    };
    try {
      camera.zoom = 2;
      game.trees = [{ ...position, hp: 3, maxHp: 3, isGrowing: false, fallen: false }];
      game.berryBushes = [{ ...position, hp: 3, maxHp: 3 }];
      game.stumps = [];
      ctx.drawImage = function (image, ...args) {
        expected.push(signature(image));
        return originalDrawImage.call(this, image, ...args);
      };
      drawSprites('bush', game.berryBushes);
      drawSprites('tree', game.trees);
      ctx.drawImage = function (image, ...args) {
        actual.push(signature(image));
        return originalDrawImage.call(this, image, ...args);
      };
      drawTrees();
      for (const tree of depthSortedTrees()) drawDepthTree(tree);
      return { expected, actual };
    } finally {
      ctx.drawImage = originalDrawImage;
      game.trees = old.trees;
      game.berryBushes = old.bushes;
      game.stumps = old.stumps;
      camera.zoom = old.zoom;
    }
  });
  expect(result.actual).toEqual(result.expected);
});

test('ordinary, apple, and savanna trees each have two distinct visual variants', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const g = canvas.getContext('2d');
    const samples = [];
    paintOn(g);
    try {
      for (const tree of [
        { x: 40, y: 42 },
        { x: 40, y: 42, apple: true, applesReady: true },
        { x: 40, y: 42, savanna: true }
      ]) {
        const variants = [];
        for (const variant of [0, 1]) {
          g.clearRect(0, 0, canvas.width, canvas.height);
          paintVariant(variant, false);
          drawTreeArt(tree);
          variants.push(Array.from(g.getImageData(0, 0, canvas.width, canvas.height).data));
        }
        samples.push(variants[0].some((value, i) => value !== variants[1][i]));
      }
    } finally {
      paintVariant(null);
      paintOn(null);
    }
    return samples;
  });
  expect(result).toEqual([true, true, true]);
});

test('apple trees have a distinct crown from ordinary trees', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const g = canvas.getContext('2d');
    const images = [];
    paintOn(g);
    try {
      for (const tree of [{ x: 40, y: 42 }, { x: 40, y: 42, apple: true }]) {
        g.clearRect(0, 0, canvas.width, canvas.height);
        paintVariant(0, false);
        drawTreeArt(tree);
        images.push(Array.from(g.getImageData(0, 0, canvas.width, canvas.height).data));
      }
    } finally {
      paintVariant(null);
      paintOn(null);
    }
    return images[0].some((value, i) => value !== images[1][i]);
  });
  expect(result).toBe(true);
});

test('the second ordinary tree variant covers its upper-left branch with foliage', async ({ page }) => {
  await openGame(page);
  const pixel = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const g = canvas.getContext('2d');
    paintOn(g);
    try {
      paintVariant(1, false);
      drawTreeArt({ x: 40, y: 42 });
      return Array.from(g.getImageData(27, 24, 1, 1).data).slice(0, 3);
    } finally {
      paintVariant(null);
      paintOn(null);
    }
  });
  expect(pixel).not.toEqual([0x5d, 0x40, 0x37]);
});

test('trees and moving creatures are drawn in depth order', async ({ page }) => {
  await openGame(page);
  const order = await page.evaluate(() => {
    const drawn = [];
    drawDepthSorted([
      { depth: 120, order: 0, draw: () => drawn.push('tree in front') },
      { depth: 108, order: 2, draw: () => drawn.push('settler behind') },
      { depth: 114, order: 1, draw: () => drawn.push('boar') },
      { depth: 120, order: 2, draw: () => drawn.push('settler in front') }
    ]);
    return drawn;
  });
  expect(order).toEqual(['settler behind', 'boar', 'tree in front', 'settler in front']);
});

test('harvestable grass uses muted colors that match each biome', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const g = canvas.getContext('2d');
    const originalSavanna = game.savannaTiles;
    const position = { x: 40, y: 42 };
    const renderGrass = tree => {
      g.clearRect(0, 0, canvas.width, canvas.height);
      paintVariant(0, false, 0);
      drawGrassArt(tree);
      return Array.from(g.getImageData(0, 0, canvas.width, canvas.height).data);
    };
    paintOn(g);
    try {
      game.savannaTiles = [];
      const grassland = renderGrass(position);
      game.savannaTiles = [position];
      const savanna = renderGrass(position);
      return { grassland, savanna };
    } finally {
      game.savannaTiles = originalSavanna;
      paintVariant(null);
      paintOn(null);
    }
  });
  const isMuted = pixels => {
    let saturation = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (!max) continue;
      saturation += (max - Math.min(pixels[i], pixels[i + 1], pixels[i + 2])) / max;
      count++;
    }
    return saturation / count < 0.5;
  };
  expect(result.grassland).not.toEqual(result.savanna);
  expect(isMuted(result.grassland)).toBe(true);
  expect(isMuted(result.savanna)).toBe(true);
});
