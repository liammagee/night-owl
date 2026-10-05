const path = require('path');

const lifecyclePath = path.resolve(__dirname, '../../../services/resourceLifecycle.js');
const diagnosticsPath = path.resolve(__dirname, '../../../orchestrator/modules/diagnostics.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('NightOwl diagnostics', () => {
  let diagnostics;
  let writeText;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    document.body.innerHTML = '<div id="presentation-root"></div><div id="preview-content"></div>';
    delete window.NightOwlDiagnostics;
    delete window.NightOwlResourceLifecycle;
    delete window.NightOwlPerformance;
    delete window.NightOwlFeatures;
    delete window.currentFilePath;
    delete window.currentMode;
    require(lifecyclePath);
    writeText = jest.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    diagnostics = require(diagnosticsPath);
  });

  afterEach(() => {
    diagnostics.dispose();
    window.NightOwlResourceLifecycle?.disposeAll?.();
    delete window.NightOwlDiagnostics;
    delete window.NightOwlResourceLifecycle;
    delete window.NightOwlPerformance;
    delete window.NightOwlFeatures;
  });

  test('records structured terminal incidents with stable correlation IDs', () => {
    const incident = diagnostics.report({
      domain: 'preview',
      code: 'NO-PREVIEW-RENDER',
      state: 'failed',
      correlationId: 'NO-PREVIEW-TEST-1',
      error: new Error('Preview exploded'),
      context: { transitionId: 7, force: false }
    });

    expect(incident).toMatchObject({
      id: 'NO-PREVIEW-TEST-1',
      correlationId: 'NO-PREVIEW-TEST-1',
      requestId: 'NO-PREVIEW-TEST-1',
      domain: 'preview',
      code: 'NO-PREVIEW-RENDER',
      state: 'failed',
      message: 'Preview exploded',
      context: { transitionId: 7, force: false }
    });
    expect(diagnostics.getIncidents({ incidentId: incident.id })).toHaveLength(1);
  });

  test('redacts contents, credentials, and full private paths before storage or copy', async () => {
    const privateContent = 'PRIVATE_DOCUMENT_MARKER';
    const secret = 'SECRET_CREDENTIAL_MARKER';
    diagnostics.report({
      domain: 'file',
      code: 'NO-FILE-OPEN',
      error: new Error(`Could not read /Users/alice/Research/private-notes.md and /workspace/private/other.md token=${secret}`),
      context: {
        filePath: '/Users/alice/Research/private-notes.md',
        content: privateContent,
        credentials: { token: secret },
        nested: { authorization: `Bearer ${secret}` }
      }
    });
    window.currentFilePath = '/Users/alice/Research/private-notes.md';
    window.NightOwlFeatures = {
      getEnabled: () => ['nightowl-presentations'],
      listFeatures: () => ['nightowl-presentations']
    };
    window.NightOwlPerformance = {
      getResourceDiagnostics: async () => ({
        success: true,
        app: { version: '1.2.3', isPackaged: true, arch: 'arm64' },
        handlers: { file: { watcher: 1 } }
      })
    };

    const copied = await diagnostics.copyReport();
    const serialized = copied.text;

    expect(copied.success).toBe(true);
    expect(writeText).toHaveBeenCalledWith(serialized);
    expect(serialized).not.toContain('/Users/alice');
    expect(serialized).not.toContain('/workspace/private');
    expect(serialized).not.toContain(privateContent);
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain('<private-path>/private-notes.md');
    expect(serialized).toContain('<private-path>/other.md');
    expect(serialized).toContain('[redacted]');
    expect(copied.report.readiness.fileType).toBe('md');
  });

  test('opens an accessible diagnostics screen with runtime and readiness state', async () => {
    window.NightOwlPerformance = {
      getResourceDiagnostics: async () => ({
        success: true,
        app: { version: '2.0.0', isPackaged: false, arch: 'x64' }
      })
    };
    const overlay = await diagnostics.open();

    expect(overlay.id).toBe('nightowl-diagnostics-overlay');
    expect(overlay.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
    expect(overlay.textContent).toContain('NightOwl diagnostics');
    expect(overlay.textContent).toContain('2.0.0');
    expect(overlay.textContent).toContain('Document contents, credentials, and full private paths are omitted');

    overlay.querySelector('.nightowl-diagnostics-close').click();
    expect(document.getElementById('nightowl-diagnostics-overlay')).toBeNull();
  });
});
