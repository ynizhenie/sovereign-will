import { test, expect } from './helpers.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { openGame } from './helpers.mjs';

test('no emoji anywhere in the game: every icon is drawn (#7)', () => {
  const files = ['www/index.html', 'www/css/style.css', ...readdirSync('www/js', { recursive: true }).filter(f => f.endsWith('.js')).map(f => `www/js/${f}`)];
  const found = [];
  for (const file of files) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const emoji = line.match(/\p{Extended_Pictographic}/gu);
      if (emoji) found.push(`${file}:${i + 1} ${emoji.join('')}`);
    });
  }
  expect(found).toEqual([]);
});

test('every icon the config and the texts name has a drawing, and none is left as [[name]] on screen (#7)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const missing = [];
    for (const [category, items] of Object.entries(GAME_CONFIG)) {
      for (const item of Array.isArray(items) ? items : Object.values(items || {})) {
        if (item && typeof item === 'object' && 'icon' in item && !ICONS[item.icon]) missing.push(`${category}.${item.id}: ${item.icon}`);
      }
    }
    for (const tool of EDITOR_TOOLS) if (!ICONS[tool.icon]) missing.push(`editor.${tool.id}: ${tool.icon}`);
    for (const [code, language] of Object.entries(LANGUAGES)) {
      for (const [key, text] of Object.entries(language.text)) {
        for (const [, name] of text.matchAll(/\[\[(\w+)\]\]/g)) if (!ICONS[name]) missing.push(`${code} ${key}: ${name}`);
      }
    }
    return { missing, leftOnScreen: document.body.innerText.includes('[[') };
  });
  expect(r).toEqual({ missing: [], leftOnScreen: false });
  expect(errors).toEqual([]);
});

test('rice zone icon uses a white fill and edge', async ({ page }) => {
  await openGame(page);
  const colors = await page.evaluate(() => {
    const fills = [], strokes = [];
    const originalFill = ctx.fill, originalStroke = ctx.stroke;
    ctx.fill = function (...args) {
      fills.push(String(ctx.fillStyle));
      return originalFill.apply(this, args);
    };
    ctx.stroke = function (...args) {
      strokes.push(String(ctx.strokeStyle));
      return originalStroke.apply(this, args);
    };
    try { ICONS.zone_rice(ctx); } finally { ctx.fill = originalFill; ctx.stroke = originalStroke; }
    return { fills, strokes };
  });
  expect(colors.fills).toContain('rgba(255, 255, 255, 0.45)');
  expect(colors.strokes).toContain('#ffffff');
});
