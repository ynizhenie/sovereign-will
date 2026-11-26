// The main menu's screens: home, Endless setup and saves, settings (language, frame rate, sound, music), and the opening

import { LANGUAGES } from '../../content/language/index.js';
import { audio, currentLanguage, DEV_SETTINGS, GL, loadSetting, onTap, saveSetting, setLanguage, setMusicVolume, setSoundVolume, t, VSYNC } from '../../engine/platform/index.js';
import { fpsCounter, isTrackOn, loop, musicCatalog, musicPreview, perf, previewTrack, setPerfMonitor, setTrackOn } from '../../app/index.js';
import { dimGlide, flagHtml, iconHtml } from '../../ui/index.js';
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

// A row of options as one segmented track (style.css .segmented): the chosen one's plank a thumb sliding under it,
// placed where the chosen option is whenever the choice or the row's size changes (shown at last, say)
function initSegments() {
  // (every row of options in the menu that's only its options' buttons, not the On / Off switches)
  for (const row of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#main-menu .wave-options:not(.switch)'))) {
    const options = [...row.children];
    // (choices only: a row of actions, buttons with names of their own like the editor's Empty map, stays as it is)
    if (options.length < 2 || !options.every(el => el.tagName === 'BUTTON' && !el.id)) continue;
    row.classList.add('segmented');
    const thumb = document.createElement('div');
    thumb.className = 'segment-thumb jump';
    row.prepend(thumb);
    const place = () => {
      const chosen = /** @type {HTMLElement | null} */ (row.querySelector(':scope > .active'));
      thumb.hidden = !chosen || !row.offsetWidth;
      if (thumb.hidden || !chosen) { thumb.classList.add('jump'); return; }
      thumb.style.width = `${chosen.offsetWidth}px`;
      thumb.style.transform = `translateX(${chosen.offsetLeft}px)`;
      if (thumb.classList.contains('jump')) { void thumb.offsetWidth; thumb.classList.remove('jump'); }
    };
    // (the options' own classes watched, not the thumb's: its own changes would wake this again)
    const watch = new MutationObserver(place);
    for (const option of row.querySelectorAll(':scope > button')) watch.observe(option, { attributes: true, attributeFilter: ['class'] });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(row);
    place();
  }
}

// An Off / On setting drawn as a switch (style.css .wave-options.switch): a tap on the half already chosen flips it to
// the other, as a switch does, rather than choosing it again
function initSwitches() {
  for (const track of document.querySelectorAll('#main-menu .wave-options.switch')) {
    const flip = /** @param {Event} e */ e => {
      const button = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('button'));
      if (!button || !button.classList.contains('active')) return;
      const other = [...track.querySelectorAll('button')].find(b => b !== button);
      if (!other) return;
      e.stopPropagation(); e.preventDefault();
      if (e.type === 'click') other.click(); // (a touch's own click is stopped by preventDefault; the touch flips it below)
      else other.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    track.addEventListener('click', flip, true);
    track.addEventListener('touchend', flip, true);
  }
}

