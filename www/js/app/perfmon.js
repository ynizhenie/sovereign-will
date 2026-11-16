// The performance monitor (Settings): for a device the game drops frames on. It keeps the last frames' times, what
// each part of a step and of the drawing took (perfMark, put between the calls in update.js and render.js), and every
// drop: a frame that came much later than the ones before it, with what most likely held it up. The work of the frame
// before it in the game's steps (logic) or in drawing (draw), the browser freeing memory (gc: the page's memory went
// down), or none of our own work at all (outside: the graphics card, the browser putting the picture on the screen,
// another app). A panel shows a graph of the frames, the numbers and the last drops; "Copy report" puts all of it as
// text on the clipboard to be sent. Off, every perfMark is one check of a flag.

import { canvas, getViewScale, glReady, loadSetting, onTap, saveSetting, t } from '../engine/platform/index.js';
import { game } from '../engine/world/index.js';
import { chunkPaintTotals } from '../domains/world/index.js';

export const perf = { on: loadSetting('perfMonitor', 'off') === 'on' };

const RING = 1200; // frames kept for the graph and the lows (ten seconds at 120 fps)
const BUCKETS = [9, 12, 17, 25, 34, 50, Infinity]; // ms: a frame's wait, counted into the first it's under
const SPIKES_KEPT = 40;

let cursor = 0; // when the last mark was made
let current = new Map(), previous = new Map(); // ms per part: this frame's so far, and the last one's
let lastStart = 0, lastHeap = 0, lastPaints = null;
let prevWork = { js: 0, step: 0, draw: 0, steps: 0, paints: 0 };
const stats = newStats();
let panel = null, graph = null, text = null, panelDue = 0, longTasks = { count: 0, ms: 0 };

/** @typedef {{ at: number, interval: number, cause: string, js: number, step: number, draw: number, steps: number,
 *   paints: number, heapDrop: number, top: string[], units: string }} Spike */
function newStats() {
  return {
    started: performance.now(), frames: 0, intervals: new Float32Array(RING), next: 0, filled: 0,
    buckets: new Array(BUCKETS.length).fill(0), parts: /** @type {Map<string, { ms: number, max: number }>} */ (new Map()),
    spikes: /** @type {Spike[]} */ ([]), causes: { logic: 0, draw: 0, gc: 0, outside: 0 },
    worst: 0, median: 16.7, gcs: 0
  };
}

// The step's or the drawing's start; then each mark gives the time since the last one to its part
export function perfBegin() { if (perf.on) cursor = performance.now(); }
export function perfMark(part) {
  if (!perf.on) return;
  const now = performance.now();
  current.set(part, (current.get(part) || 0) + now - cursor);
  cursor = now;
}

// A frame done (gameLoop): its start (requestAnimationFrame's time), when its own work ended, and what that was
export function perfFrame(start, end, step, draw, steps) {
  if (!perf.on) return;
  const interval = lastStart ? start - lastStart : 0;
  lastStart = start;
  const memory = /** @type {any} */ (performance).memory;
  const heap = memory ? memory.usedJSHeapSize : 0;
  const heapDrop = lastHeap && heap < lastHeap - 512 * 1024 ? (lastHeap - heap) / 1048576 : 0;
  lastHeap = heap;
  if (heapDrop) stats.gcs++;
  const paints = chunkPaintTotals();
  const painted = lastPaints ? paints.count - lastPaints.count : 0;
  lastPaints = paints;
  if (interval > 0 && interval < 2000) record(interval, heapDrop);
  for (const [part, ms] of current) {
    const total = stats.parts.get(part) || { ms: 0, max: 0 };
    total.ms += ms; total.max = Math.max(total.max, ms);
    stats.parts.set(part, total);
  }
  [previous, current] = [current, previous];
  current.clear();
  prevWork = { js: end - start, step, draw, steps, paints: painted };
  if (end - panelDue > 250) { panelDue = end; showPanel(); }
}

