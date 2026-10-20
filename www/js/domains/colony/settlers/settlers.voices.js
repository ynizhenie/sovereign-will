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

const VOICE = { globalGap: 2.5, ownGap: 12, showTicks: 150 };
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
  const text = list[Math.floor(Math.random() * list.length)];
  unit.say = { text, until: game.pathTick + VOICE.showTicks };
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
  const text = unit.say.text.length > 34 ? `${unit.say.text.slice(0, 33)}…` : unit.say.text;
  const w = ctx.measureText(text).width + 8, x = unit.x - w / 2, y = top - 22;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, 12, 4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(unit.x - 3, y + 12); ctx.lineTo(unit.x, y + 16); ctx.lineTo(unit.x + 3, y + 12); ctx.fill();
  ctx.fillStyle = '#1b1b1f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, unit.x, y + 6.5);
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
