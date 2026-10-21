import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #308: weather
test('the weather changes by spells, comes on and goes off; rain waters the crops and burns the fires faster; the wind sways the grass; every kind drawn (#308)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const kinds = new Set(), levels = new Set();
    for (let s = 0; s < 1800; s++) { tickWeather(1); kinds.add(weather.kind); levels.add(Math.round(weather.level * 10)); }
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
