// Messages at the top of the map: red for a warning, green for done

import { setRichText } from './icons.js';
import { answerPressedButton } from './widgets.js';
import { playSound } from '../app/sounds.js';

// the last messages shown, newest last (for the console and the tests)
export const recentNotifications = [];

export function showNotification(msg, isWarning = true) {
  recentNotifications.push(msg);
  if (recentNotifications.length > 50) recentNotifications.shift();
  if (isWarning && typeof playSound === 'function') playSound('error');
  if (typeof answerPressedButton === 'function') answerPressedButton(!isWarning);
  const toastDiv = document.getElementById('toast-notification');
  if (toastDiv) {
    setRichText(toastDiv, msg);
    toastDiv.classList.toggle('ok', !isWarning); // red for a warning, green for done (theme.css)
    toastDiv.style.opacity = '1';
    toastDiv.style.transform = 'translateX(-50%) translateY(0px)';
    
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
      toastDiv.style.opacity = '0';
      toastDiv.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 2800);
  }
}
