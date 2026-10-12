// Messages at the top of the map: red for a warning, green for done

function showNotification(msg, isWarning = true) {
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
