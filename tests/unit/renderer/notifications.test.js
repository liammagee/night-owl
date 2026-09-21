const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/notifications.js');

describe('notification center', () => {
  let center;
  let settings;
  let now;

  beforeEach(() => {
    // The shared renderer setup stubs getElementById; these modules need the real DOM.
    document.getElementById = Document.prototype.getElementById;
    jest.useFakeTimers();
    jest.resetModules();
    delete window.NightOwlNotifications;
    delete window.showNotification;
    document.body.innerHTML = `
      <div id="editor-status-bar"><div id="status-left"><span id="word-count">Source: 0 words</span></div></div>`;
    settings = {};
    now = 0;
    const api = require(modulePath);
    center = api.createNotificationCenter({ getSettings: () => settings, now: () => now });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const toasts = () => Array.from(document.querySelectorAll('.notification'));
  const status = () => document.getElementById('status-notification');

  test('routine confirmations go to the status bar instead of a toast', () => {
    center.show('Auto-saved', 'success', 1000);
    center.show('File saved successfully', 'success');
    center.show('Word wrap off', 'info');
    expect(toasts()).toHaveLength(0);
    expect(status().textContent).toBe('Word wrap off');
    expect(status().classList.contains('show')).toBe(true);
    jest.advanceTimersByTime(4100);
    expect(status().classList.contains('show')).toBe(false);
    expect(status().textContent).toBe('');
  });

  test('errors and non-routine messages still appear as toasts', () => {
    center.show('Failed to save file', 'error');
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].className).toContain('notification-error');
    expect(toasts()[0].getAttribute('role')).toBe('alert');
    expect(status()).toBeNull();
  });

  test('a saved message typed as error is never demoted to the status bar', () => {
    expect(center.resolveChannel('File saved successfully', 'error')).toBe('toast');
    expect(center.resolveChannel('File saved successfully', 'success')).toBe('status');
    expect(center.resolveChannel('Anything', 'info', { channel: 'status' })).toBe('status');
  });

  test('quietRoutine=false restores toasts for routine confirmations', () => {
    settings = { quietRoutine: false };
    center.show('Auto-saved', 'success', 1000);
    expect(toasts()).toHaveLength(1);
    expect(status()).toBeNull();
  });

  test('identical toasts within a few seconds are collapsed into one', () => {
    center.show('Indexing workspace', 'info');
    now = 1000;
    center.show('Indexing workspace', 'info');
    now = 2000;
    center.show('Indexing workspace', 'info');
    expect(toasts()).toHaveLength(1);
    now = 6000;
    center.show('Something else', 'info');
    jest.advanceTimersByTime(300);
    expect(toasts().map((el) => el.textContent)).toEqual(['Something else']);
  });

  test('distraction-free and AI mute settings are respected', () => {
    settings = { enabled: false };
    expect(center.show('Failed', 'error')).toBeNull();
    settings = { aiEnabled: false };
    expect(center.show('Ash has responded', 'info')).toBeNull();
    expect(center.show('Plain message', 'info', { source: 'ai' })).toBeNull();
    expect(center.show('Plain message', 'info')).not.toBeNull();
  });

  test('legacy positional arguments (duration, isHTML, source) keep working', () => {
    center.show('<b>Bold</b> notice', 'info', true);
    expect(toasts()[0].querySelector('b')).not.toBeNull();
    center.clear();
    center.show('Short', 'warning', 700);
    jest.advanceTimersByTime(650);
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].classList.contains('hide')).toBe(false);
    jest.advanceTimersByTime(100);
    expect(toasts()[0].classList.contains('hide')).toBe(true);
    jest.advanceTimersByTime(300);
    expect(toasts()).toHaveLength(0);
  });

  test('status channel falls back to a toast when there is no status bar', () => {
    document.body.innerHTML = '';
    center.show('Auto-saved', 'success');
    expect(toasts()).toHaveLength(1);
  });

  test('module installs window.showNotification when none exists', () => {
    const api = require(modulePath);
    expect(window.NightOwlNotifications).toBe(api);
    expect(typeof window.showNotification).toBe('function');
  });
});
