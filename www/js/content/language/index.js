// Localization: every text the player sees, per language. English is the default; the player picks
// the language in the main menu and it's remembered on the device.
//
// - names: what things are called, by GAME_CONFIG category and id. applyLanguage() puts them into the
//   config as `label`, so code reads item.label as before. unitNames are generated from faction/gender pools.
// - text: messages, buttons and screens, by key. t(key, { name: ... }) fills in {name}.
// - index.html marks its texts with data-i18n="key" (text), data-i18n-title="key" (accessible label).
//
// A key missing in a language falls back to English, then to the key itself.

import { enLanguage } from './en.js';
import { ukLanguage } from './uk.js';
import { ruLanguage } from './ru.js';

export const LANGUAGES = { ...enLanguage, ...ukLanguage, ...ruLanguage };

LANGUAGES.en.text['craft.kind.supplies'] = 'Supplies';
LANGUAGES.ru.text['craft.kind.supplies'] = 'Снабжение';
LANGUAGES.uk.text['craft.kind.supplies'] = 'Припаси';
