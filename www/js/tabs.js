// the bottom panel's open tab (farm zones are only drawn with the Farming tab open)
let activeTab = 'tab-build';

// Open a tab by its id, as tapping its button does
function openTab(tabId) {
  const button = [...document.querySelectorAll('.tab-btn')].find(b => (b.getAttribute('onclick') || '').includes(`'${tabId}'`));
  if (button) switchTab(button, tabId);
}

function switchTab(btnElement, tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  // switching to any tab goes back to the Point (interact) mode
  setMode('interact');
  
  btnElement.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}
