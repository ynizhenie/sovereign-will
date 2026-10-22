// (#306) Something worked out once a tick and kept till the next one: with a big colony the same scan (who
// has gone for a corpse, is there an archer...) was made again for every settler, every tick

import { game } from './state.js';

// A place to keep one such thing; call it with how to work it out, get it (worked out the first time in a tick)
/** @returns {<T>(make: () => T) => T} */
export function onceThisTick() {
  let tick = -1;
  /** @type {any} */
  let value;
  return make => {
    if (tick !== game.pathTick) {
      tick = game.pathTick;
      value = make();
    }
    return value;
  };
}
