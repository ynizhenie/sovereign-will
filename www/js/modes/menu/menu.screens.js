// The main menu's screens: home, Endless setup and saves, settings (language, frame rate, sound, music), and the opening

import { LANGUAGES } from '../../content/language/index.js';
import { audio, currentLanguage, DEV_SETTINGS, GL, loadSetting, onTap, saveSetting, setLanguage, setMusicOn, setSoundOn, t, VSYNC } from '../../engine/platform/index.js';
import { fpsCounter, isTrackOn, loop, musicCatalog, musicPreview, perf, previewTrack, setPerfMonitor, setTrackOn } from '../../app/index.js';
import { flagHtml, iconHtml } from '../../ui/index.js';
import { areShadowsEnabled, setShadowsEnabled } from '../../domains/world/index.js';

export const mainMenu = document.getElementById('main-menu');
const MODE_INFO = {
  endless: { title: 'menu.endless', description: 'menu.modeInfo.endless' },
  plague: { title: 'plague.title', description: 'menu.modeInfo.plague' },
  battle: { title: 'menu.battles', description: 'menu.modeInfo.battle' },
  editor: { title: 'menu.editor', description: 'menu.modeInfo.editor' }
};
const seedPanel = document.getElementById('seed-settings');
if (!seedPanel) throw new Error('The shared seed panel is missing');
const seedInputElement = document.getElementById('seed-input');
if (!seedInputElement) throw new Error('The shared seed input is missing');
const seedInput = /** @type {HTMLInputElement} */ (seedInputElement);
/** @type {'endless' | 'editor' | 'plague' | null} */
let seedScreen = 'endless';

export function showMenuScreen(name) {
  if (name !== 'settings' && name !== 'music' && musicPreview.id) previewTrack(''); // (a track listened to stops as the menu is left, #326)
  if (name === 'settings' || name === 'music') renderMusicPlayer();
  if (name === 'endless' || name === 'editor' || name === 'plague') {
    const seedSlot = document.querySelector(`[data-seed-slot="${name}"]`);
    if (!seedSlot) throw new Error(`The ${name} seed slot is missing`);
    seedSlot.appendChild(seedPanel);
    seedScreen = name;
  } else {
    seedScreen = null;
  }
  document.querySelectorAll('#main-menu .main-menu-content[data-screen]').forEach(screen => { screen.hidden = screen.dataset.screen !== name; });
  document.getElementById('main-menu').dataset.menuScreen = name; // the title shows on the first screen
}

// (#326) The player in Settings: each track of the game by where it plays, with its name, when it plays, a button to listen to it
// (again: stops) and a switch (off: it's never picked)
export function renderMusicPlayer() {
  const box = document.getElementById('music-player');
  if (!box) return;
  box.innerHTML = '';
  const word = id => (id === 'menu' ? t('music.menuName') : t(`music.name.${id.slice(id.indexOf('_') + 1)}`));
  for (const group of musicCatalog()) {
    const head = document.createElement('div');
    head.className = 'music-group';
    head.textContent = group.label;
    box.appendChild(head);
    for (const track of group.tracks) {
      const row = document.createElement('div');
      row.className = 'music-row' + (isTrackOn(track.id) ? '' : ' off');
      row.dataset.track = track.id;
      const listen = document.createElement('button');
      listen.className = 'btn music-listen' + (musicPreview.id === track.id ? ' on' : '');
      listen.innerHTML = iconHtml(musicPreview.id === track.id ? 'stop' : 'play');
      listen.setAttribute('aria-label', t(musicPreview.id === track.id ? 'music.stop' : 'music.listen'));
      onTap(listen, () => { previewTrack(musicPreview.id === track.id ? '' : track.id); renderMusicPlayer(); });
      const name = document.createElement('span');
      name.className = 'music-name';
      name.innerHTML = `<b>${word(track.id)}</b><small>${t(track.when)}</small>`;
      const toggle = document.createElement('button');
      toggle.className = 'btn music-toggle' + (isTrackOn(track.id) ? ' on' : '');
      toggle.textContent = t(isTrackOn(track.id) ? 'menu.on' : 'menu.off');
      onTap(toggle, () => { setTrackOn(track.id, !isTrackOn(track.id)); renderMusicPlayer(); });
      row.append(listen, name, toggle);
      box.appendChild(row);
    }
  }
}