function record(interval, heapDrop) {
  stats.frames++;
  stats.intervals[stats.next] = interval;
  stats.next = (stats.next + 1) % RING;
  stats.filled = Math.min(RING, stats.filled + 1);
  stats.buckets[BUCKETS.findIndex(limit => interval < limit)]++;
  stats.worst = Math.max(stats.worst, interval);
  if (stats.frames % 60 === 0) stats.median = median(120);
  // a drop: much later than the frames before it (and slower than 40 fps at least)
  if (interval < Math.max(25, stats.median * 1.75)) return;
  // what held it up: the last frame's own work (it ran just before this one's turn came), or not ours
  const w = prevWork;
  const cause = w.step > interval * 0.4 ? 'logic' : w.draw > interval * 0.4 ? 'draw' : heapDrop ? 'gc' : 'outside';
  stats.causes[cause]++;
  const top = [...previous].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([part, ms]) => `${part} ${ms.toFixed(1)}`);
  stats.spikes.push({
    at: (performance.now() - stats.started) / 1000, interval, cause, js: w.js, step: w.step, draw: w.draw, steps: w.steps,
    paints: w.paints, heapDrop, top, units: `${game.settlers.length}s ${game.enemies.length}e ${game.projectiles.length}p`
  });
  if (stats.spikes.length > SPIKES_KEPT) stats.spikes.shift();
}

function median(count) {
  const n = Math.min(count, stats.filled), recent = [];
  for (let i = 1; i <= n; i++) recent.push(stats.intervals[(stats.next - i + RING) % RING]);
  recent.sort((a, b) => a - b);
  return recent.length ? recent[Math.floor(recent.length / 2)] : 16.7;
}

// The frames' waits, sorted: fps from their average, and the slowest 1% (as "1% low" fps)
function summary() {
  const n = stats.filled, list = [];
  for (let i = 0; i < n; i++) list.push(stats.intervals[i]);
  list.sort((a, b) => a - b);
  const avg = n ? list.reduce((a, b) => a + b, 0) / n : 0;
  const pct = p => (n ? list[Math.min(n - 1, Math.floor(n * p))] : 0);
  return { fps: avg ? 1000 / avg : 0, low1: pct(0.99) ? 1000 / pct(0.99) : 0, low01: pct(0.999) ? 1000 / pct(0.999) : 0, p99: pct(0.99) };
}

// ---- The panel

function buildPanel() {
  panel = document.createElement('div');
  panel.id = 'perf-panel';
  graph = document.createElement('canvas');
  graph.width = 240; graph.height = 60;
  text = document.createElement('pre');
  const buttons = document.createElement('div');
  buttons.className = 'perf-buttons';
  const button = (label, fn) => { const b = document.createElement('button'); b.textContent = t(label); onTap(b, fn); buttons.appendChild(b); return b; };
  const copy = button('perf.copy', () => copyReport(copy));
  button('perf.reset', resetPerf);
  panel.append(graph, text, buttons);
  document.body.appendChild(panel);
}

function showPanel() {
  if (!panel) buildPanel();
  panel.hidden = false;
  const s = summary(), c = stats.causes;
  const parts = [...stats.parts].sort((a, b) => b[1].ms - a[1].ms).slice(0, 6)
    .map(([part, v]) => `${part.padEnd(12)} ${(v.ms / Math.max(1, stats.frames)).toFixed(2)} max ${v.max.toFixed(0)}`);
  const last = stats.spikes.slice(-3).reverse().map(sp => `${Math.round(sp.interval)}ms ${sp.cause} ${sp.top[0] || ''}`);
  text.textContent = `${s.fps.toFixed(0)} fps  1% low ${s.low1.toFixed(0)}  worst ${Math.round(stats.worst)}ms\n`
    + `drops ${c.logic + c.draw + c.gc + c.outside}: logic ${c.logic} draw ${c.draw} gc ${c.gc} out ${c.outside}\n`
    + `${parts.join('\n')}\n${last.join('\n')}`;
  drawGraph();
}

function drawGraph() {
  const g = graph.getContext('2d'), w = graph.width, h = graph.height, scale = h / 50; // 50 ms at the top
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(0, 0, 0, 0.5)'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  for (const ms of [16.7, 33.3]) { g.beginPath(); g.moveTo(0, h - ms * scale); g.lineTo(w, h - ms * scale); g.stroke(); }
  const n = Math.min(w, stats.filled);
  for (let i = 0; i < n; i++) {
    const ms = stats.intervals[(stats.next - n + i + RING) % RING];
    g.fillStyle = ms > 33.4 ? '#e74c3c' : ms > 17.5 ? '#f1c40f' : '#2ecc71';
    g.fillRect(w - n + i, h - Math.min(h, ms * scale), 1, Math.min(h, ms * scale));
  }
}

