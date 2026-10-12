// The main menu's screens: home, settings (language, frame rate, FPS counter, sound, music), and the opening

const mainMenu = document.getElementById('main-menu');

// ---- Main menu screens: home (modes), endless (setup), settings

// the opening animation, once, as the page loads (style.css: #main-menu.intro)
document.getElementById('main-menu').classList.add('intro');

setTimeout(() => document.getElementById('main-menu').classList.remove('intro'), 3500);

function showMenuScreen(name) {
  document.querySelectorAll('#main-menu .main-menu-content[data-screen]').forEach(screen => { screen.hidden = screen.dataset.screen !== name; });
  document.getElementById('main-menu').dataset.menuScreen = name; // the title shows on the first screen
}

onTap(document.getElementById('mode-endless'), () => showMenuScreen('endless'));

onTap(document.getElementById('open-settings'), () => showMenuScreen('settings'));

document.querySelectorAll('#main-menu [data-back]').forEach(button => onTap(button, () => showMenuScreen('home')));

// Exit closes the app on Android; a browser tab can't close itself, so there it isn't shown
const nativeApp = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
  window.Capacitor.Plugins && window.Capacitor.Plugins.App;

const exitButton = document.getElementById('exit-app');

exitButton.hidden = !nativeApp;

onTap(exitButton, () => { if (nativeApp) nativeApp.exitApp(); });

// frame rate (Settings), remembered on the device
const fpsOptions = document.querySelectorAll('.fps-option[data-fps]');

const markFps = () => fpsOptions.forEach(b => b.classList.toggle('active', b.dataset.fps === frameRateSetting));

markFps();

fpsOptions.forEach(button => button.dataset.fps && onTap(button, () => {
  frameRateSetting = button.dataset.fps;
  saveSetting('fps', frameRateSetting);
  markFps();
}));

// FPS counter on / off (Settings), remembered on the device
const showFpsOptions = document.querySelectorAll('[data-show-fps]');

const applyShowFps = value => {
  fpsCounter.hidden = value !== 'on';
  showFpsOptions.forEach(b => b.classList.toggle('active', b.dataset.showFps === value));
};

applyShowFps(loadSetting('showFps', 'off'));

showFpsOptions.forEach(button => onTap(button, () => {
  saveSetting('showFps', button.dataset.showFps);
  applyShowFps(button.dataset.showFps);
}));

// language buttons in the main menu (see i18n.js)
const languageOptions = document.getElementById('language-options');

for (const [code, language] of Object.entries(LANGUAGES)) {
  const button = document.createElement('button');
  button.className = 'wave-option' + (code === currentLanguage ? ' active' : '');
  button.dataset.language = code;
  button.textContent = language.label;
  languageOptions.appendChild(button);
  onTap(button, () => {
    setLanguage(code);
    languageOptions.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.language === code));
  });
}

// ---- The Settings: sound and music on / off, remembered on the device
const markAudioOptions = () => {
  document.querySelectorAll('[data-sound]').forEach(b => b.classList.toggle('active', (b.dataset.sound === 'on') === audio.soundOn));
  document.querySelectorAll('[data-music]').forEach(b => b.classList.toggle('active', (b.dataset.music === 'on') === audio.musicOn));
};

markAudioOptions();

document.querySelectorAll('[data-sound]').forEach(b => onTap(b, () => { setSoundOn(b.dataset.sound === 'on'); markAudioOptions(); }));

document.querySelectorAll('[data-music]').forEach(b => onTap(b, () => { setMusicOn(b.dataset.music === 'on'); markAudioOptions(); }));
