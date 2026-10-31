// The world's seed and the random numbers drawn from it: the same seed always makes the same map. The seed
// is read from the shared Endless/editor menu field until a game is made from a seed it's given (createGame).

import { game } from './state.js';
import { updateSeedHud } from '../../ui/index.js';

export function createWorldSeed(seedInput = 'default-world-seed') {
  const seedValue = String(seedInput || 'default-world-seed');
  let state = 2166136261;
  for (let i = 0; i < seedValue.length; i++) {
    state ^= seedValue.charCodeAt(i);
    state = Math.imul(state, 16777619) >>> 0;
  }
  return {
    value: seedValue,
    random() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    },
    // where the sequence is, to carry on from it after loading a save
    getState() { return state; },
    setState(value) { state = value >>> 0; },
    nextInt(max = 1) { return Math.floor(this.random() * max); },
    nextRange(min, max) { return min + this.random() * (max - min); }
  };
}

export function createDefaultSeed() {
  const values = new Uint32Array(2);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(values);
  else {
    values[0] = Date.now() >>> 0;
    values[1] = Math.floor(Math.random() * 4294967296);
  }
  return `lima-${Date.now().toString(36)}-${values[0].toString(36)}-${values[1].toString(36)}`;
}

export const worldSeedInput = document.getElementById('seed-input');

/** @param {HTMLInputElement | null} [input] */
export function applySeedFromUI(input = /** @type {HTMLInputElement | null} */ (worldSeedInput)) {
  const rawSeed = input ? input.value.trim() : '';
  game.worldSeed = createWorldSeed(rawSeed || createDefaultSeed());
  updateSeedHud();
  return game.worldSeed;
}

export function rand() {
  if (game.worldSeed && typeof game.worldSeed.random === 'function') return game.worldSeed.random();
  return Math.random();
}

// What this file sets up as the game starts (called by app/boot.js)
export function initRng() {
  if (worldSeedInput && (!worldSeedInput.value || worldSeedInput.value === 'default-world-seed')) {
    worldSeedInput.value = createDefaultSeed();
  }
  game.worldSeed = createWorldSeed(worldSeedInput ? worldSeedInput.value : createDefaultSeed());
}
