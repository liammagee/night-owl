/** @jest-environment jsdom */
const fs = require('fs');
const source = fs.readFileSync(require.resolve('../../../orchestrator/modules/settings.js'), 'utf8');
let saved;
beforeEach(() => {
  document.getElementById = Object.getPrototypeOf(document).getElementById.bind(document);
  document.body.innerHTML = '';
  saved = { defaultFileType: '.md', ai: { assistants: {
    ash: { aiSettings: {provider:'openai', model:'saved-model', temperature:0, maxTokens:321} },
    chen: { aiSettings: {provider:'local', model:'local-model', temperature:1.2, maxTokens:1500} }
  } } };
  window.showNotification = jest.fn();
  window.electronAPI = {settings:{
    getSettings: jest.fn(async () => JSON.parse(JSON.stringify(saved))),
    setSettings: jest.fn(async value => { saved = value; return {success:true}; })
  }, ai:{getProviderModels:jest.fn(async () => ({models:[]}))}};
  window.eval(source + '\nwindow.collectSettingsFromForm = collectSettingsFromForm;');
  // Exercise actual dialog/category rendering without unrelated event services.
  window.addSettingsEventListeners = jest.fn();
});
test('saving general preferences preserves both AI configurations', async () => {
  const before = JSON.parse(JSON.stringify(saved.ai));
  await window.openSettingsDialog('general');
  document.getElementById('default-file-type').value = '.txt';
  await window.saveSettingsDialog();
  expect(saved.defaultFileType).toBe('.txt');
  expect(saved.ai).toEqual(before);
});
test('switching categories retains general and AI edits through save and reopen', async () => {
  await window.openSettingsDialog('general');
  document.getElementById('default-file-type').value = '.txt';
  window.showSettingsCategory('ai');
  document.getElementById('ash-temperature').value = '0.4';
  window.showSettingsCategory('general');
  expect(document.getElementById('default-file-type').value).toBe('.txt');
  await window.saveSettingsDialog();
  expect(saved.ai.assistants.ash.aiSettings.temperature).toBe(0.4);
  await window.openSettingsDialog('ai');
  expect(document.getElementById('ash-temperature').value).toBe('0.4');
});
test('cancelled edits are not recollected when reopening', async () => {
  await window.openSettingsDialog('general');
  document.getElementById('default-file-type').value = '.cancelled';
  window.closeSettingsDialog();
  await window.openSettingsDialog('general');
  expect(document.getElementById('default-file-type').value).toBe('.md');
});
test('save failure keeps dialog open and does not update global settings', async () => {
  await window.openSettingsDialog('general');
  const before = window.appSettings;
  window.electronAPI.settings.setSettings.mockResolvedValue({success:false,error:'Disk full'});
  await window.saveSettingsDialog();
  expect(document.getElementById('settings-dialog').classList.contains('active')).toBe(true);
  expect(window.appSettings).toBe(before);
  expect(window.showNotification).toHaveBeenLastCalledWith('Error saving settings: Disk full', 'error');
});
test('unavailable saved model remains selectable after loading', async () => {
  await window.openSettingsDialog('ai');
  await window.updateModelOptions('ash');
  expect(document.getElementById('ash-model').value).toBe('saved-model');
  await window.saveSettingsDialog();
  expect(saved.ai.assistants.ash.aiSettings.model).toBe('saved-model');
});

test('saving before model discovery preserves the saved model', async () => {
  await window.openSettingsDialog('ai');
  await window.saveSettingsDialog();
  expect(saved.ai.assistants.ash.aiSettings.model).toBe('saved-model');
});
test('saving during model discovery preserves the saved model', async () => {
  await window.openSettingsDialog('ai');
  let resolve;
  window.electronAPI.ai.getProviderModels.mockReturnValue(new Promise(r => {resolve = r;}));
  const loading = window.updateModelOptions('ash');
  await window.saveSettingsDialog();
  expect(saved.ai.assistants.ash.aiSettings.model).toBe('saved-model');
  resolve({models:[]}); await loading;
});
