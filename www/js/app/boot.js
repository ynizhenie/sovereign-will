// The game starts: each file sets up what it needs (wires its buttons, fills its menus...), in the order
// the files depend on each other

import { initIcons, initMapInput, initPageActions, initSheets, initWidgets } from '../ui/index.js';
import { initAudio, initCanvas, initI18n, initInput } from '../engine/platform/index.js';
import { initRng } from '../engine/world/index.js';
import { initSession } from './session.js';
import { initEndlessGenerator, initEndlessRules, initEndlessSaves, initEndlessSetup } from '../modes/endless/index.js';
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
initEndlessSetup();
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
