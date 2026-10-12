// What the device remembers between visits (localStorage), each thing under 'sovereign-will-<name>':
// settings as plain strings, data (saves, maps, presets, the sides) as JSON. A device that can't remember
// (private mode, storage full) just doesn't: loading gives the fallback, saving says false.

const key = name => `sovereign-will-${name}`;

export function loadSetting(name, fallback) {
  try { return localStorage.getItem(key(name)) || fallback; } catch (e) { return fallback; }
}

export function saveSetting(name, value) {
  try { localStorage.setItem(key(name), value); return true; } catch (e) { return false; }
}

export function loadData(name, fallback) {
  try { return JSON.parse(localStorage.getItem(key(name))) ?? fallback; } catch (e) { return fallback; }
}

export function saveData(name, value) {
  try { localStorage.setItem(key(name), JSON.stringify(value)); return true; } catch (e) { return false; }
}
