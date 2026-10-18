// What's where, drawn (#248): a pile on the ground per kind, the thing itself; what a warehouse holds on its
// tile and what the town hall holds round it, one of each kind (the most first), however many there are

import { drawIcon, getResourceIconName } from '../../../ui/index.js';
import { game, townHall } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';

// the kinds it holds, the most first
const kinds = store => Object.entries(store || {}).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).map(([id]) => id);

export function drawPiles() {
  for (const p of game.piles) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    drawIcon(ctx, getResourceIconName(p.type), p.x, p.y, 17);
  }
}

// After the buildings: a warehouse's kinds in its tile's corners (four at most), the town hall's round its
// walls (ten at most)
export function drawStoreContents() {
  for (const b of game.buildings) {
    if (b.type !== 'warehouse') continue;
    kinds(b.store).slice(0, 4).forEach((id, i) => drawIcon(ctx, getResourceIconName(id), b.x + (i % 2 ? 8 : -8), b.y + (i < 2 ? -8 : 8), 9));
  }
  const around = kinds(townHall.store).slice(0, 10);
  around.forEach((id, i) => {
    // spread over its lower half (its health bar is over it), from the right to the left
    const a = (around.length === 1 ? 90 : 25 + 130 * i / (around.length - 1)) * Math.PI / 180, r = townHall.radius - 6;
    drawIcon(ctx, getResourceIconName(id), townHall.x + Math.cos(a) * r, townHall.y + Math.sin(a) * r, 13);
  });
}
