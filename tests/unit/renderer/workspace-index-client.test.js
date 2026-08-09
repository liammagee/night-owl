const path = require('path');

const clientPath = path.resolve(__dirname, '../../../orchestrator/modules/workspace-index-client.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('workspace index renderer client', () => {
  let progressListener;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    document.getElementById = nativeGetElementById;
    document.body.innerHTML = '';
    window.registerCommand = jest.fn();
    window.showNotification = jest.fn();
    window.electronAPI = {
      search: {
        workspaceIndexCancel: jest.fn(async () => ({ success: true, cancelled: true })),
        workspaceIndexRefresh: jest.fn(async () => ({ success: true })),
        workspaceIndexStatus: jest.fn(async () => ({
          success: true,
          state: 'ready',
          indexed: 420,
          durationMs: 85,
          budget: { maxFiles: 50000, maxContentBytes: 2097152 }
        }))
      },
      events: {
        workspaceIndexProgress: jest.fn(listener => {
          progressListener = listener;
          return jest.fn();
        })
      }
    };
    require(clientPath);
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('registers discoverable refresh, status, and cancellation actions', () => {
    const ids = window.registerCommand.mock.calls.map(call => call[0]);
    expect(ids).toEqual(expect.arrayContaining([
      'workspace.index.refresh',
      'workspace.index.status',
      'workspace.index.cancel'
    ]));
    expect(window.electronAPI.events.workspaceIndexProgress).toHaveBeenCalled();
  });

  test('shows bounded progress and lets the user cancel a large scan', async () => {
    progressListener({ phase: 'extracting', state: 'building', discovered: 1000, processed: 250 });
    const element = document.getElementById('workspace-index-progress');
    expect(element.hidden).toBe(false);
    expect(element.querySelector('.workspace-index-progress-label').textContent).toContain('250/1000');
    expect(element.querySelector('progress').value).toBe(25);

    element.querySelector('button').click();
    await Promise.resolve();
    expect(window.electronAPI.search.workspaceIndexCancel).toHaveBeenCalled();

    progressListener({ phase: 'complete', state: 'ready', indexed: 1000, reused: 900, durationMs: 42 });
    expect(element.textContent).toContain('1000 files');
    jest.advanceTimersByTime(4000);
    expect(element.hidden).toBe(true);
  });

  test('reports performance-budget evidence through the command action', async () => {
    await window.NightOwlWorkspaceIndex.showStatus();
    expect(window.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('420 files, ready, 85 ms'),
      'success'
    );
    expect(window.showNotification.mock.calls[0][0]).toContain('50000 files / 2 MB');
  });
});