// Settings' groups (General, Graphics, Sound): each a panel drawn out beside Settings, one at a time, put away by a tap
// on its button again; on a narrow screen it comes out under the buttons (the music player is in Sound's)
/** @type {string | null} */
let settingsDrawer = null;
const drawerOf = name => /** @type {HTMLElement} */ (document.querySelector(`[data-drawer="${name}"]`));
const placeDrawer = () => {
  const settings = /** @type {HTMLElement} */ (document.querySelector('[data-screen="settings"]'));
  // (Settings' step aside slid, from where it was to where it goes; the glass under it slides itself, placeGlass)
  const stepTo = /** @param {number} shift */ shift => {
    const from = Number.parseFloat(settings.style.left || '0');
    settings.style.left = shift ? `${shift}px` : '';
    // (played as a transform from where it was: the graphics card's, smooth; nothing of it stays when it's done)
    if (from !== shift && settings.animate) settings.animate([{ transform: `translateX(${from - shift}px)` }, { transform: 'none' }], { duration: GLASS_MS, easing: GLASS_EASE });
    placeGlass();
  };
  if (!settingsDrawer) { if (settings.style.left) stepTo(0); return; }
  const panel = drawerOf(settingsDrawer);
  // (where Settings stands by itself; with no room beside it but room for the two side by side, as on a phone on its
  // side, Settings steps left and the two stand in the middle together)
  // (in the menu's own pixels: it's zoomed on a big screen, see style.css, and a panel's place is set inside it)
  const z = menuZoom(), W = innerWidth / z, H = innerHeight / z;
  const at = settings.getBoundingClientRect(), was = Number.parseFloat(settings.style.left || '0');
  /** @type {{ top: number, bottom: number, left: number, right: number, width: number }} */
  let box = { top: at.top / z, bottom: at.bottom / z, left: at.left / z - was, right: at.right / z - was, width: at.width / z };
  let room = W - box.right - 20, shift = 0;
  if (room < 240 && W - box.width - 36 >= 240) {
    room = Math.min(320, W - box.width - 36);
    shift = Math.round((W - (box.width + 12 + room)) / 2 - box.left);
    box = { ...box, left: box.left + shift, right: box.right + shift };
  }
  stepTo(shift);
  // (beside it when there's room for one at least 240 wide; under it on a phone upright)
  const beside = room >= 240, width = beside ? Math.min(320, room) : Math.min(320, W - 24);
  const top = beside ? box.top : box.bottom + 10;
  panel.style.setProperty('--drawer-top', `${top}px`);
  panel.style.setProperty('--drawer-left', `${beside ? box.right + 12 : Math.max(12, box.left + (box.width - width) / 2)}px`);
  panel.style.setProperty('--drawer-width', `${width}px`);
  panel.style.setProperty('--drawer-max-height', `${Math.max(160, H - top - 12)}px`);
  panel.classList.toggle('below', !beside);
};
/** @param {string | null} name the group to draw out, null: none */
export function setSettingsDrawer(name) {
  settingsDrawer = name;
  document.querySelectorAll('[data-drawer]').forEach(panel => { /** @type {HTMLElement} */ (panel).hidden = /** @type {HTMLElement} */ (panel).dataset.drawer !== name; });
  document.querySelectorAll('[data-settings-group]').forEach(button => button.classList.toggle('active', /** @type {HTMLElement} */ (button).dataset.settingsGroup === name));
  placeDrawer();
}
if (typeof addEventListener === 'function') addEventListener('resize', placeDrawer); // (not in the Node tests)

// The menu's one pane of glass (#menu-glass) laid under the screen showing: from screen to screen it moves and takes
// the new one's size, so the pane stays and only what's on it changes
let glassFor = '';
// The player's Interface size (Settings > General): 0.85 to 1.45, on the menu and the game's panels (style.css --ui-scale)
const UI_SCALES = [0.85, 1, 1.15, 1.3, 1.45]; // (shown as 1 to 5; 2 is as it was)
export const uiScale = () => { const v = Number(loadSetting('uiScale', '1')); return UI_SCALES.includes(v) ? v : 1; };
/** @param {number} scale */
export function setUiScale(scale) {
  saveSetting('uiScale', String(scale));
  document.documentElement.style.setProperty('--ui-scale', String(uiScale()));
}
if (typeof document !== 'undefined' && document.documentElement) document.documentElement.style.setProperty('--ui-scale', String(uiScale()));
// how much the menu is zoomed (style.css: bigger on a bigger screen)
const menuZoom = () => Number.parseFloat(getComputedStyle(mainMenu).zoom) || 1;
const GLASS_MS = 340, GLASS_EASE = 'cubic-bezier(0.25, 0.85, 0.3, 1)';
function placeGlass() {
  const glass = document.getElementById('menu-glass');
  const screen = /** @type {HTMLElement | null} */ (document.querySelector('#main-menu .main-menu-content[data-screen]:not([hidden])'));
  if (!glass) return;
  if (!screen || !screen.offsetWidth) { glass.classList.remove('on'); glassFor = ''; return; }
  // (where the screen goes, not where a step aside sliding it has it now: its set left, not the sliding one)
  const sliding = Number.parseFloat(getComputedStyle(screen).left) || 0, going = Number.parseFloat(screen.style.left || '0');
  const to = { left: screen.offsetLeft - sliding + going, top: screen.offsetTop, width: screen.offsetWidth, height: screen.offsetHeight };
  // where it shows now (mid-move too), to move from: laid at once where it goes, and played from there to it by the
  // graphics card (a transform), not its size and place worked out again each frame on a page the scene keeps busy
  const from = glassFor ? glass.getBoundingClientRect() : null, parent = /** @type {HTMLElement} */ (glass.offsetParent || glass.parentElement);
  const origin = parent.getBoundingClientRect();
  glass.getAnimations?.().forEach(a => a.cancel());
  Object.assign(glass.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
  if (from && from.width && glass.animate) {
    const z = menuZoom(); // (the rects are the screen's, the glass's place and transform the zoomed menu's)
    const now = { x: origin.left / z + to.left - parent.scrollLeft, y: origin.top / z + to.top - parent.scrollTop };
    const dx = from.left / z - now.x, dy = from.top / z - now.y, sx = from.width / z / to.width, sy = from.height / z / to.height;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sx - 1) > 0.002 || Math.abs(sy - 1) > 0.002) {
      glass.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }], { duration: GLASS_MS, easing: GLASS_EASE });
    }
  }
  glass.classList.add('on');
  glassFor = screen.dataset.screen || '';
}
if (typeof ResizeObserver !== 'undefined') {
  const watch = new ResizeObserver(() => placeGlass());
  queueMicrotask(() => document.querySelectorAll('#main-menu .main-menu-content[data-screen]').forEach(screen => watch.observe(screen)));
}
if (typeof addEventListener === 'function') addEventListener('resize', () => placeGlass());

