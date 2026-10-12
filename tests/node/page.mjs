// A stand-in page for running the game's code in Node, without a browser. Every element, canvas context
// and call exists; an element remembers what's set on it (a field's value, a style), anything else does
// nothing. Enough for the mechanics (domains/), which never need a real page: what they show goes nowhere.
const nothing = new Proxy(function () {}, {
  get: (target, key) => (key === Symbol.toPrimitive ? () => 0 : key === Symbol.iterator ? [][Symbol.iterator] : key === 'length' ? 0 : nothing),
  apply: () => nothing,
  construct: () => nothing,
  set: () => true
});
// an element: what's set on it is kept (value, hidden, textContent, style.x...), the rest is `nothing`
const element = () => {
  const own = { style: new Proxy({}, { get: (o, k) => (k in o ? o[k] : ''), set: (o, k, v) => { o[k] = v; return true; } }), dataset: {} };
  return new Proxy(own, { get: (o, k) => (k in o ? o[k] : nothing), set: (o, k, v) => { o[k] = v; return true; } });
};
const elements = new Map();
const byId = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
const store = new Map();
Object.assign(globalThis, {
  window: globalThis,
  document: new Proxy({ getElementById: byId, querySelector: () => element(), querySelectorAll: () => [], createElement: () => element(), body: element() },
    { get: (o, k) => (k in o ? o[k] : nothing) }),
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  requestAnimationFrame: () => 0,
  getComputedStyle: () => nothing,
  matchMedia: () => ({ matches: false })
});
if (!globalThis.navigator) globalThis.navigator = { maxTouchPoints: 0 };
