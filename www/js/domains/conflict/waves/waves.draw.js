// Enemies, their tents and tent sites

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { drawIcon } from '../../../ui/index.js';
import { forEachInRect, game } from '../../../engine/world/index.js';
import { ctx, getViewRect, getViewScale } from '../../../engine/platform/index.js';
import { getEnemyDef } from './waves.rules.js';
import { getEnemyColor, getEnemyFaction } from '../../factions/index.js';
import { SKIN, applyBackPose, applyHeldItemPose, drawHealSparks, drawArmor, drawFigure, drawFigureShadows, drawSleepZs, backBehind, bowDraw, handSide, heldBehind, drawHandTorch, drawSideTorch, drawHeldTool, drawHeldWeapon, drawOrderBubble, drawQuiver, drawShield, drawWorkTool, itemScale, simpleUnit, tinyUnit, torchAtSide, unitKin } from '../../colony/settlers/index.js';
import { drawBodyBlood, drawBurning, drawTargetMark, drawWeaponBlood } from '../combat/index.js';
import { drawStaff } from '../../factions/undead/index.js';
import { drawPet } from '../../colony/pets/index.js';
import { drawHorns, drawPortal } from '../../factions/demons/index.js';
import { castShadow, getDarkness, isExplored, isVisible } from '../../world/index.js';
import { drawBlueprintTile, drawDenArt, drawEnemyCampOutpostArt, drawTentArt, shadow } from '../../economy/building/index.js';

// Enemy tents (the undead's graves, the demons' portals), with their health
export function drawEnemyTents() {
  const v = getViewRect(60), visible = [];
  forEachInRect(game.enemyTents, v.x0, v.y0, v.x1, v.y1, et => visible.push(et));
  visible.forEach(et => {
    if (!isExplored(et.x, et.y)) return; // (#299: in the dark; once seen, a tent stays shown)
    const spawner = et.spawner || getEnemyFaction().spawner || 'tent';
    if (et.outpost) {
      drawEnemyCampOutpostArt(et.x, et.y, getEnemyFaction().id);
    } else if (et.campStructure && et.campType === 'tent') {
      drawTentArt(et.x, et.y);
    } else if (et.campStructure && et.campType === 'grave') {
      shadow(et.x, et.y + 3, 18, 14, 6);
      drawIcon(ctx, 'grave', et.x, et.y, 28);
    } else if (et.campStructure && et.campType === 'demon_den') {
      drawDenArt(et.x, et.y);
    } else if (spawner === 'portal') {
      drawPortal(et.x, et.y, getEnemyColor());
    } else if (spawner === 'grave') {
      shadow(et.x, et.y + 3, 18, 14, 6);
      drawIcon(ctx, 'grave', et.x, et.y, 28);
    } else {
      drawTentArt(et.x, et.y);
    }

    const size = 16;
    if (et.markedTarget) drawTargetMark({ x: et.x, y: et.y, radius: size }); // the player pointed at it (#203)
    if (et.hp < et.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(et.x - size + 2, et.y - size - 6, (size - 2) * 2, 4);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(et.x - size + 2, et.y - size - 6, (et.hp / et.maxHp) * (size - 2) * 2, 4);
    }
  });
}

export function drawEnemyRafts() {
  const view = getViewRect(40);
  forEachInRect(game.enemyRafts, view.x0, view.y0, view.x1, view.y1, raft => {
    if (!isVisible(raft.x, raft.y)) return;
    castShadow(ctx, raft.x, raft.y + 8, 24, 6, 8);
    ctx.save();
    ctx.translate(raft.x, raft.y);
    ctx.rotate(Math.atan2(raft.dy, raft.dx));
    ctx.fillStyle = '#704923';
    ctx.beginPath();
    ctx.moveTo(-26, -11); ctx.lineTo(20, -11); ctx.lineTo(28, 0); ctx.lineTo(20, 11); ctx.lineTo(-26, 11); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3f2a19'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#9b6b3d'; ctx.lineWidth = 3;
    for (let x = -17; x <= 13; x += 10) { ctx.beginPath(); ctx.moveTo(x, -9); ctx.lineTo(x, 9); ctx.stroke(); }
    ctx.restore();
  });
}

