// What's where, drawn (#248; #279): packs on the ground by a storage, the thing itself small and tied, a
// second layer on top a little up; what a warehouse holds on its floor under its roof: a stack for each kind,
// the more the higher (the town hall's storeroom no longer shown, #279)

import { drawIcon, getResourceIconName } from '../../../ui/index.js';
import { game } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { storeCapacity } from './storage.stores.js';

// the kinds it holds, the most first, with how many
const kinds = store => Object.entries(store || {}).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]);

export function drawPiles() {
  for (const layer of [0, 1, 2]) {
    for (const p of game.piles) {
      if ((p.layer || 0) !== layer) continue;
      const y = p.y - layer * 4;
      if (!layer) { ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 3.5, 4.5, 2, 0, 0, Math.PI * 2); ctx.fill(); }
      drawIcon(ctx, getResourceIconName(p.type), p.x, y, 9);
      // the cord round it
      ctx.strokeStyle = 'rgba(92, 58, 23, 0.85)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - 4, y); ctx.lineTo(p.x + 4, y); ctx.stroke();
    }
  }
}

// A stack of a kind: one to three of its icon, by how much there is of the store's room
function stack(id, n, x, y, size, room) {
  const count = Math.max(1, Math.min(3, Math.ceil((n / room) * 3)));
  for (let k = 0; k < count; k++) drawIcon(ctx, getResourceIconName(id), x, y - k * size * 0.45, size);
}

// After the buildings: a warehouse's kinds on its floor (six at most)
export function drawStoreContents() {
  for (const b of game.buildings) {
    if (b.type !== 'warehouse') continue;
    const room = storeCapacity(b) / 4;
    kinds(b.store).slice(0, 6).forEach(([id, n], i) => stack(id, n, b.x - 8 + (i % 3) * 8, b.y + 3 + Math.floor(i / 3) * 7, 7, room));
  }
  // (#279) not the town hall's: what's put in it isn't shown
}
