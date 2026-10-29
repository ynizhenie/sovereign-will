// The game starts: each file sets up what it needs (wires its buttons, fills its menus...), in the order
// the files depend on each other

import { initIcons, initItemInfo, initMapInput, initPageActions, initSheets, initWidgets, initWorldMap } from '../ui/index.js';
import { initAudio, initCanvas, initI18n, initInput } from '../engine/platform/index.js';
import { initRng } from '../engine/world/index.js';
import { initSession } from './session.js';
import { initEndlessCards, initEndlessGenerator, initEndlessRules, initEndlessSaves, initEndlessSetup, restoreEndlessChoices } from '../modes/endless/index.js';
import { initMain } from './main.js';
import { initMenuScreens, initMenuWorld } from '../modes/menu/index.js';
import { initBattlePanel } from '../modes/battle/index.js';
import { initEditorPanel } from '../modes/editor/index.js';
import { initSounds } from './sounds.js';

initIcons();
initI18n();
initRng();
initCanvas();
initInput();
initSession();
initMapInput();
initWidgets();
initPageActions();
initSheets();
initItemInfo();
initWorldMap();
initEndlessSetup();
initEndlessCards();
initEndlessRules();
initAudio();
initMain();
initMenuScreens();
initBattlePanel();
initEditorPanel();
initEndlessGenerator();
initEndlessSaves();
initMenuWorld();
initSounds();
restoreEndlessChoices(); // (#326: what was picked last time, once every button is set up)

// (#326) everything made: the page shows (till now only its dark background: the menu half made flashed up)
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('booting')));