// Things fallen enemies dropped (#210, #232): the thing itself on the ground, a faint shadow under it (an old
// save's pile of resources: a little sack)
export function drawLoot() {
  const v = getViewRect(30), visible = [];
  forEachInRect(game.loot, v.x0, v.y0, v.x1, v.y1, pile => visible.push(pile));
  for (const pile of visible) {
    const key = (pile.items || [])[0];
    const [category, id] = key ? key.split(':') : [];
    const item = key && GAME_CONFIG[category] && GAME_CONFIG[category][id];
    castShadow(ctx, pile.x, pile.y + 5, 8, 3, 6); // (#326: by the sun, as everything else)
    // (no thing in it: what it yields, as a crumbled zombie's rot and bones, #253)
    const res = !item && Object.keys(pile.yield || {}).find(id => GAME_CONFIG.resources[id]);
    drawIcon(ctx, item ? item.icon : res ? GAME_CONFIG.resources[res].icon : 'bundle', pile.x, pile.y, 18);
  }
}

// Tent sites enemies are building
export function drawEnemyTentSites() {
  const v = getViewRect(60), visible = [];
  forEachInRect(game.enemyTentBlueprints, v.x0, v.y0, v.x1, v.y1, site => visible.push(site));
  visible.forEach(site => {
    if (!isVisible(site.x, site.y)) return; // (#299)
    drawBlueprintTile(getEnemyFaction().spawner || 'tent', site.x, site.y);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(site.x - 12, site.y + 16, 24, 3);
    ctx.fillStyle = '#fff'; ctx.fillRect(site.x - 12, site.y + 16, (site.progress / site.maxProgress) * 24, 3);
  });
}

// Enemies: body, weapon, quiver, the target mark, health
// The enemies' shadows (those the colony sees), into the frame's shadows (see drawShadowLayer)
export function drawEnemyShadows() {
  if (tinyUnit()) return;
  const view = getViewRect(60), seen = [];
  // (one by one: the tiles' buckets are for what stands still, see engine/world/spatial.js)
  for (const list of [game.enemies, game.scouts]) for (const en of list) if (en.x >= view.x0 && en.x <= view.x1 && en.y >= view.y0 && en.y <= view.y1 && isVisible(en.x, en.y)) seen.push(en);
  drawFigureShadows(seen, view, en => en.radius || 11);
}

export function drawEnemies(only = null) {
  // (#299) only those the colony sees now, and only those on the screen (#306)
  const view = getViewRect(60);
  const shown = en => isVisible(en.x, en.y) && en.x > view.x0 && en.x < view.x1 && en.y > view.y0 && en.y < view.y1;
  if (only) { if (shown(only)) drawEnemy(only); return; }
  const enemies = [], scouts = [];
  for (const en of game.enemies) if (shown(en)) enemies.push(en);
  for (const en of game.scouts) if (shown(en)) scouts.push(en);
  // (#306) zoomed out to one or two pixels apiece: a dab of their colour each
  if (tinyUnit()) {
    const dab = 1.6 / getViewScale();
    const alpha = ctx.globalAlpha;
    for (const en of enemies) if (shown(en)) {
      ctx.globalAlpha = alpha * (en.temporary !== undefined ? 0.7 : 1);
      ctx.fillStyle = getEnemyColor(en); ctx.fillRect(en.x - dab / 2, en.y - dab, dab, dab * 2);
    }
    for (const en of scouts) if (shown(en)) {
      ctx.globalAlpha = alpha * (en.temporary !== undefined ? 0.7 : 1);
      ctx.fillStyle = getEnemyColor(en); ctx.fillRect(en.x - dab / 2, en.y - dab, dab, dab * 2);
    }
    ctx.globalAlpha = alpha;
    return;
  }
  for (const en of enemies) if (shown(en)) drawEnemy(en);
  for (const en of scouts) if (shown(en)) drawEnemy(en); // (scouts between waves, #279)
}

