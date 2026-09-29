function switchTab(btnElement, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  // leaving the tabs that place things drops the placing mode
  if (tabId !== 'tab-build' && tabId !== 'tab-farming') setMode('interact');
  
  btnElement.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}
