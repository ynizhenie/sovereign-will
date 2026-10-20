// Voices (#252): now and then a settler (or an enemy) says something about what's happening, a phrase of its
// faction's in the game's language (voice.<faction>.<event>, a few to pick from, split by '|') in a bubble
// over its head, in a voice of its own: syllables that sound like speech but are no language, pitched by
// what it is (a giant low, an imp squeaky, a demon growling, a zombie groaning). Not a chatter: a phrase at
// most every globalGap seconds, the same one speaking at most every ownGap.

import { game } from '../../../engine/world/index.js';
import { GAME_CONFIG } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { playSound } from '../../../app/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../factions/index.js';
import { isNight } from '../../world/index.js';

const VOICE = { globalGap: 2.5, ownGap: 12, showTicks: 150, storyEvery: 20 };
// how each kind sounds: pitch (Hz), and a growl under it
const PITCH = { normal: [210, false], big: [120, false], imp: [380, false], demon: [95, true], zombie: [150, true], big_zombie: [95, true] };
let lastSpoke = -Infinity;
let clock = 1000; // seconds of game played (tickVoices): the gaps are in game time, not stopped by a pause

// The voice of a unit: by its kind, an enemy's by its look
function voiceOf(unit) {
  const kind = unit.enemyKey ? (unit.type === 'big' ? (unit.enemyKey.startsWith('undead_') ? 'big_zombie' : unit.enemyKey.startsWith('demon_') ? 'demon' : 'big')
    : unit.enemyKey.startsWith('undead_') ? 'zombie' : unit.enemyKey.startsWith('demon_') ? 'imp' : 'normal') : unit.type;
  return PITCH[kind] || PITCH.normal;
}

// A unit says something for `event` of `faction` ('humans', 'demons', 'undead'): true if it spoke. urgent
// (a wave, badly hurt) waits less for others
export function speak(unit, faction, event, urgent = false) {
  if (!unit || game.gameMode === 'editor') return false;
  const now = clock;
  if (now - lastSpoke < (urgent ? VOICE.globalGap / 2 : VOICE.globalGap)) return false;
  if (now - (unit.spokeAt || -Infinity) < VOICE.ownGap) return false;
  const key = `voice.${faction}.${event}`, phrases = t(key);
  if (!phrases || phrases === key) return false;
  const list = phrases.split('|');
  return voice(unit, list[Math.floor(Math.random() * list.length)]);
}

// What it says, shown and heard
function voice(unit, text) {
  const now = clock;
  unit.say = { text, until: game.pathTick + VOICE.showTicks * (text.length > 34 ? 1.6 : 1) };
  unit.spokeAt = now;
  lastSpoke = now;
  const [pitch, rough] = voiceOf(unit);
  playSound('voice', unit, pitch, Math.max(2, Math.min(6, Math.round(text.length / 5))), rough);
  return true;
}

// One of them, at random, says it
export function someoneSays(units, faction, event, urgent = false) {
  const pick = units.filter(u => u.hp > 0);
  if (!pick.length) return false;
  return speak(pick[Math.floor(Math.random() * pick.length)], faction, event, urgent);
}

// A bubble with what it says, over its head (top: the top of its head)
export function drawSpeech(ctx, unit, top) {
  if (!unit.say || unit.say.until < game.pathTick) return;
  ctx.font = 'bold 8px sans-serif';
  // a long one (a story by the fire, #279) on two lines, broken at a space near its middle
  const full = unit.say.text.length > 70 ? `${unit.say.text.slice(0, 69)}…` : unit.say.text;
  let lines = [full];
  if (full.length > 34) {
    const mid = Math.floor(full.length / 2), cut = [full.lastIndexOf(' ', mid), full.indexOf(' ', mid)].filter(i => i > 0).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    if (cut) lines = [full.slice(0, cut), full.slice(cut + 1)];
  }
  const h = 12 + (lines.length - 1) * 9;
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 8, x = unit.x - w / 2, y = top - 10 - h;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(unit.x - 3, y + h); ctx.lineTo(unit.x, y + h + 4); ctx.lineTo(unit.x + 3, y + h); ctx.fill();
  ctx.fillStyle = '#1b1b1f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, unit.x, y + 6.5 + i * 9));
  ctx.textBaseline = 'alphabetic';
}

// Every bubble, over everything else on the map (after all the units, so none stands over one)
export function drawAllSpeech(ctx) {
  // (#279) over a panic's or a fright's mark, not under it
  const marked = u => u.panic || (u.morale !== undefined && u.morale < GAME_CONFIG.morale.calmAbove);
  for (const u of /** @type {any[]} */ ([...game.settlers, ...game.enemies])) drawSpeech(ctx, u, u.y - (u.visualRadius || u.radius || 11) * 1.45 - (marked(u) ? 14 : 0));
}

// A settler of the colony says it (its faction's phrases)
export function says(unit, event, urgent = false) { return speak(unit, getPlayerFaction().id, event, urgent); }

// Each tick: the colony after a wave it beat, and now and then one with nothing to do; an enemy's war cry as a
// wave comes
let wasFighting = false, idleClock = 0;
export function tickVoices(dt) {
  clock += dt;
  tellStories(dt); // (#279)
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
  const fighting = game.enemies.some(en => en.fromWave);
  if (fighting && !wasFighting) someoneSays(game.enemies.filter(en => en.fromWave), getEnemyFaction().id, 'charge', true);
  if (!fighting && wasFighting && game.settlers.length) someoneSays(game.settlers, getPlayerFaction().id, 'won', true);
  wasFighting = fighting;
  idleClock += dt;
  if (idleClock > 40) {
    idleClock = 0;
    someoneSays(game.settlers.filter(s => s.isIdle && !s.asleep), getPlayerFaction().id, 'idle');
  }
}

// ---- (#279) a settler's day, and its story by the fire at night

// Something it did today counted (kills, gathered, built, cooked, healed); now and then it says so (event)
/** @param {any} s @param {string} what @param {string | null} [event] @param {number} [chance] */
export function noteDay(s, what, event = null, chance = 0) {
  if (!s || !game.settlers.includes(s)) return;
  s.today = s.today || {};
  s.today[what] = (s.today[what] || 0) + 1;
  if (event && Math.random() < chance) says(s, event);
}

// Its story of the day: the two things it did most, or that it had a quiet one
function storyOf(s) {
  const done = Object.entries(s.today || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (!done.length) return t('voice.story.none');
  return done.map(([what, n], i) => t(`voice.story.${what}${i ? '2' : ''}`, { n })).join(t('voice.story.and'));
}

// At night, now and then one sitting by a campfire tells its day
let storyClock = 0;
function tellStories(dt) {
  storyClock += dt;
  if (storyClock < VOICE.storyEvery || !isNight()) return;
  storyClock = 0;
  const by = /** @type {any[]} */ (game.settlers).filter(s => !s.asleep && s.idle && s.idle.act === 'campfire' && clock - (s.spokeAt || -Infinity) >= VOICE.ownGap);
  const teller = by[Math.floor(Math.random() * by.length)];
  if (teller && clock - lastSpoke >= VOICE.globalGap) voice(teller, storyOf(teller));
}