// One enemy
export function drawEnemy(en) {
  ctx.save();
  ctx.globalAlpha *= en.temporary !== undefined ? 0.7 : 1;
  const pet = getEnemyDef(en).pet;
  if (pet) {
    drawPet(en, pet, true);
    if (en.markedTarget) drawTargetMark(en);
    ctx.restore();
    return;
  } // (#314: a dog, a hellhound, a ghost)
  {
    const simple = simpleUnit(); // (#306) zoomed out: its shape and colours, no gear
    // enemies as figures in the enemy's colour (big ones darker), holding their weapon the way settlers do
    // (#251); their skin their faction's
    const kin = unitKin(en);
    // (#298) in layers by the way it faces, as a settler: facing away, its weapon, shield and torch behind its
    // body and its quiver in front; facing us, the other way round
    const handBack = !en.asleep && heldBehind(en), backBack = backBehind(en);
    const at = fn => { ctx.save(); ctx.translate(en.x, en.y); fn(); ctx.restore(); };
    const healing = en.working > 0 && en.workKind === 'heal';
    const building = en.working > 0 && en.workKind === 'build';
    const enemyDef = getEnemyDef(en);
    const torchAside = (en.weapon === 'rifle' && en.torch) || torchAtSide(en, !!en.torch, en.weapon !== 'fist' || (enemyDef.tool && enemyDef.tool !== 'none') || enemyDef.necromancer);
    const torchHeld = en.torch && !torchAside;
    const drawMedicBag = front => {
      if (!healing || !enemyDef.healer) return;
      const r = en.visualRadius || en.radius, f = en.facing || 0;
      const sideOn = Math.abs(Math.cos(f)) > 0.85, x = sideOn ? -Math.cos(f) * r * 0.3 : -handSide(en) * r * 0.72, y = r * 0.18;
      const farSlot = sideOn || Math.sin(f) < -0.25;
      if (farSlot === front) return;
      ctx.save(); ctx.translate(x - 3, y - 4);
      drawHeldTool('medbag', 0.8, game.gameMode === 'battle' ? 1 : Math.min(1, (en.herbs || 0) / getEnemyDef(en).healer.bagSize));
      ctx.restore();
    };
    const inHand = () => {
      ctx.save();
      if (torchHeld) applyBackPose(en); else applyHeldItemPose(en);
      if (enemyDef.necromancer) drawStaff(getEnemyColor(null), getDarkness()); // (#326)
      else if (building) drawWorkTool('hammer', itemScale(en));
      else if (healing && enemyDef.healer) drawWorkTool('herbs', itemScale(en));
      else if (enemyDef.tool === 'medbag') drawHeldTool('medbag', itemScale(en), 1);
      else drawHeldWeapon((en.swingT || 0) > 0 && en.swingWeapon ? en.swingWeapon : en.weapon, itemScale(en), torchHeld ? 0 : (bowDraw(en) || { pull: 0 }).pull); // (in its hand, as big as it, #279; drawn, #306)
      drawWeaponBlood(en, (en.swingT || 0) > 0 && en.swingWeapon ? en.swingWeapon : en.weapon);
      ctx.restore();
      if (torchHeld) drawHandTorch(en.facing, en.radius);
      else if (torchAside) drawSideTorch(en.facing, en.radius);
    };
    const onItsBack = () => {
      if ((en.arrows || 0) > 0) { ctx.save(); ctx.translate(-Math.cos(en.facing || 0) * en.radius * 0.55, -Math.sin(en.facing || 0) * en.radius * 0.55); ctx.rotate((en.facing || 0) + Math.PI / 2); drawQuiver(0, en.arrows || 0); ctx.restore(); } // (on its back, turned with it, #251)
    };
    if (!simple && !en.asleep) {
      if (backBack) at(onItsBack);
      if (handBack) at(inHand);
      at(() => drawMedicBag(false));
    }
    drawFigure(en, { x: en.x, y: en.y, r: en.radius, body: getEnemyColor(en), camoColor: getEnemyColor(en), camouflage: !!en.camouflage, skin: SKIN[kin], horns: kin === 'demons', hand: true, shield: !en.asleep && !!en.shield, armor: en.asleep ? null : en.armor || null, lying: !!en.asleep, otherPoint: en.asleep ? null : (bowDraw(en) || {}).other || null, simple, shadow: false });
    if (en.asleep) drawSleepZs(en.x + en.radius, en.y - en.radius);
    if ((en.burning || 0) > 0) drawBurning(en.x, en.y, en.radius);
    drawBodyBlood(en, en.radius);
    drawHealSparks(en); // (#326)
    if (!simple && !en.asleep) {
      at(() => { if (en.shield) drawShield(en.radius, handSide(en)); }); // (its armour: drawFigure, #298)
      if (!backBack) at(onItsBack);
      if (!handBack) at(inHand);
      at(() => drawMedicBag(true));
    }
    at(() => { if (en.captain) drawEnemyBanner(en); }); // (the flag shows even zoomed out)
    if (en.orderBubble && en.orderBubble.until > game.pathTick) drawOrderBubble(en.x + en.radius, en.y - en.radius * 1.45 - 14, en.orderBubble.icon);

    if (en.markedTarget) drawTargetMark(en);

    const top = en.y - en.radius * 1.45; // (over its head)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(en.x - 12, top - 5, 24, 3);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(en.x - 12, top - 5, (Math.max(0, en.hp) / en.maxHp) * 24, 3);
  }
  ctx.restore();
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
