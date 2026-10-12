// How far a resource is worked through

import { TILE_SIZE, game } from '../../../engine/world/index.js';
import { ctx, drawProgressBar } from '../../../engine/platform/index.js';
import { getHarvestableResources, getMapResourceDef, getMapResourceKind } from './gathering.rules.js';
import { drawOreVeins } from '../../world/index.js';

export function getHarvestMaxHp(resource) {
  if (resource.maxHp) return resource.maxHp;
  const def = getMapResourceDef(getMapResourceKind(resource));
  return (def && def.hp) || 1;
}

export function drawHarvestProgress(resource, width = 24) {
  let maxHp = getHarvestMaxHp(resource);
  drawProgressBar(resource.x, resource.y, (maxHp - Math.max(0, resource.hp)) / maxHp, width);
}

// Sticks and pebbles, and minable ore
export function drawSticksPebblesOre() {
  game.sticks.forEach(st => {
    ctx.strokeStyle = '#8e5a2b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(st.x - 6, st.y - 4); ctx.lineTo(st.x + 6, st.y + 4); ctx.stroke();
  });

  game.pebbles.forEach(pe => {
    ctx.fillStyle = '#bdc3c7';
    ctx.beginPath(); ctx.arc(pe.x - 2, pe.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(pe.x + 3, pe.y + 2, 2, 0, Math.PI * 2); ctx.fill();
  });

  // minable ore: the spawner's veined rock on a full tile, like natural rock (the spawner adds a frame and crystal)
  game.ironOres.forEach(ore => {
    drawOreVeins(ore.x, ore.y, 'iron', 14);
    drawHarvestProgress(ore);
  });

  game.coalOres.forEach(ore => {
    drawOreVeins(ore.x, ore.y, 'coal', 14);
    drawHarvestProgress(ore);
  });
}

// Trees: saplings growing, grown trees, apple trees with their apples
export function drawTrees() {
  game.trees.forEach(t => {
    if (t.isGrowing) {
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(t.x - 2, t.y - 6, 4, 12);
      ctx.beginPath(); ctx.arc(t.x - 4, t.y - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(t.x + 4, t.y - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(t.x - 10, t.y + 8, 20, 3);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(t.x - 10, t.y + 8, ((t.growProgress || 0) / 20) * 20, 3);
    } else {
      // apple trees: a lighter, rounder crown; red apples on it when ripe
      ctx.fillStyle = t.apple ? '#27501a' : '#1e3d14'; ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = t.apple ? '#3f7a2a' : '#2e5d20'; ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, 9, 0, Math.PI * 2); ctx.fill();
      if (t.apple && t.applesReady) {
        ctx.fillStyle = '#e74c3c';
        for (const [ax, ay] of [[-6, -5], [5, -7], [6, 4], [-4, 6], [0, -1]]) { ctx.beginPath(); ctx.arc(t.x + ax, t.y + ay, 2.2, 0, Math.PI * 2); ctx.fill(); }
      }
      drawHarvestProgress(t);
      // apples being picked: pickShare is kept up only while someone is at it
      if (t.apple && t.pickShare > 0 && game.pathTick - t.pickTick < 3) drawProgressBar(t.x, t.y, t.pickShare);
    }
  });
}

// Cacti, boulders, grass and berry bushes
export function drawCactiBouldersGrassBushes() {
  game.cacti.forEach(c => {
    ctx.fillStyle = '#2f8f46';
    ctx.fillRect(c.x - 4, c.y - 13, 8, 26);
    ctx.fillRect(c.x - 11, c.y - 5, 7, 5);
    ctx.fillRect(c.x + 4, c.y + 2, 7, 5);
    ctx.fillStyle = '#b7e08a';
    ctx.fillRect(c.x - 2, c.y - 10, 2, 20);
    drawHarvestProgress(c);
  });

  game.boulders.forEach(b => {
    // square like natural rock, but a smaller, lighter grey block so it reads as loose, minable stone
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(b.x - 11, b.y - 11, 22, 22);
    ctx.fillStyle = '#a4b0b5'; ctx.fillRect(b.x - 11, b.y - 11, 22, 5); ctx.fillRect(b.x - 11, b.y - 11, 5, 22);
    ctx.strokeStyle = '#5d6d7e'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 11, b.y - 11, 22, 22);
    drawHarvestProgress(b);
  });

  game.grassList.forEach(g => {
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(g.x - 6, g.y - 8, 3, 16); ctx.fillRect(g.x - 1, g.y - 10, 3, 18); ctx.fillRect(g.x + 4, g.y - 6, 3, 14);
    drawHarvestProgress(g, 20);
  });

  game.berryBushes.forEach(b => {
    ctx.fillStyle = '#1e824c'; ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b6ee1'; // blue, as the Berries icon
    ctx.beginPath(); ctx.arc(b.x - 4, b.y - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(b.x + 4, b.y - 2, 3, 0, Math.PI * 2); ctx.fill();
    drawHarvestProgress(b, 22);
  });
}

// The player's marks on resources: a square and the priority
export function drawPriorityMarks() {
  getHarvestableResources().forEach(r => {
    if (r.priority > 0) {
      // a square around the tile, the priority in its corner: clear of the progress bar above it
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 15, r.y - 15, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(r.x + 5, r.y + 5, 10, 10);
      ctx.fillStyle = '#1b1b1b'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${r.priority}`, r.x + 10, r.y + 13);
    }
  });
}
