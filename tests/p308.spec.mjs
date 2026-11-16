import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #308: weather
test('the weather changes by spells, comes on and goes off; rain waters the crops and burns the fires faster; the wind sways the grass; every kind drawn (#308)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const kinds = new Set(), levels = new Set();
    for (let s = 0; s < 7200; s++) { tickWeather(1); kinds.add(weather.kind); levels.add(Math.round(weather.level * 10)); }
    // rain: crops grow as if watered, a fire burns faster
    const grow = wet => {
      weather = { ...weather, kind: wet ? 'rain' : 'clear', level: wet ? 1 : 0, left: 999 };
      const plot = { x: 0, y: 0, growth: 0 }; farmPlots = [plot];
      for (let f = 0; f < 60 * 5; f++) { update(1 / 60); waveTimer = 999; }
      return plot.growth;
    };
    const dry = grow(false), wet = grow(true);
    const fire = { type: 'campfire', x: townHall.x + 90, y: townHall.y, fuelLeft: 5 }; buildings.push(fire);
    tickCampfires(6);
    const burntWet = 5 - fire.fuelLeft;
    weather = { ...weather, kind: 'clear', level: 0 }; fire.fuelLeft = 5; tickCampfires(6);
    const burntDry = 5 - fire.fuelLeft;
    weather = { ...weather, wind: 1 };
    const sways = new Set(Array.from({ length: 20 }, (_, i) => Math.round(windSway(i * 37, 0, 10) * 10)));
    isPaused = true;
    for (const kind of ['rain', 'fog', 'storm']) {
      weather = { ...weather, kind, level: 1, flash: kind === 'storm' ? 1 : 0, bolt: { x: 0.5, seed: 7 } };
      setZoom(99); render(); setZoom(-99); render();
    }
    return { kinds: [...kinds].sort(), ramps: levels.size > 3, wetGrows: wet > dry * 1.2, wetBurns: burntWet > burntDry * 1.2, sways: sways.size > 3 };
  });
  expect(r.kinds.length).toBeGreaterThanOrEqual(3);
  expect(r).toMatchObject({ ramps: true, wetGrows: true, wetBurns: true, sways: true });
  expect(errors).toEqual([]);
});

test('weather spells use their duration ranges and consecutive limits', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    setStartingWeather('clear');
    const sequence = [weather.kind], durations = [{ kind: weather.kind, seconds: weather.left }];
    for (let i = 0; i < 200; i++) {
      weather.left = 0;
      tickWeather(0);
      sequence.push(weather.kind);
      durations.push({ kind: weather.kind, seconds: weather.left });
    }
    const maxRuns = { clear: 0, rain: 0, fog: 0, storm: 0 };
    let previous = null, run = 0;
    for (const kind of sequence) {
      run = kind === previous ? run + 1 : 1;
      previous = kind;
      maxRuns[kind] = Math.max(maxRuns[kind] || 0, run);
    }
    const durationsValid = durations.every(({ kind, seconds }) =>
      kind === 'clear' ? seconds >= 300 && seconds <= 600 : seconds >= 180 && seconds <= 360);
    return { durationsValid, maxClear: maxRuns.clear, maxRain: maxRuns.rain, maxFog: maxRuns.fog, maxStorm: maxRuns.storm };
  });
  expect(result.durationsValid).toBe(true);
  expect(result.maxClear).toBeLessThanOrEqual(5);
  expect(result.maxRain).toBeLessThanOrEqual(2);
  expect(result.maxFog).toBeLessThanOrEqual(2);
  expect(result.maxStorm).toBeLessThanOrEqual(2);
});

test('fog renders as a mottled pale veil rather than round banks (#308)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const texture = await page.evaluate(() => {
    weather = { ...weather, kind: 'fog', level: 1, wind: 0.3 };
    isPaused = true;
    let alpha = null;
    const draw = ctx.drawImage;
    ctx.drawImage = function (...args) {
      const source = args[0];
      if (source.width === 128 && source.height === 128 && args[3] === 900 && args[4] === 900) {
        alpha = source.getContext('2d').getImageData(0, 0, 128, 128).data.filter((_, i) => i % 4 === 3);
      }
      return draw.apply(this, args);
    };
    try { render(); } finally { ctx.drawImage = draw; }
    if (!alpha) return null;
    const values = new Set(alpha);
    return { clear: alpha.some(value => value === 0), covered: alpha.some(value => value > 0), shades: values.size };
  });
  expect(texture).toMatchObject({ clear: true, covered: true });
  expect(texture.shades).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});