export function showMenuScreen(name) {
  if (name !== 'settings' && settingsDrawer) setSettingsDrawer(null);
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
  document.querySelectorAll('#main-menu .main-menu-content[data-screen]').forEach(screen => {
    screen.hidden = screen.dataset.screen !== name;
  });
  document.getElementById('main-menu').dataset.menuScreen = name; // the title shows on the first screen
  placeGlass();
}

// (#326) The player in Settings: each track of the game by where it plays, with its name, when it plays, a button to listen to it
// (again: stops) and a switch (off: it's never picked)
export function renderMusicPlayer() {
  const box = document.getElementById('music-player');
  if (!box) return;
  box.innerHTML = '';
  const word = id => (id === 'menu' ? t('music.menuName') : t(`music.name.${id.slice(id.indexOf('_') + 1)}`));
  let number = 0; // (every track numbered in turn, the menu's 0)
  const el = (tag, className, text) => { const e = document.createElement(tag); e.className = className; if (text !== undefined) e.textContent = text; return e; };
  /** @param {{ id: string }} track */
  const row = track => {
    const line = el('div', 'music-row' + (isTrackOn(track.id) ? '' : ' off'));
    line.dataset.track = track.id;
    const listen = el('button', 'btn music-listen' + (musicPreview.id === track.id ? ' on' : ''));
    listen.innerHTML = iconHtml(musicPreview.id === track.id ? 'stop' : 'play');
    listen.setAttribute('aria-label', t(musicPreview.id === track.id ? 'music.stop' : 'music.listen'));
    onTap(listen, () => { previewTrack(musicPreview.id === track.id ? '' : track.id); renderMusicPlayer(); });
    const name = el('span', 'music-name');
    name.innerHTML = `<span class="music-number">${t('music.track', { n: number++ })}</span><b>${word(track.id)}</b><i class="ic ic-moon music-moon" aria-hidden="true"></i>`;
    const toggle = el('button', 'btn music-toggle' + (isTrackOn(track.id) ? ' on' : ''), t(isTrackOn(track.id) ? 'menu.on' : 'menu.off'));
    onTap(toggle, () => { setTrackOn(track.id, !isTrackOn(track.id)); renderMusicPlayer(); });
    line.append(listen, name, toggle);
    return line;
  };
  // A card a group: the menu's, the Plague's (one a level in turn), the Battles' and each side's; in a side's the calm
  // tracks, then the fight's, those of the night marked with a moon (the Battles' duel and uneven fight under them)
  const CALM = ['ambient', 'nightAmbient'], FIGHT = ['battle', 'nightBattle'], NIGHT = ['nightAmbient', 'nightBattle'];
  const cards = el('div', 'music-cards');
  for (const group of musicCatalog()) {
    const card = el('div', 'music-card');
    card.dataset.group = group.id;
    card.appendChild(el('div', 'music-group', group.label));
    const tracks = /** @type {any[]} */ (group.tracks);
    const add = list => list.forEach(track => { const line = row(track); if (NIGHT.includes(track.kind)) line.classList.add('night'); card.appendChild(line); });
    if (group.id === 'menu' || group.id === 'plague') add(tracks);
    else {
      for (const [kinds, part] of [[CALM, 'calm'], [FIGHT, 'fight']]) {
        const list = tracks.filter(track => kinds.includes(track.kind));
        if (list.length) { card.appendChild(el('div', 'music-part', t(`music.${part}`))); add(list); }
      }
      const other = tracks.filter(track => !CALM.includes(track.kind) && !FIGHT.includes(track.kind));
      if (other.length) { card.appendChild(el('div', 'music-part', t('music.when.arenaDuel'))); add(other); }
    }
    cards.appendChild(card);
  }
  box.appendChild(cards);
}

// Exit closes the app on Android; a browser tab can't close itself, so there it isn't shown
export const nativeApp = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
  window.Capacitor.Plugins && window.Capacitor.Plugins.App;

export const exitButton = document.getElementById('exit-app');

