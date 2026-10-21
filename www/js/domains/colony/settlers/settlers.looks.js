// Looks (#306): each settler and enemy a man or a woman (GAME_CONFIG.looks.femaleChance), and one of five
// looks of each, some commoner than others (male / female weights), with hair of a colour of its kind's own.
// Only how it's drawn: a woman's figure has a skirt's hem over its legs, steps a little shorter, and its hair
// sways as it walks. Given when it's made (hired, a wave's, placed in a battle, raised); one from before
// (an old save) gets one the first time it's drawn.

import { GAME_CONFIG } from '../../../content/configs/index.js';

const config = () => GAME_CONFIG.looks;

// One of the weights' indexes, by its weight
function pick(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let n = Math.random() * total; // (not the world's random: a look is only drawn, it mustn't change a game)
  for (let i = 0; i < weights.length; i++) { n -= weights[i]; if (n < 0) return i; }
  return weights.length - 1;
}

export function newLook() {
  const c = config(), female = Math.random() < c.femaleChance;
  return { female, style: pick(female ? c.female : c.male), shade: Math.floor(Math.random() * 1e6) };
}

/** @param {any} unit */
export function lookOf(unit) {
  if (!unit.look) unit.look = newLook();
  return unit.look;
}

// Its hair: on the head of radius hr at (0, hy), its colour from its kind's (kin), facing f; away: the back
// of its head all hair. walk: its steps, for a woman's hair to sway. ctx: where to draw
/** @param {CanvasRenderingContext2D} ctx @param {{ female: boolean, style: number, shade: number }} look */
export function drawHair(ctx, look, kin, hy, hr, f, away, walk) {
  const colours = config().hair[kin] || config().hair.humans;
  const hair = colours[look.shade % colours.length];
  const side = Math.cos(f) >= 0 ? 1 : -1, sway = Math.sin(walk * 0.35) * hr * 0.12;
  const cap = (from = Math.PI * 1.05, to = Math.PI * 1.95, lift = 0) => {
    ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(0, hy - lift, hr * 1.04, from, to); ctx.closePath(); ctx.fill();
  };
  const back = () => { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(0, hy, hr * 1.02, 0, Math.PI * 2); ctx.fill(); };
  if (!look.female) {
    switch (look.style) {
      case 0: if (away) back(); else cap(); break; // cropped short
      case 1: break; // bald
      case 2: // short, and a beard
        if (away) back(); else {
          cap();
          ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(Math.cos(f) * hr * 0.25, hy + hr * 0.62, hr * 0.62, hr * 0.42, 0, 0, Math.PI); ctx.fill();
        }
        break;
      case 3: // long, tied back
        if (away) back(); else cap();
        ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(-side * hr * 0.85, hy + hr * 0.3 + sway, hr * 0.22, hr * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        break;
      default: { // a hood
        ctx.fillStyle = '#5d4e3a'; ctx.beginPath(); ctx.arc(0, hy, hr * 1.12, Math.PI * 0.92, Math.PI * 2.08); ctx.closePath(); ctx.fill();
        if (away) back();
      }
    }
    return;
  }
  switch (look.style) {
    case 0: // long and straight, down to its shoulders
      if (away) back(); else cap();
      for (const sx of [-1, 1]) { ctx.fillStyle = hair; ctx.beginPath(); ctx.roundRect(sx * hr * 0.98 - hr * 0.22 + sx * sway * 0.4, hy - hr * 0.2, hr * 0.44, hr * 1.5, hr * 0.2); ctx.fill(); }
      if (away) { ctx.fillStyle = hair; ctx.beginPath(); ctx.roundRect(-hr * 0.9, hy, hr * 1.8, hr * 1.3, hr * 0.3); ctx.fill(); }
      break;
    case 1: // a braid down one side
      if (away) back(); else cap();
      ctx.fillStyle = hair;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(-side * hr * 0.8 + sway * 0.3, hy + hr * (0.3 + k * 0.38), hr * 0.2, hr * 0.24, 0, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 2: // a bun on top
      if (away) back(); else cap();
      ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(0, hy - hr * 1.05, hr * 0.42, 0, Math.PI * 2); ctx.fill();
      break;
    case 3: // a ponytail
      if (away) back(); else cap();
      ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(-side * hr * 0.95, hy - hr * 0.1 + sway, hr * 0.26, hr * 0.62, -side * 0.5, 0, Math.PI * 2); ctx.fill();
      break;
    default: // a bob to its chin
      if (away) back(); else cap(Math.PI * 0.9, Math.PI * 2.1);
      for (const sx of [-1, 1]) { ctx.fillStyle = hair; ctx.beginPath(); ctx.roundRect(sx * hr * 0.9 - hr * 0.2, hy - hr * 0.3, hr * 0.4, hr * 0.95, hr * 0.15); ctx.fill(); }
  }
}
