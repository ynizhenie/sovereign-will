// the bottom panel's open tab (farm zones are only drawn with the Farming tab open)
let activeTab = 'tab-build';

function switchTab(btnElement, tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  // switching to any tab goes back to the Point (interact) mode
  setMode('interact');
  
  btnElement.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}
