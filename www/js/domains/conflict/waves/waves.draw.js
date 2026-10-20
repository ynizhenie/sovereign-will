// Enemies, their tents and tent sites

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { drawIcon } from '../../../ui/index.js';
import { game } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { getEnemyDef } from './waves.rules.js';
import { getEnemyColor, getEnemyFaction, shadeColor } from '../../factions/index.js';
import { SKIN, applyHeldItemPose, drawArmor, drawFigure, drawHandTorch, drawHeldTool, drawHeldWeapon, drawOrderBubble, drawQuiver, drawShield, itemScale } from '../../colony/settlers/index.js';
import { drawBodyBlood, drawBurning, drawTargetMark, drawWeaponBlood } from '../combat/index.js';
import { drawStaff } from '../../factions/undead/index.js';
import { drawHorns, drawPortal } from '../../factions/demons/index.js';

// Enemy tents (the undead's graves, the demons' portals), with their health
export function drawEnemyTents() {
  game.enemyTents.forEach(et => {
    if (et.outpost) drawOutpost(et);
    else if (getEnemyFaction().spawner === 'grave' || getEnemyFaction().spawner === 'portal') {
      // the undead's spawners are graves, the demons' portals, ringed in the enemy's colour
      ctx.strokeStyle = getEnemyColor(); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(et.x, et.y, 16, 0, Math.PI * 2); ctx.stroke();
      if (getEnemyFaction().spawner === 'portal') drawPortal(et.x, et.y, getEnemyColor());
      else drawIcon(ctx, getEnemyFaction().spawner, et.x, et.y, 28);
    } else {
      ctx.fillStyle = '#641e16'; ctx.beginPath();
      ctx.moveTo(et.x, et.y - 14); ctx.lineTo(et.x + 14, et.y + 14); ctx.lineTo(et.x - 14, et.y + 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#1e272e'; ctx.beginPath();
      ctx.moveTo(et.x, et.y); ctx.lineTo(et.x + 5, et.y + 14); ctx.lineTo(et.x - 5, et.y + 14); ctx.closePath(); ctx.fill();
    }

    const size = et.outpost ? 26 : 16;
    if (et.markedTarget) drawTargetMark({ x: et.x, y: et.y, radius: size }); // the player pointed at it (#203)
    if (et.hp < et.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(et.x - size + 2, et.y - size - 6, (size - 2) * 2, 4);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(et.x - size + 2, et.y - size - 6, (et.hp / et.maxHp) * (size - 2) * 2, 4);
    }
  });
}

// An enemy camp's outpost (#255): a squat log fort with a pointed roof, a banner in the enemy's colour
function drawOutpost(et) {
  const x = et.x, y = et.y, color = getEnemyColor();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 6, 26, 18, 0, 0, Math.PI * 2); ctx.fill();
  // the log walls
  ctx.fillStyle = '#6e4a2c'; ctx.fillRect(x - 20, y - 12, 40, 28);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 1;
  for (let k = -20; k <= 20; k += 5) { ctx.beginPath(); ctx.moveTo(x + k, y - 12); ctx.lineTo(x + k, y + 16); ctx.stroke(); }
  for (let k = -20; k <= 20; k += 5) { ctx.fillStyle = '#8a5d36'; ctx.beginPath(); ctx.moveTo(x + k - 2.5, y + 16); ctx.lineTo(x + k, y + 20); ctx.lineTo(x + k + 2.5, y + 16); ctx.fill(); }
  // the roof
  ctx.fillStyle = shadeColor(color, -0.45); ctx.beginPath(); ctx.moveTo(x - 24, y - 10); ctx.lineTo(x, y - 26); ctx.lineTo(x + 24, y - 10); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shadeColor(color, -0.65); ctx.lineWidth = 1.5; ctx.stroke();
  // the door, and the banner on its pole
  ctx.fillStyle = '#2b1a0e'; ctx.beginPath(); ctx.roundRect(x - 5, y + 2, 10, 14, [5, 5, 0, 0]); ctx.fill();
  ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 14, y - 14); ctx.lineTo(x + 14, y - 38); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + 15, y - 38); ctx.lineTo(x + 30, y - 33); ctx.lineTo(x + 15, y - 28); ctx.closePath(); ctx.fill();
}

