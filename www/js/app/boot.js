// The game starts: each file sets up what it needs (wires its buttons, fills its menus...), in the order
// the files depend on each other

import { initIcons } from '../ui/icons.js';
import { initI18n } from '../engine/platform/i18n.js';
import { initRng } from '../engine/world/rng.js';
import { initCanvas } from '../engine/platform/canvas.js';
import { initInput } from '../engine/platform/input.js';
import { initSession } from './session.js';
import { initMapInput } from '../ui/map-input.js';
import { initWidgets } from '../ui/widgets.js';
import { initPageActions } from '../ui/page-actions.js';
import { initEndlessSetup } from '../modes/endless/endless.setup.js';
import { initEndlessRules } from '../modes/endless/endless.rules.js';
import { initAudio } from '../engine/platform/audio.js';
import { initMain } from './main.js';
import { initMenuScreens } from '../modes/menu/menu.screens.js';
import { initBattlePanel } from '../modes/battle/battle.panel.js';
import { initEditorPanel } from '../modes/editor/editor.panel.js';
import { initEndlessGenerator } from '../modes/endless/endless.generator.js';
import { initEndlessSaves } from '../modes/endless/endless.saves.js';
import { initMenuWorld } from '../modes/menu/menu.world.js';
import { initSounds } from './sounds.js';
import './debug.js';

initIcons();
initI18n();
initRng();
initCanvas();
initInput();
initSession();
initMapInput();
initWidgets();
initPageActions();
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
