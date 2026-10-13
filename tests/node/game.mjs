// The game in Node, without a browser: the stand-in page, every module (through the tests' bridge, which
// puts their exports on globalThis as the page's window), and the scenario helpers the browser tests use
// (tests/sim.js and tests/scenarios/*.js, run as they are). Import this, then call sim.<scenario>(...).
import './page.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
// the tests check Russian texts, as the browser tests do (tests/helpers.mjs)
localStorage.setItem('sovereign-will-language', 'ru');
// the tests' bridge (tests/bridge.mjs): every module's exports and game's fields on globalThis
const { gameModules, expose, WWW_JS } = await import('../bridge.mjs');
expose(await Promise.all(gameModules().map(f => import(pathToFileURL(WWW_JS + f).href))), globalThis);
const run = file => runInThisContext(readFileSync(file, 'utf8'), { filename: file });
run(`${here}../sim.js`);
for (const f of readdirSync(`${here}../scenarios`).filter(f => f.endsWith('.js')).sort()) run(`${here}../scenarios/${f}`);

export const sim = globalThis.sim;
