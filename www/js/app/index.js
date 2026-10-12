// The door of app/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { fpsCounter, loop } from './main.js';
export { exitToMainMenu, resetGame, setPaused, togglePause } from './session.js';
export { MUSIC_STYLES, SOUND, playSound, playWorkSound } from './sounds.js';