// Things fallen enemies dropped (#210, #232): the thing itself on the ground, a faint shadow under it (an old
// save's pile of resources: a little sack)
export function drawLoot() {
  for (const pile of game.loot) {
    const key = (pile.items || [])[0];
    const [category, id] = key ? key.split(':') : [];
    const item = key && GAME_CONFIG[category] && GAME_CONFIG[category][id];
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.beginPath(); ctx.ellipse(pile.x, pile.y + 5, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    // (no thing in it: what it yields, as a crumbled zombie's rot and bones, #253)
    const res = !item && Object.keys(pile.yield || {}).find(id => GAME_CONFIG.resources[id]);
    drawIcon(ctx, item ? item.icon : res ? GAME_CONFIG.resources[res].icon : 'bundle', pile.x, pile.y, 18);
  }
}

// Tent sites enemies are building
export function drawEnemyTentSites() {
  game.enemyTentBlueprints.forEach(site => {
    ctx.fillStyle = 'rgba(192, 57, 43, 0.35)';
    ctx.beginPath();
    ctx.moveTo(site.x, site.y - 14); ctx.lineTo(site.x + 14, site.y + 14); ctx.lineTo(site.x - 14, site.y + 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(site.x - 14, site.y - 20, 28, 4);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(site.x - 14, site.y - 20, (site.progress / site.maxProgress) * 28, 4);
  });
}

// Enemies: body, weapon, quiver, the target mark, health
export function drawEnemies() {
  game.enemies.forEach(drawEnemy);
  game.scouts.forEach(drawEnemy); // (scouts between waves, #279)
}

// One enemy
export function drawEnemy(en) {
  {
    // enemies as figures in the enemy's colour (big ones darker), holding their weapon the way settlers do
    // (#251); their skin their faction's
    const kin = en.enemyKey.startsWith('demon_') ? 'demons' : en.enemyKey.startsWith('undead_') ? 'undead' : 'humans';
    drawFigure(en, { x: en.x, y: en.y, r: en.radius, body: getEnemyColor(en), skin: SKIN[kin], horns: kin === 'demons', hand: true, shield: !!en.shield });
    if ((en.burning || 0) > 0) drawBurning(en.x, en.y, en.radius);
    drawBodyBlood(en, en.radius);

    ctx.save();
    ctx.translate(en.x, en.y);
    ctx.save();
    applyHeldItemPose(en);
    if (getEnemyDef(en).necromancer) drawStaff();
    else if (getEnemyDef(en).tool === 'medbag') drawHeldTool('medbag', itemScale(en), 1);
    else drawHeldWeapon(en.weapon, itemScale(en)); // (in its hand, as big as it, #279)
    drawWeaponBlood(en);
    ctx.restore();
    if (en.armor) drawArmor(en.radius, en.armor);
    if (en.shield) drawShield(en.radius);
    if ((en.arrows || 0) > 0) { ctx.save(); ctx.translate(-Math.cos(en.facing || 0) * en.radius * 0.55, -Math.sin(en.facing || 0) * en.radius * 0.55); ctx.rotate((en.facing || 0) + Math.PI / 2); drawQuiver(0, en.arrows || 0); ctx.restore(); } // (on its back, turned with it, #251)
    if (en.torch) drawHandTorch(en.facing, en.radius); // (a night wave, #257)
    if (en.captain) drawEnemyBanner(en);
    ctx.restore();
    if (en.orderBubble && en.orderBubble.until > game.pathTick) drawOrderBubble(en.x + en.radius, en.y - en.radius * 1.45 - 14, en.orderBubble.icon);

    if (en.markedTarget) drawTargetMark(en);

    const top = en.y - en.radius * 1.45; // (over its head)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(en.x - 12, top - 5, 24, 3);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(en.x - 12, top - 5, (Math.max(0, en.hp) / en.maxHp) * 24, 3);
  }
}

// An enemy commander's banner on its back (#279), in the enemy's colour, turned with it
function drawEnemyBanner(en) {
  const f = en.facing || 0, r = en.radius;
  ctx.save();
  ctx.translate(-Math.cos(f) * r * 0.55, -Math.sin(f) * r * 0.55 - r * 0.15);
  ctx.rotate(f + Math.PI / 2);
  ctx.fillStyle = '#4a2f17'; ctx.fillRect(-1, -18, 2, 20);
  ctx.fillStyle = getEnemyColor(en); ctx.fillRect(1, -18, 10, 7);
  ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 1; ctx.strokeRect(1, -18, 10, 7);
  ctx.restore();
}