export function resetPerf() {
  Object.assign(stats, newStats());
  previous.clear(); current.clear();
  lastStart = 0; lastHeap = 0; lastPaints = null; longTasks = { count: 0, ms: 0 };
  if (panel) showPanel();
}

export function setPerfMonitor(on) {
  perf.on = on;
  saveSetting('perfMonitor', on ? 'on' : 'off');
  resetPerf();
  if (panel) panel.hidden = !on;
  if (on) showPanel();
}

// ---- The report, as text to send

export function perfReport() {
  const s = summary(), seconds = (performance.now() - stats.started) / 1000;
  const parts = [...stats.parts].sort((a, b) => b[1].ms - a[1].ms)
    .map(([part, v]) => `  ${part.padEnd(14)} avg ${(v.ms / Math.max(1, stats.frames)).toFixed(2)} ms  max ${v.max.toFixed(1)} ms`);
  const labels = BUCKETS.map((limit, i) => `${i ? BUCKETS[i - 1] : 0}-${limit === Infinity ? '' : limit}`);
  const memory = /** @type {any} */ (performance).memory;
  return [
    `Sovereign Will performance report`,
    `device: ${navigator.userAgent}`,
    `screen ${screen.width}x${screen.height} dpr ${devicePixelRatio} canvas ${canvas.width}x${canvas.height} zoom ${getViewScale().toFixed(2)} GL ${glReady() ? 'on' : 'off'} cores ${navigator.hardwareConcurrency || '?'}`,
    `mode ${game.gameMode} map ${game.COLS}x${game.ROWS} units ${game.settlers.length} settlers ${game.enemies.length} enemies ${game.buildings.length} buildings`,
    `over ${seconds.toFixed(0)} s, ${stats.frames} frames: ${s.fps.toFixed(1)} fps, 1% low ${s.low1.toFixed(1)}, 0.1% low ${s.low01.toFixed(1)}, worst ${stats.worst.toFixed(0)} ms`,
    `frame waits (ms): ${labels.map((label, i) => `${label}: ${stats.buckets[i]}`).join('  ')}`,
    `drops: logic ${stats.causes.logic}, draw ${stats.causes.draw}, gc ${stats.causes.gc}, outside ${stats.causes.outside}; memory freed ${stats.gcs} times`
      + (memory ? `; heap ${(memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : '') + (longTasks.count ? `; long tasks ${longTasks.count} (${longTasks.ms.toFixed(0)} ms)` : ''),
    `parts (per frame):`, ...parts,
    `last drops (s since start, wait, cause, our work js/step/draw ms, steps, ground pieces painted, memory freed MB, top parts):`,
    ...stats.spikes.slice().reverse().map(sp => `  ${sp.at.toFixed(1)}s ${sp.interval.toFixed(0)}ms ${sp.cause} js ${sp.js.toFixed(1)} step ${sp.step.toFixed(1)} draw ${sp.draw.toFixed(1)}`
      + ` x${sp.steps} paints ${sp.paints}${sp.heapDrop ? ` gc ${sp.heapDrop.toFixed(1)}` : ''} ${sp.units} | ${sp.top.join(', ')}`)
  ].join('\n');
}

function copyReport(button) {
  const report = perfReport();
  const done = ok => { button.textContent = t(ok ? 'perf.copied' : 'perf.copyFailed'); setTimeout(() => { button.textContent = t('perf.copy'); }, 1500); };
  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = report; area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area); area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* none */ }
    area.remove();
    done(ok);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(report).then(() => done(true), fallback);
  else fallback();
}

// What this file sets up as the game starts (called by app/boot.js)
export function initPerfMonitor() {
  // long tasks the browser saw (where it tells: Chrome and Android's WebView)
  try {
    new PerformanceObserver(list => {
      if (!perf.on) return;
      for (const entry of list.getEntries()) { longTasks.count++; longTasks.ms += entry.duration; }
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* none */ }
  if (perf.on) showPanel();
}