// Exit closes the app on Android; a browser tab can't close itself, so there it isn't shown
export const nativeApp = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
  window.Capacitor.Plugins && window.Capacitor.Plugins.App;

export const exitButton = document.getElementById('exit-app');

// frame rate (Settings), remembered on the device
export const fpsOptions = document.querySelectorAll('.fps-option[data-fps]');

export const markFps = () => fpsOptions.forEach(b => b.classList.toggle('active', b.dataset.fps === loop.frameRate));

// FPS counter on / off (Settings), remembered on the device
export const showFpsOptions = document.querySelectorAll('[data-show-fps]');

export const applyShowFps = value => {
  fpsCounter.hidden = value !== 'on';
  showFpsOptions.forEach(b => b.classList.toggle('active', b.dataset.showFps === value));
};

// language buttons in the main menu (see i18n.js)
export const languageOptions = document.getElementById('language-options');

// ---- The Settings: sound and music on / off, remembered on the device
export const markAudioOptions = () => {
  document.querySelectorAll('[data-sound]').forEach(b => b.classList.toggle('active', (b.dataset.sound === 'on') === audio.soundOn));
  document.querySelectorAll('[data-music]').forEach(b => b.classList.toggle('active', (b.dataset.music === 'on') === audio.musicOn));
};

// What this file sets up as the game starts (called by app/boot.js)
export function initMenuScreens() {
  // ---- Main menu screens: home (modes), endless (setup), settings
  seedInput.value = loadSetting('worldSeed', seedInput.value);
  seedInput.addEventListener('input', () => saveSetting('worldSeed', seedInput.value));

  // the opening animation, once, as the page loads (style.css: #main-menu.intro)
  document.getElementById('main-menu').classList.add('intro');
  setTimeout(() => document.getElementById('main-menu').classList.remove('intro'), 3500);
  onTap(document.getElementById('open-modes'), () => showMenuScreen('modes'));
  onTap(document.getElementById('mode-endless'), () => showMenuScreen('endless'));
  onTap(document.getElementById('open-settings'), () => showMenuScreen('settings'));
  onTap(document.getElementById('open-music-player'), () => showMenuScreen('music'));
  document.querySelectorAll('[data-mode-info]').forEach(button => onTap(button, () => {
    const mode = button.dataset.modeInfo;
    const info = MODE_INFO[mode];
    if (!info) throw new Error(`Unknown mode information screen: ${mode}`);
    const title = document.getElementById('mode-description-title');
    const description = document.getElementById('mode-description-text');
    const back = document.querySelector('[data-screen="mode-description"] [data-back]');
    if (!title || !description || !back) throw new Error('The mode description screen is incomplete');
    title.dataset.i18n = info.title;
    title.textContent = t(info.title);
    description.dataset.i18n = info.description;
    description.textContent = t(info.description);
    back.dataset.backTo = mode;
    showMenuScreen('mode-description');
  }));
  document.querySelectorAll('#main-menu [data-back]').forEach(button => onTap(button, () => {
    // opened from the pause menu (#254): back to it, over the game
    if (mainMenu.dataset.fromPause === 'yes') {
      delete mainMenu.dataset.fromPause;
      mainMenu.style.display = 'none';
      document.getElementById('pause-menu').hidden = false;
      showMenuScreen('home');
      return;
    }
    showMenuScreen(button.dataset.backTo || 'home');
  }));
  exitButton.hidden = !nativeApp;
  onTap(exitButton, () => { if (nativeApp) nativeApp.exitApp(); });
  markFps();
  fpsOptions.forEach(button => button.dataset.fps && onTap(button, () => {
    loop.frameRate = button.dataset.fps;
    saveSetting('fps', loop.frameRate);
    markFps();
  }));
  // (#322) VSYNC: remembered, used from the next start (the canvas is made with it)
  const markVsync = value => document.querySelectorAll('[data-vsync]').forEach(b => b.classList.toggle('active', b.dataset.vsync === value));
  markVsync(VSYNC ? 'on' : 'off');
  document.querySelectorAll('[data-vsync]').forEach(button => onTap(button, () => {
    saveSetting('vsync', button.dataset.vsync);
    markVsync(button.dataset.vsync);
    document.getElementById('vsync-note').hidden = (button.dataset.vsync === 'on') === VSYNC;
  }));
  // the developers' settings (WebGL, the performance monitor): hidden but with ?dev
  if (DEV_SETTINGS) document.querySelectorAll('.dev-setting').forEach(row => { /** @type {HTMLElement} */ (row).hidden = false; });
  // a trial: the ground and nature drawn by the graphics card (remembered, used from the next start)
  const markGl = value => document.querySelectorAll('[data-gl]').forEach(b => b.classList.toggle('active', b.dataset.gl === value));
  markGl(GL ? 'on' : 'off');
  document.querySelectorAll('[data-gl]').forEach(button => onTap(button, () => {
    saveSetting('gl', button.dataset.gl);
    markGl(button.dataset.gl);
    document.getElementById('gl-note').hidden = (button.dataset.gl === 'on') === GL;
  }));
  applyShowFps(loadSetting('showFps', 'off'));
  showFpsOptions.forEach(button => onTap(button, () => {
    saveSetting('showFps', button.dataset.showFps);
    applyShowFps(button.dataset.showFps);
  }));
  const markPerfMonitor = () => document.querySelectorAll('[data-perf-monitor]').forEach(b => b.classList.toggle('active', (b.dataset.perfMonitor === 'on') === perf.on));
  markPerfMonitor();
  document.querySelectorAll('[data-perf-monitor]').forEach(button => onTap(button, () => { setPerfMonitor(button.dataset.perfMonitor === 'on'); markPerfMonitor(); }));
  const markShadows = enabled => document.querySelectorAll('[data-shadows]').forEach(button => button.classList.toggle('active', (button.dataset.shadows === 'on') === enabled));
  markShadows(areShadowsEnabled());
  document.querySelectorAll('[data-shadows]').forEach(button => onTap(button, () => {
    setShadowsEnabled(button.dataset.shadows === 'on');
    markShadows(areShadowsEnabled());
  }));
  // (#326) the languages: in Settings each with its flag and its name, and by the Settings button the flag of the one now
  // (a drop-down: the one now shown, the list under it opened by a tap on it and closed by a choice or a tap elsewhere)
  const currentButton = /** @type {HTMLElement} */ (document.getElementById('language-current'));
  const languageList = /** @type {HTMLElement} */ (document.getElementById('language-list'));
  const openList = open => { languageList.hidden = !open; currentButton.setAttribute('aria-expanded', String(open)); };
  const markLanguage = () => {
    languageList.querySelectorAll('[data-language]').forEach(b => b.classList.toggle('active', /** @type {HTMLElement} */ (b).dataset.language === currentLanguage));
    currentButton.innerHTML = `${flagHtml(currentLanguage)}<span>${LANGUAGES[currentLanguage].label}</span><i class="language-caret" aria-hidden="true">▾</i>`;
    renderMusicPlayer();
  };
  const flagBox = document.getElementById('menu-flags');
  for (const [code, language] of Object.entries(LANGUAGES)) {
    const button = document.createElement('button');
    button.className = 'wave-option language-option';
    button.dataset.language = code;
    button.setAttribute('role', 'option');
    button.innerHTML = `${flagHtml(code)}<span>${language.label}</span>`;
    languageList.appendChild(button);
    onTap(button, () => { setLanguage(code); markLanguage(); showFlag(); openList(false); });
  }
  onTap(currentButton, () => openList(languageList.hidden));
  document.addEventListener('pointerdown', e => { if (!languageList.hidden && !languageOptions.contains(/** @type {Node} */ (e.target))) openList(false); });
  // (#326) by the Settings button one flag, the language's now: a tap on it is the next language
  const flagButton = document.createElement('button');
  flagButton.className = 'flag-button';
  flagBox.appendChild(flagButton);
  const showFlag = () => { flagButton.innerHTML = flagHtml(currentLanguage); flagButton.setAttribute('aria-label', LANGUAGES[currentLanguage].label); };
  onTap(flagButton, () => { const codes = Object.keys(LANGUAGES); setLanguage(codes[(codes.indexOf(currentLanguage) + 1) % codes.length]); markLanguage(); showFlag(); });
  showFlag();
  markLanguage();
  markAudioOptions();
  document.querySelectorAll('[data-sound]').forEach(b => onTap(b, () => { setSoundOn(b.dataset.sound === 'on'); markAudioOptions(); }));
  document.querySelectorAll('[data-music]').forEach(b => onTap(b, () => { setMusicOn(b.dataset.music === 'on'); markAudioOptions(); }));
}
