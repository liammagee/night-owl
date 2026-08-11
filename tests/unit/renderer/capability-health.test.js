const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/capability-health.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('capability health renderer', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.NightOwlCapabilities;
    window.electronAPI = {
      capabilityHealth: {
        check: jest.fn(async () => ({
          success: true,
          generatedAt: '2026-08-09T00:00:00.000Z',
          capabilities: [
            { id: 'git', label: 'Git', status: 'available', summary: 'Ready', version: 'git 2.5' },
            {
              id: 'pandoc', label: 'Pandoc', status: 'missing', summary: 'Unavailable',
              setup: { command: 'brew install pandoc', url: 'https://pandoc.org/installing.html' },
              credential: 'SHOULD_NOT_SURVIVE'
            }
          ]
        }))
      },
      navigation: { openExternal: jest.fn() }
    };
    api = require(modulePath);
  });

  afterEach(() => {
    api.close();
    delete window.NightOwlCapabilities;
  });

  test('normalizes reports to a fixed redacted schema', () => {
    const report = api.normalizeReport({
      generatedAt: 'now',
      secret: 'top-secret',
      capabilities: [{
        id: 'unsafe', label: 'Unsafe', status: 'mystery', summary: 'Status',
        credentials: 'hidden', setup: { url: 'file:///private/path', command: 'safe command' }
      }]
    });

    expect(report.capabilities[0]).toEqual({
      id: 'unsafe', label: 'Unsafe', status: 'degraded', summary: 'Status', version: null,
      setup: {
        label: 'Setup guidance', command: 'safe command', url: null, section: null,
        action: null, toolId: null
      },
      alternatives: [], checkedAt: 'now'
    });
    expect(JSON.stringify(report)).not.toContain('top-secret');
    expect(JSON.stringify(report)).not.toContain('hidden');
    expect(JSON.stringify(report)).not.toContain('file:///private/path');
  });

  test('renders status, setup guidance, a recheck, and a copyable report', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn(async () => {}) }
    });
    const overlay = await api.open();

    expect(overlay.querySelectorAll('.capability-health-card')).toHaveLength(2);
    expect(overlay.querySelector('[data-capability-id="git"]').dataset.capabilityStatus).toBe('available');
    expect(overlay.querySelector('[data-capability-id="pandoc"]').textContent).toContain('brew install pandoc');
    expect(overlay.textContent).toContain('Recheck capabilities');
    overlay.querySelector('.capability-health-actions .capability-secondary-button').click();
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('"capabilities"'));
  });

  test('runs the allowlisted Docling installer and refreshes capability state', async () => {
    window.electronAPI.capabilityHealth.install = jest.fn(async () => ({ success: true }));
    window.electronAPI.capabilityHealth.check = jest.fn(async () => ({
      success: true,
      capabilities: [{ id: 'docling', label: 'Docling', status: 'available', summary: 'Ready' }]
    }));
    const report = api.normalizeReport({ capabilities: [{
      id: 'docling', label: 'Docling', status: 'degraded', summary: 'Missing',
      setup: { label: 'Install Docling', action: 'install', toolId: 'docling' }
    }] });
    const overlay = api.render(report);
    const install = Array.from(overlay.querySelectorAll('button')).find(button => button.textContent === 'Install Docling');

    install.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(window.electronAPI.capabilityHealth.install).toHaveBeenCalledWith({ toolId: 'docling' });
    expect(document.querySelector('[data-capability-id="docling"]').dataset.capabilityStatus).toBe('available');
  });

  test('first-run guidance is driven by actual non-ready capability state', () => {
    const report = api.normalizeReport({ capabilities: [
      { id: 'git', status: 'available', summary: 'Ready' },
      { id: 'pandoc', status: 'missing', summary: 'Missing' }
    ] });
    const banner = api.showFirstRunGuidance(report);
    expect(banner.textContent).toContain('1 optional capabilities need attention');
    banner.querySelectorAll('button')[1].click();
    expect(localStorage.getItem('nightowl-capability-guidance-v1')).toBe('dismissed');
  });
});
