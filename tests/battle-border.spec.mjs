import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

async function openBattle(page) {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
}

test('ordinary units cannot route through the red battle border, panic units can flee through it', async ({ page }) => {
  await openBattle(page);
  const result = await page.evaluate(() => {
    game.gameMode = 'battle';
    const startX = (BORDER_MARGIN + 6) * TILE_SIZE + 15;
    const y = (BORDER_MARGIN + 6) * TILE_SIZE + 15;
    const targetX = (BORDER_MARGIN - 1) * TILE_SIZE + 15;
    const ordinary = findPathAStar(startX, y, targetX, y);
    const fleeing = findPathAStar(startX, y, targetX, y, false, null, true);
    const enemy = findPathAStar(startX, y, targetX, y, true);
    const fleeingEnemy = findPathAStar(startX, y, targetX, y, true, null, true);
    const isBorder = point => isBorderZone(Math.floor(point.x / TILE_SIZE), Math.floor(point.y / TILE_SIZE));
    const normalUnit = { id: 1, x: startX, y, speed: 1, radius: 11, path: [], pathTarget: null };
    const panicUnit = { id: 2, x: startX, y, speed: 1, radius: 11, path: [], pathTarget: null, panic: true };
    normalUnit.x = targetX; panicUnit.x = targetX;
    const normalCollides = collidesWithWall(targetX, y, normalUnit.radius);
    const panicCollides = collidesWithWall(targetX, y, panicUnit.radius, false, true);
    const enemyCollides = collidesWithWall(targetX, y, normalUnit.radius, true);
    const panicEnemyCollides = collidesWithWall(targetX, y, panicUnit.radius, true, true);
    clampEntityToBounds(normalUnit);
    clampEntityToBounds(panicUnit);
    return {
      normalStaysSafe: ordinary.path.length > 0 && ordinary.path.every(point => !isBorder(point)),
      panicCanRouteOut: fleeing.path.some(isBorder),
      enemyStaysSafe: enemy.path.length > 0 && enemy.path.every(point => !isBorder(point)),
      panicEnemyCanRouteOut: fleeingEnemy.path.some(isBorder),
      normalBlocked: normalCollides && normalUnit.x >= BORDER_MARGIN * TILE_SIZE + normalUnit.radius,
      panicCanCross: !panicCollides && panicUnit.x === targetX,
      enemyBlocked: enemyCollides,
      panicEnemyCanCross: !panicEnemyCollides
    };
  });
  expect(result).toEqual({
    normalStaysSafe: true,
    panicCanRouteOut: true,
    enemyStaysSafe: true,
    panicEnemyCanRouteOut: true,
    normalBlocked: true,
    panicCanCross: true,
    enemyBlocked: true,
    panicEnemyCanCross: true
  });
});

test('enemy camp territory is a red dashed outline without a filled overlay', async ({ page }) => {
  await openGame(page);
  await sim(page, 'campOpens', {});
  const result = await page.evaluate(() => {
    camera.x = enemyCamp.x;
    camera.y = enemyCamp.y;
    const fills = [], rectStrokes = [], strokes = [];
    const fillRect = ctx.fillRect, strokeRect = ctx.strokeRect, stroke = ctx.stroke;
    ctx.fillRect = function (...args) { fills.push(args); return fillRect.apply(this, args); };
    ctx.strokeRect = function (...args) { rectStrokes.push(args); return strokeRect.apply(this, args); };
    ctx.stroke = function (...args) {
      strokes.push({ color: ctx.strokeStyle, dash: ctx.getLineDash() });
      return stroke.apply(this, args);
    };
    try { drawTerritory(); } finally {
      ctx.fillRect = fillRect;
      ctx.strokeRect = strokeRect;
      ctx.stroke = stroke;
    }
    return { fills: fills.length, rectStrokes: rectStrokes.length, redDashed: strokes.some(s =>
      s.color.includes('231, 76, 60') && s.dash.length === 2 && s.dash[0] === 8 && s.dash[1] === 6) };
  });
  expect(result).toEqual({ fills: 0, rectStrokes: 0, redDashed: true });
});
