const { collectCapabilityHealth, summarize } = require('../../../services/capabilityHealth');

function createExecFile(results) {
  return jest.fn((command, args, _options, callback) => {
    const key = `${command} ${args.join(' ')}`;
    const result = results[key] || results[command] || { error: Object.assign(new Error('missing'), { code: 'ENOENT' }) };
    callback(result.error || null, result.stdout || '', result.stderr || '');
  });
}

describe('capability health service', () => {
  test('reports installed tools and configured providers without credential values', async () => {
    const secret = 'DO_NOT_EXPORT_THIS_SECRET';
    const execFile = createExecFile({
      git: { stdout: 'git version 2.51.0\n' },
      pandoc: { stdout: 'pandoc 3.7.0\nFeatures: +server\n' },
      python3: { stdout: '2.48.0\n' },
      xelatex: { stdout: 'XeTeX 3.141592653\n' },
      codex: { stdout: 'codex-cli 1.2.3\n' },
      claude: { error: Object.assign(new Error('missing'), { code: 'ENOENT' }) }
    });
    const tutorBridge = {
      probeLocalRuntime: jest.fn(async () => ({
        ok: true,
        coreAvailable: true,
        providerConfigured: true,
        storageReady: true,
        providers: ['openai']
      }))
    };

    const report = await collectCapabilityHealth({
      execFile,
      tutorBridge,
      env: { LEMONFOX_API_KEY: secret, HOME: '/Users/private-person' },
      now: () => Date.parse('2026-08-09T00:00:00.000Z')
    });

    expect(report.success).toBe(true);
    expect(report.capabilities.find(item => item.id === 'git')).toMatchObject({ status: 'available' });
    expect(report.capabilities.find(item => item.id === 'ai')).toMatchObject({ status: 'available' });
    expect(report.capabilities.find(item => item.id === 'tts')).toMatchObject({ status: 'available' });
    expect(report.capabilities.find(item => item.id === 'terminal-assistants')).toMatchObject({ status: 'degraded' });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('/Users/private-person');
  });

  test('distinguishes missing, degraded, and unconfigured capabilities with setup guidance', async () => {
    const missing = Object.assign(new Error('not found'), { code: 'ENOENT' });
    const report = await collectCapabilityHealth({
      execFile: createExecFile({
        git: { error: missing }, pandoc: { error: missing }, python3: { error: missing },
        xelatex: { error: missing }, pdflatex: { error: missing }, tectonic: { error: missing },
        codex: { error: missing }, claude: { error: missing }
      }),
      tutorBridge: {
        probeLocalRuntime: jest.fn(async () => ({
          ok: true, coreAvailable: true, providerConfigured: false, storageReady: true, providers: []
        }))
      },
      env: {},
      now: () => 0
    });
    const byId = Object.fromEntries(report.capabilities.map(item => [item.id, item]));

    expect(byId.git).toMatchObject({ status: 'missing', setup: { command: 'xcode-select --install' } });
    expect(byId.pandoc).toMatchObject({ status: 'missing' });
    expect(byId.docling).toMatchObject({ status: 'degraded', alternatives: expect.any(Array) });
    expect(byId.latex).toMatchObject({ status: 'degraded' });
    expect(byId.ai).toMatchObject({ status: 'unconfigured', setup: { section: 'ai' } });
    expect(byId.tts).toMatchObject({ status: 'unconfigured', setup: { section: 'tts' } });
    expect(byId['terminal-assistants']).toMatchObject({ status: 'unconfigured' });
    expect(report.summary.counts).toEqual({ available: 0, degraded: 2, missing: 2, unconfigured: 3 });
  });

  test('summarizes the worst state and complete status counts', () => {
    expect(summarize([
      { status: 'available' },
      { status: 'degraded' },
      { status: 'missing' },
      { status: 'unconfigured' }
    ])).toEqual({
      status: 'missing',
      total: 4,
      counts: { available: 1, degraded: 1, missing: 1, unconfigured: 1 }
    });
  });
});
