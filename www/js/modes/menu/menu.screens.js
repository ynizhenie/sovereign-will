// The main menu's screens: home, settings (language, frame rate, FPS counter, sound, music), and the opening

import { LANGUAGES } from '../../content/language/index.js';
import { audio, currentLanguage, fitCanvasToScreen, loadSetting, onTap, quality, saveSetting, setLanguage, setMusicOn, setSoundOn, t, VSYNC } from '../../engine/platform/index.js';
import { fpsCounter, isTrackOn, loop, musicCatalog, musicPreview, previewTrack, setTrackOn } from '../../app/index.js';
import { flagHtml, iconHtml } from '../../ui/index.js';

export const mainMenu = document.getElementById('main-menu');

export function showMenuScreen(name) {
  if (name !== 'settings' && musicPreview.id) previewTrack(''); // (a track listened to stops as Settings is left, #326)
  if (name === 'settings') renderMusicPlayer();
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

  // the opening animation, once, as the page loads (style.css: #main-menu.intro)
  document.getElementById('main-menu').classList.add('intro');
  setTimeout(() => document.getElementById('main-menu').classList.remove('intro'), 3500);
  onTap(document.getElementById('mode-endless'), () => showMenuScreen('endless'));
  onTap(document.getElementById('open-settings'), () => showMenuScreen('settings'));
  document.querySelectorAll('#main-menu [data-back]').forEach(button => onTap(button, () => {
    // opened from the pause menu (#254): back to it, over the game
    if (mainMenu.dataset.fromPause === 'yes') {
      delete mainMenu.dataset.fromPause;
      mainMenu.style.display = 'none';
      document.getElementById('pause-menu').hidden = false;
    }
    showMenuScreen('home');
  }));
  exitButton.hidden = !nativeApp;
  onTap(exitButton, () => { if (nativeApp) nativeApp.exitApp(); });
  markFps();
  fpsOptions.forEach(button => button.dataset.fps && onTap(button, () => {
    loop.frameRate = button.dataset.fps;
    saveSetting('fps', loop.frameRate);
    markFps();
  }));
  // (#322) VSYNC: remembered, used from the next start (the canvas is made with it); the picture's quality at once
  const markVsync = value => document.querySelectorAll('[data-vsync]').forEach(b => b.classList.toggle('active', b.dataset.vsync === value));
  markVsync(VSYNC ? 'on' : 'off');
  document.querySelectorAll('[data-vsync]').forEach(button => onTap(button, () => {
    saveSetting('vsync', button.dataset.vsync);
    markVsync(button.dataset.vsync);
    document.getElementById('vsync-note').hidden = (button.dataset.vsync === 'on') === VSYNC;
  }));
  const markQuality = () => document.querySelectorAll('[data-quality]').forEach(b => b.classList.toggle('active', b.dataset.quality === quality.level));
  markQuality();
  document.querySelectorAll('[data-quality]').forEach(button => onTap(button, () => {
    quality.level = /** @type {string} */ (button.dataset.quality);
    saveSetting('quality', quality.level);
    markQuality();
    fitCanvasToScreen();
  }));
  applyShowFps(loadSetting('showFps', 'off'));
  showFpsOptions.forEach(button => onTap(button, () => {
    saveSetting('showFps', button.dataset.showFps);
    applyShowFps(button.dataset.showFps);
  }));
  // (#326) the languages: in Settings each with its flag and its name, and by the Settings button a square of the flags
  const markLanguage = () => { document.querySelectorAll('[data-language]').forEach(b => b.classList.toggle('active', b.dataset.language === currentLanguage)); renderMusicPlayer(); };
  const flagBox = document.getElementById('menu-flags');
  for (const [code, language] of Object.entries(LANGUAGES)) {
    const button = document.createElement('button');
    button.className = 'wave-option language-option';
    button.dataset.language = code;
    button.innerHTML = `${flagHtml(code)}<span>${language.label}</span>`;
    languageOptions.appendChild(button);
    onTap(button, () => { setLanguage(code); markLanguage(); });
    const small = document.createElement('button');
    small.className = 'flag-button';
    small.dataset.language = code;
    small.title = language.label;
    small.setAttribute('aria-label', language.label);
    small.innerHTML = flagHtml(code);
    flagBox.appendChild(small);
    onTap(small, () => { setLanguage(code); markLanguage(); });
    markLanguage();
  }
  markAudioOptions();
  document.querySelectorAll('[data-sound]').forEach(b => onTap(b, () => { setSoundOn(b.dataset.sound === 'on'); markAudioOptions(); }));
  document.querySelectorAll('[data-music]').forEach(b => onTap(b, () => { setMusicOn(b.dataset.music === 'on'); markAudioOptions(); }));
}
