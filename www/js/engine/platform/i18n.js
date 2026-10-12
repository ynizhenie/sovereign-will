// Texts in the player's language: t(key) for a message, applyNames() for what things are called (into
// GAME_CONFIG's labels), applyPageTexts() for index.html's marked texts. The texts are in content/language.

import { plainText, rebuildConfigHud, setRichText } from '../../ui/index.js';
import { GAME_CONFIG } from '../../content/configs/index.js';
import { LANGUAGES } from '../../content/language/index.js';

export const DEFAULT_LANGUAGE = 'en';

export const LANGUAGE_STORAGE_KEY = 'sovereign-will-language';

// the saved choice, if the device can remember one
export function loadLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && LANGUAGES[saved]) return saved;
  } catch (e) { /* no storage: default */ }
  return DEFAULT_LANGUAGE;
}

export let currentLanguage = loadLanguage();

// The text for `key` in the current language, with {placeholders} filled from `params`
export function t(key, params = {}) {
  const text = LANGUAGES[currentLanguage].text[key] ?? LANGUAGES[DEFAULT_LANGUAGE].text[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
}

// Names from the current language into the config (item.label), falling back to English
export function applyNames() {
  const names = LANGUAGES[currentLanguage].names, fallback = LANGUAGES[DEFAULT_LANGUAGE].names;
  for (const [category, byId] of Object.entries(fallback)) {
    const items = GAME_CONFIG[category];
    if (!items) continue;
    for (const item of Array.isArray(items) ? items : Object.values(items)) {
      const name = (names[category] || {})[item.id] ?? byId[item.id];
      if (name) item.label = name;
    }
  }
}

// Texts marked in index.html (data-i18n / data-i18n-title) in the current language
export function applyPageTexts() {
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll('[data-i18n]').forEach(el => setRichText(el, t(el.dataset.i18n)));
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = plainText(t(el.dataset.i18nPlaceholder)); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = plainText(t(el.dataset.i18nTitle));
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.title);
  });
}

// Switch language: remembered on the device, and everything on screen is redrawn in it
export function setLanguage(language) {
  if (!LANGUAGES[language]) return;
  currentLanguage = language;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch (e) { /* not remembered */ }
  applyNames();
  applyPageTexts();
  if (typeof rebuildConfigHud === 'function') rebuildConfigHud();
}

// What this file sets up as the game starts (called by app/boot.js)
export function initI18n() {
  applyNames();
}
