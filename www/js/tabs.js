function switchTab(btnElement, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  if (tabId !== 'tab-build') setMode('interact');
  
  btnElement.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}