// Back in the menu without looking for the button (Esc, Android's back): what's open over the screen first (the
// language's list, a group's panel, the scene watched), else the screen's own Back. False: nothing to go back from
// (the first screen, or no menu showing)
export function menuBack() {
  const menu = document.getElementById('main-menu');
  if (!menu || getComputedStyle(menu).display === 'none') return false;
  const list = document.getElementById('language-list');
  if (list && !list.hidden) { list.hidden = true; return true; }
  if (settingsDrawer) { setSettingsDrawer(null); return true; }
  if (document.body.classList.contains('menu-ui-hidden')) { document.getElementById('menu-show')?.click(); return true; }
  const screen = document.querySelector('#main-menu .main-menu-content[data-screen]:not([hidden])');
  const back = /** @type {HTMLElement | null} */ (screen && screen.querySelector('.menu-back'));
  if (!back) return false;
  back.click();
  return true;
}

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
// the sound's and the music's sliders (0-100) as loud as they are, their filled part drawn to the knob
export const markAudioOptions = () => {
  for (const [id, volume] of /** @type {[string, number][]} */ ([['sound', audio.soundVolume], ['music', audio.musicVolume]])) {
    const slider = /** @type {HTMLInputElement | null} */ (document.getElementById(`${id}-volume`));
    if (!slider) continue;
    const value = Math.round(volume * 100);
    if (document.activeElement !== slider) slider.value = String(value);
    slider.style.setProperty('--fill', `${value}%`);
    const shown = document.getElementById(`${id}-volume-value`);
    if (shown) shown.textContent = String(value);
  }
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
  // Sound's Advanced: the music player, a big screen of its own; its Back is to Settings with Sound open again
  onTap(document.getElementById('open-music-player'), () => showMenuScreen('music'));
  onTap(document.getElementById('music-back'), () => { showMenuScreen('settings'); setSettingsDrawer('sound'); });
  document.querySelectorAll('[data-settings-group]').forEach(button => onTap(/** @type {HTMLElement} */ (button), () => {
    const name = /** @type {HTMLElement} */ (button).dataset.settingsGroup || null;
    setSettingsDrawer(settingsDrawer === name ? null : name);
  }));
  initSwitches();
  initSegments();
  // Interface size: the menu's and the game's panels' zoom (style.css --ui-scale), remembered
  const markUiScale = () => document.querySelectorAll('[data-ui-scale]').forEach(b => b.classList.toggle('active', Number(/** @type {HTMLElement} */ (b).dataset.uiScale) === uiScale()));
  markUiScale();
  document.querySelectorAll('[data-ui-scale]').forEach(button => onTap(/** @type {HTMLElement} */ (button), () => {
    // (the menu grown or shrunk to its new size smoothly, from where the tap was, not all at once)
    const before = menuZoom(), at = button.getBoundingClientRect();
    dimGlide();
    setUiScale(Number(/** @type {HTMLElement} */ (button).dataset.uiScale)); markUiScale();
    glassFor = ''; placeGlass(); placeDrawer();
    const after = menuZoom();
    if (before !== after && mainMenu.animate) {
      const origin = `${(at.left + at.width / 2) / after}px ${(at.top + at.height / 2) / after}px`; // (in the menu's zoomed pixels)
      mainMenu.animate([{ transform: `scale(${before / after})`, transformOrigin: origin }, { transform: 'none', transformOrigin: origin }],
        { duration: 260, easing: 'cubic-bezier(0.22, 0.9, 0.3, 1)' });
    }
  }));
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
  document.addEventListener('keydown', e => { if (e.code === 'Escape' && menuBack()) e.preventDefault(); });
  // Android's back: back in the menu; on its first screen the app goes to the background; in a game, the pause menu
  // (and back into the game from it)
  if (nativeApp && nativeApp.addListener) nativeApp.addListener('backButton', () => {
    if (menuBack()) return;
    if (getComputedStyle(mainMenu).display !== 'none') { (nativeApp.minimizeApp || nativeApp.exitApp).call(nativeApp); return; }
    document.getElementById('btn-pause-toggle')?.click();
  });
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
    currentButton.innerHTML = `${flagHtml(currentLanguage)}<span>${LANGUAGES[currentLanguage].label}</span><i class="language-caret" aria-hidden="true"></i>`;
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
  for (const [id, set] of /** @type {[string, (volume: number) => void][]} */ ([['sound', setSoundVolume], ['music', setMusicVolume]])) {
    const slider = /** @type {HTMLInputElement} */ (document.getElementById(`${id}-volume`));
    slider.addEventListener('input', () => { set(Number(slider.value) / 100); markAudioOptions(); });
  }
}
