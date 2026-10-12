// For the tests and the browser console: every module's exports on window under their own names, read live
// from the module (a test may also put its own value in a name's place). The game itself never uses these.

import * as m0 from '../ui/bottom-panel.js';
import * as m1 from '../content/configs/index.js';
import * as m2 from '../content/configs/resources.js';
import * as m3 from '../content/configs/equipment.js';
import * as m4 from '../content/configs/buildings.js';
import * as m5 from '../content/configs/enemies.js';
import * as m6 from '../content/configs/factions.js';
import * as m7 from '../content/configs/units.js';
import * as m8 from '../content/configs/difficulty.js';
import * as m9 from '../content/configs/map.js';
import * as m10 from '../content/configs/mechanics.js';
import * as m11 from '../ui/icons.js';
import * as m12 from '../content/language/index.js';
import * as m13 from '../content/language/en.js';
import * as m14 from '../content/language/uk.js';
import * as m15 from '../content/language/ru.js';
import * as m16 from '../engine/platform/i18n.js';
import * as m17 from '../engine/world/grid.js';
import * as m18 from '../engine/world/state.js';
import * as m19 from '../engine/world/rng.js';
import * as m20 from '../domains/colony/settlers/settlers.panel.js';
import * as m21 from '../domains/colony/equipment/equipment.rules.js';
import * as m22 from '../domains/colony/storage/storage.rules.js';
import * as m23 from '../domains/economy/building/building.rules.js';
import * as m24 from '../domains/world/world.generator.js';
import * as m25 from '../ui/hud.js';
import * as m26 from '../engine/platform/canvas.js';
import * as m27 from '../domains/conflict/waves/waves.rules.js';
import * as m28 from '../domains/conflict/waves/waves.behaviours.js';
import * as m29 from '../domains/conflict/waves/waves.draw.js';
import * as m30 from '../domains/factions/factions.rules.js';
import * as m31 from '../ui/toasts.js';
import * as m32 from '../engine/platform/camera.js';
import * as m33 from '../engine/platform/input.js';
import * as m34 from '../domains/colony/settlers/settlers.rules.js';
import * as m35 from '../domains/economy/gathering/gathering.rules.js';
import * as m36 from '../domains/economy/farming/farming.rules.js';
import * as m37 from '../domains/conflict/healing/healing.rules.js';
import * as m38 from '../domains/factions/undead/undead.rules.js';
import * as m39 from '../engine/platform/dom.js';
import * as m40 from './session.js';
import * as m41 from '../engine/movement/pathfinding.js';
import * as m42 from '../engine/movement/collision.js';
import * as m43 from '../engine/movement/steering.js';
import * as m44 from '../domains/economy/hunting/hunting.rules.js';
import * as m45 from '../domains/conflict/combat/combat.rules.js';
import * as m46 from '../domains/factions/demons/demons.rules.js';
import * as m47 from '../domains/colony/settlers/settlers.draw.js';
import * as m48 from '../domains/economy/fishing/fishing.rules.js';
import * as m49 from '../domains/economy/fishing/fishing.behaviours.js';
import * as m50 from '../ui/map-input.js';
import * as m51 from '../domains/conflict/towers/towers.rules.js';
import * as m52 from '../ui/widgets.js';
import * as m53 from '../ui/page-actions.js';
import * as m54 from '../domains/colony/storage/storage.behaviours.js';
import * as m55 from '../domains/economy/gathering/gathering.behaviours.js';
import * as m56 from '../domains/economy/hunting/hunting.behaviours.js';
import * as m57 from '../domains/economy/hunting/hunting.draw.js';
import * as m58 from '../domains/economy/building/building.behaviours.js';
import * as m59 from '../domains/economy/farming/farming.behaviours.js';
import * as m60 from '../domains/economy/farming/farming.draw.js';
import * as m61 from '../domains/economy/cooking/cooking.behaviours.js';
import * as m62 from '../domains/economy/cooking/cooking.rules.js';
import * as m63 from '../domains/conflict/combat/combat.behaviours.js';
import * as m64 from '../domains/conflict/towers/towers.behaviours.js';
import * as m65 from '../domains/conflict/healing/healing.behaviours.js';
import * as m66 from '../domains/factions/undead/undead.behaviours.js';
import * as m67 from '../domains/factions/demons/demons.behaviours.js';
import * as m68 from '../domains/colony/equipment/equipment.behaviours.js';
import * as m69 from '../domains/colony/settlers/settlers.behaviours.js';
import * as m70 from '../domains/colony/settlers/settlers.orders.js';
import * as m71 from './update.js';
import * as m72 from '../domains/economy/gathering/gathering.draw.js';
import * as m73 from '../domains/economy/building/building.draw.js';
import * as m74 from '../domains/conflict/combat/combat.draw.js';
import * as m75 from '../domains/factions/undead/undead.draw.js';
import * as m76 from '../domains/factions/demons/demons.draw.js';
import * as m77 from '../domains/world/world.draw.js';
import * as m78 from './render.js';
import * as m79 from '../engine/platform/storage.js';
import * as m80 from '../modes/endless/endless.setup.js';
import * as m81 from '../modes/endless/endless.rules.js';
import * as m82 from '../engine/platform/audio.js';
import * as m83 from './main.js';
import * as m84 from '../modes/menu/menu.screens.js';
import * as m85 from '../modes/battle/battle.roster.js';
import * as m86 from '../modes/battle/battle.setup.js';
import * as m87 from '../modes/battle/battle.rules.js';
import * as m88 from '../modes/battle/battle.draw.js';
import * as m89 from '../modes/battle/battle.panel.js';
import * as m90 from '../modes/editor/editor.maps.js';
import * as m91 from '../modes/editor/editor.tools.js';
import * as m92 from '../modes/editor/editor.panel.js';
import * as m93 from '../modes/endless/endless.generator.js';
import * as m94 from '../modes/endless/endless.saves.js';
import * as m95 from '../modes/menu/menu.world.js';
import * as m96 from './sounds.js';

for (const module of [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23, m24, m25, m26, m27, m28, m29, m30, m31, m32, m33, m34, m35, m36, m37, m38, m39, m40, m41, m42, m43, m44, m45, m46, m47, m48, m49, m50, m51, m52, m53, m54, m55, m56, m57, m58, m59, m60, m61, m62, m63, m64, m65, m66, m67, m68, m69, m70, m71, m72, m73, m74, m75, m76, m77, m78, m79, m80, m81, m82, m83, m84, m85, m86, m87, m88, m89, m90, m91, m92, m93, m94, m95, m96]) {
  for (const name of Object.keys(module)) {
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => module[name],
      set(value) { Object.defineProperty(window, name, { configurable: true, writable: true, value }); }
    });
  }
}
