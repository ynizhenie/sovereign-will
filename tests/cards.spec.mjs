import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// Endless with cards (#255): locked till a card opens it, three cards after a wave beaten
const startWithCards = async (page, on = true) => {
  await page.evaluate(on => {
    document.querySelector(`.cards-option[data-cards="${on ? 'on' : 'off'}"]`).click();
    document.getElementById('seed-input').value = 'cards-test';
  }, on);
  await page.click('#play-button');
};

test('off by default: nothing locked (#255)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  expect(await page.evaluate(() => [cardMode, isLocked('buildings', 'watchtower'), isLocked('weapons', 'iron_spear'), document.querySelectorAll('#bottom-panel .locked').length])).toEqual([false, false, false, 0]);
  expect(errors).toEqual([]);
});

test('on: only what it takes to live is open; a locked thing can\'t be built or made (#255)', async ({ page }) => {
  const errors = await openGame(page);
  await startWithCards(page);
  const r = await page.evaluate(() => {
    stock.wood = 500; stock.stone = 500; stock.iron = 500; stock.herbs = 100;
    refreshLocks();
    setMode('watchtower');
    const mode = buildMode;
    const made = makeToStore('weapons', 'spear');
    return {
      open: [isLocked('buildings', 'wall_wood'), isLocked('buildings', 'workshop'), isLocked('tools', 'axe'), isLocked('weapons', 'club')],
      locked: [isLocked('buildings', 'watchtower'), isLocked('weapons', 'spear'), isLocked('gear', 'armor')],
      mode, made, orders: craftOrders.length,
      greyed: !!document.querySelector('#bottom-panel [data-info="buildings:watchtower"].locked .tile-lock'),
      wallGreyed: !!document.querySelector('#bottom-panel [data-info="buildings:wall_wood"].locked')
    };
  });
  expect(r).toEqual({ open: [false, false, false, false], locked: [true, true, true], mode: 'interact', made: false, orders: 0, greyed: true, wallGreyed: false });
  expect(errors).toEqual([]);
});

test('a wave beaten: three cards; the game waits; the one picked opens (#255)', async ({ page }) => {
  const errors = await openGame(page);
  await startWithCards(page);
  // a wave comes: no cards while it's on
  const during = await page.evaluate(() => {
    startNextWave();
    for (let f = 0; f < 10; f++) stepGame(1 / 60);
    return { offer: cardOffer, due: cardsDue };
  });
  expect(during).toEqual({ offer: null, due: 1 });
  // beaten (its enemies and tents down): the cards
  const offer = await page.evaluate(() => {
    enemies.forEach(en => { en.hp = 0; }); enemyTents.length = 0; enemyTentBlueprints.length = 0; portalQueue.length = 0;
    for (let f = 0; f < 5; f++) stepGame(1 / 60);
    const tick = pathTick;
    for (let f = 0; f < 60; f++) stepGame(1 / 60);
    return {
      cards: cardOffer, waited: pathTick === tick,
      shown: [...document.querySelectorAll('#card-offer .card')].map(c => c.className.replace('card card-', ''))
    };
  });
  expect(offer.cards).toHaveLength(3);
  expect(offer.shown.every(r => ['common', 'rare', 'legendary'].includes(r))).toBe(true); // (each by its chance, #279)
  expect(offer.waited).toBe(true);
  // nothing with iron before the smelter, nothing from the smithy before it
  expect(await page.evaluate(() => cardOffer.every(k => { const [c, id] = k.split(':'); return !(GAME_CONFIG[c][id].cost || {}).iron; }))).toBe(true);
  const picked = offer.cards[2];
  await page.click(`#card-offer [data-card="${picked}"]`);
  const after = await page.evaluate(key => {
    const tick = pathTick;
    stepGame(1 / 60);
    refreshLocks();
    const [category, id] = key.split(':');
    return { open: !isLocked(category, id), offer: cardOffer, overlay: !!document.getElementById('card-offer'), runs: pathTick > tick,
      greyed: !!document.querySelector(`#bottom-panel [data-info="${key}"].locked`) };
  }, picked);
  expect(after).toEqual({ open: true, offer: null, overlay: false, runs: true, greyed: false });
  expect(errors).toEqual([]);
});

test('three of each rarity while there are; all open in the end (#255)', async ({ page }) => {
  await openGame(page);
  await startWithCards(page);
  const r = await page.evaluate(() => {
    let rounds = 0;
    for (; rounds < 60; rounds++) {
      const cards = drawCards();
      if (!cards.length) break;
      unlocked[cards[0]] = true;
    }
    const left = ['buildings', 'tools', 'weapons', 'gear'].flatMap(c => Object.values(GAME_CONFIG[c]).filter(i => isForPlayerFaction(i) && isLocked(c, i.id)).map(i => i.id));
    return { rounds, left };
  });
  expect(r.left).toEqual([]);
  expect(r.rounds).toBeGreaterThan(10);
});

test('saved and loaded: what\'s open, and an offer waiting (#255)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => localStorage.removeItem('sovereign-will-saves'));
  await startWithCards(page);
  const saved = await page.evaluate(() => {
    unlocked['buildings:watchtower'] = true;
    cardOffer = drawCards();
    return { data: JSON.stringify(serializeGame()), offer: cardOffer };
  });
  const r = await page.evaluate(data => {
    resetGame(); cardMode = false;
    loadGame(JSON.parse(data));
    return { mode: cardMode, tower: isLocked('buildings', 'watchtower'), spear: isLocked('weapons', 'spear'), offer: cardOffer, overlay: document.querySelectorAll('#card-offer .card').length };
  }, saved.data);
  expect(r).toEqual({ mode: true, tower: false, spear: true, offer: saved.offer, overlay: 3 });
});

test('each card\'s rarity by its chance: three common can come, legendary ones seldom (#279, 40)', async ({ page }) => {
  await openGame(page);
  await startWithCards(page);
  const r = await page.evaluate(() => {
    const count = { common: 0, rare: 0, legendary: 0 }; let allCommon = 0;
    for (let i = 0; i < 400; i++) {
      const cards = drawCards();
      const rs = cards.map(k => GAME_CONFIG.cards.rarity.rare.includes(k) ? 'rare' : GAME_CONFIG.cards.rarity.legendary.includes(k) ? 'legendary' : 'common');
      rs.forEach(x => count[x]++);
      if (rs.every(x => x === 'common')) allCommon++;
    }
    return { count, allCommon, three: drawCards().length };
  });
  expect(r.three).toBe(3);
  expect(r.allCommon).toBeGreaterThan(20);
  expect(r.count.common).toBeGreaterThan(r.count.rare);
  expect(r.count.rare).toBeGreaterThan(r.count.legendary);
});
