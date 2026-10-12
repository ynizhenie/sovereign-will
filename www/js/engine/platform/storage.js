// What the device remembers between visits (localStorage): settings

function loadSetting(name, fallback) {
  try { return localStorage.getItem(`sovereign-will-${name}`) || fallback; } catch (e) { return fallback; }
}

function saveSetting(name, value) {
  try { localStorage.setItem(`sovereign-will-${name}`, value); } catch (e) { /* not remembered */ }
}
