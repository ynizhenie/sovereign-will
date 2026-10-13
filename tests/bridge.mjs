// The tests' window into the game: every module's exports, and every field of `game`, under their own names
// on the page's window (globalThis in Node), read live. The game itself has no such thing; the browser tests
// add it to each page they open (tests/helpers.mjs), the Node tests to theirs (tests/node/game.mjs).
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WWW_JS = fileURLToPath(new URL('../www/js/', import.meta.url));

// every module of the game, as paths under www/js (the door files too: harmless, they only re-export)
export function gameModules() {
  const out = [];
  (function walk(dir) {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) out.push(relative(WWW_JS, p).split('\\').join('/'));
    }
  })(WWW_JS);
  return out.filter(f => f !== 'app/boot.js'); // the start runs once, from the page itself
}

// Put the modules' exports and game's fields on `target`. A test may also put its own value in a name's
// place (window.showNotification = ...); a field of game is set through (settlers = [...]).
export function expose(modules, target) {
  for (const module of modules) {
    for (const name of Object.keys(module)) {
      Object.defineProperty(target, name, {
        configurable: true,
        get: () => module[name],
        set(value) { Object.defineProperty(target, name, { configurable: true, writable: true, value }); }
      });
    }
  }
  const game = modules.find(m => m.game && m.WORLD_LISTS)?.game;
  for (const key of Object.keys(game)) {
    Object.defineProperty(target, key, { configurable: true, get: () => game[key], set: value => { game[key] = value; } });
  }
  target.__bridged = true;
}

// The bridge as a module for the page: imports every module from /js/ and exposes them on window
export function pageBridgeSource() {
  const mods = gameModules();
  return `${mods.map((f, i) => `import * as m${i} from '/js/${f}';`).join('\n')}\n(${expose.toString()})([${mods.map((_, i) => `m${i}`).join(', ')}], window);\n`;
}
