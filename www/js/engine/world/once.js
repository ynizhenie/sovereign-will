// (#306) Something worked out once a tick and kept till the next one: with a big colony the same scan (who
// has gone for a corpse, is there an archer...) was made again for every settler, every tick

import { game } from './state.js';

// (#326) A new world (a new game, a save loaded, a battle's field) makes what was kept stale, even in the same
// tick: a save loaded straight after it was made has the very tick it was made in, and the lists kept from the
// world before held things no longer in the world (a frame failed on them and the game stopped)
let epoch = 0;
export function newWorldEpoch() { epoch++; }

// A place to keep one such thing; call it with how to work it out, get it (worked out the first time in a tick)
/** @returns {<T>(make: () => T) => T} */
export function onceThisTick() {
  let tick = -1, made = -1;
  /** @type {any} */
  let value;
  return make => {
    if (tick !== game.pathTick || made !== epoch) {
      tick = game.pathTick; made = epoch;
      value = make();
    }
    return value;
  };
}
