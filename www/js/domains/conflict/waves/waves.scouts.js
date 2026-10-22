// Enemy scouts (#279): now and then between waves one walks along the map's edge, in the red band, never past
// it, looking the base over. It doesn't fight and the settlers leave it be (it isn't one of game.enemies). A
// settler coming within fleeTiles of it, it runs off the map. Pointed at by the player, it becomes an enemy
// to hunt (marked: soldiers go for it, waves.behaviours' scoutFlees runs it off).

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, rand, townHall } from '../../../engine/world/index.js';
import { getFrontier } from '../../world/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { getEnemyFaction } from '../../factions/index.js';
import { faceTowards } from '../../colony/settlers/index.js';
import { createConfiguredEnemy } from './waves.rules.js';

const config = () => GAME_CONFIG.scouts;
const waveOn = () => game.enemies.some(en => en.fromWave && en.hp > 0) || (game.portalQueue || []).length > 0;

// A spot in the band along the side of the frontier nearest `from` (#299: getFrontier, a default map's edge)
function bandSpot(from) {
  const f = getFrontier(), W = f.x1 - f.x0, H = f.y1 - f.y0, band = (BORDER_MARGIN - 0.5) * TILE_SIZE;
  const side = /** @type {[string, number][]} */ ([['left', from.x - f.x0], ['right', f.x1 - from.x], ['top', from.y - f.y0], ['bottom', f.y1 - from.y]]).sort((a, b) => a[1] - b[1])[0][0];
  const along = (side === 'left' || side === 'right' ? H : W) * (0.1 + rand() * 0.8);
  return side === 'left' ? { x: f.x0 + band, y: f.y0 + along } : side === 'right' ? { x: f.x1 - band, y: f.y0 + along }
    : side === 'top' ? { x: f.x0 + along, y: f.y0 + band } : { x: f.x0 + along, y: f.y1 - band };
}

// The kind a scout is: the enemy faction's lightest, by its waveKey 'club'
function scoutKind() {
  const kinds = getEnemyFaction().enemies.map(id => getDefinition('enemies', id)).filter(Boolean);
  return (kinds.find(def => /** @type {string[]} */ ([]).concat(def.waveKey).includes('club')) || kinds[0]).id;
}

// Each tick (Endless): one now and then between waves; each walks its stretch of the edge, runs from settlers
// coming near, and goes when its time's up (or a wave comes)
export function tickScouts(dt) {
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
  const c = config();
  game.scoutClock = (game.scoutClock || 0) + dt;
  if (game.scoutClock >= c.checkSeconds) {
    game.scoutClock = 0;
    if (!waveOn() && game.waveNum - 1 >= c.fromWave && game.scouts.length < c.max && rand() < c.chance) {
      const f = getFrontier();
      const start = bandSpot({ x: f.x0 + rand() * (f.x1 - f.x0), y: rand() < 0.5 ? f.y0 : f.y1 });
      const scout = createConfiguredEnemy(start, scoutKind());
      if (scout) { Object.assign(scout, { scout: true, leaveIn: c.staySeconds, scoutTo: bandSpot(start) }); game.scouts.push(scout); }
    }
  }
  for (const s of game.scouts) {
    s.leaveIn = (s.leaveIn ?? 0) - dt;
    const scared = game.settlers.some(o => Math.hypot(o.x - s.x, o.y - s.y) < c.fleeTiles * TILE_SIZE);
    if (scared || (s.leaveIn ?? 0) <= 0 || waveOn()) s.leaving = true;
    if (s.leaving) {
      // off past the frontier at its nearest side (a default map's edge)
      const f = getFrontier(), X0 = f.x0, Y0 = f.y0, W = f.x1, H = f.y1;
      const out = [{ x: X0 - 40, y: s.y, d: s.x - X0 }, { x: W + 40, y: s.y, d: W - s.x }, { x: s.x, y: Y0 - 40, d: s.y - Y0 }, { x: s.x, y: H + 40, d: H - s.y }].sort((a, b) => a.d - b.d)[0];
      moveEntityTowards(s, out.x, out.y, s.speed * (scared ? 1.2 : 1), true, dt);
      if (s.x < X0 + 18 || s.y < Y0 + 18 || s.x > W - 18 || s.y > H - 18) s.gone = true;
      continue;
    }
    if (!s.scoutTo || Math.hypot(s.scoutTo.x - s.x, s.scoutTo.y - s.y) < 10) {
      // a while looking at the base, then on along the edge
      s.lookFor = (s.lookFor ?? 2 + rand() * 3) - dt;
      faceTowards(s, townHall.x, townHall.y);
      if (s.lookFor <= 0) { s.lookFor = undefined; s.scoutTo = bandSpot(s); }
      continue;
    }
    moveEntityTowards(s, s.scoutTo.x, s.scoutTo.y, s.speed * 0.7, true, dt);
  }
  game.scouts = game.scouts.filter(s => !s.gone);
}

// A tap on a scout (Point mode): it's an enemy now, marked to hunt, and it runs. True when one was tapped
export function scoutTapped(x, y) {
  const s = game.scouts.find(o => Math.hypot(o.x - x, o.y - y) < o.radius + 12);
  if (!s) return false;
  game.scouts.splice(game.scouts.indexOf(s), 1);
  s.markedTarget = true;
  game.enemies.push(s);
  return true;
}
