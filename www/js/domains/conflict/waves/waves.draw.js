// Enemies, their tents and tent sites

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { drawIcon } from '../../../ui/index.js';
import { game } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { getEnemyDef } from './waves.rules.js';
import { getEnemyColor, getEnemyFaction, shadeColor } from '../../factions/index.js';
import { applyHeldItemPose, drawArmor, drawHeldWeapon, drawMedbag, drawQuiver, drawShield } from '../../colony/settlers/index.js';
import { drawBodyBlood, drawBurning, drawTargetMark, drawWeaponBlood } from '../combat/index.js';
import { drawStaff } from '../../factions/undead/index.js';
import { drawHorns, drawPortal } from '../../factions/demons/index.js';

// Enemy tents (the undead's graves, the demons' portals), with their health
export function drawEnemyTents() {
  game.enemyTents.forEach(et => {
    if (getEnemyFaction().spawner === 'grave' || getEnemyFaction().spawner === 'portal') {
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

    if (et.markedTarget) drawTargetMark({ x: et.x, y: et.y, radius: 16 }); // the player pointed at it (#203)
    if (et.hp < et.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(et.x - 14, et.y - 20, 28, 4);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(et.x - 14, et.y - 20, (et.hp / et.maxHp) * 28, 4);
    }
  });
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
  game.enemies.forEach(en => {
    // enemies in the enemy's colour (big ones darker), holding their weapon the way settlers do
    ctx.fillStyle = getEnemyColor(en);
    ctx.beginPath(); ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = shadeColor(getEnemyColor(), -0.45); ctx.lineWidth = 2; ctx.stroke();
    if (en.enemyKey.startsWith('demon_')) drawHorns(en.x, en.y, en.radius);
    if ((en.burning || 0) > 0) drawBurning(en.x, en.y, en.radius);
    drawBodyBlood(en, en.radius);

    ctx.save();
    ctx.translate(en.x, en.y);
    if (en.type === 'big') ctx.translate(en.radius - 11, 0); // hands at the edge of the larger body
    ctx.save();
    applyHeldItemPose(en);
    if (getEnemyDef(en).necromancer) drawStaff();
    else if (getEnemyDef(en).tool === 'medbag') drawMedbag(1);
    else drawHeldWeapon(en.weapon);
    drawWeaponBlood(en);
    ctx.restore();
    if (en.armor === 'iron') drawArmor(en.radius);
    if (en.shield) drawShield(en.radius);
    if ((en.arrows || 0) > 0) drawQuiver(-en.radius, en.arrows || 0);
    ctx.restore();

    if (en.markedTarget) drawTargetMark(en);

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(en.x - 12, en.y - en.radius - 8, 24, 3);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(en.x - 12, en.y - en.radius - 8, (Math.max(0, en.hp) / en.maxHp) * 24, 3);
  });
}
