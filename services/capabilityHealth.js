'use strict';

const { execFile } = require('child_process');

const VALID_STATUSES = Object.freeze(['available', 'degraded', 'missing', 'unconfigured']);
const STATUS_RANK = Object.freeze({ available: 0, degraded: 1, unconfigured: 2, missing: 3 });

function firstLine(value) {
  return String(value || '').split(/\r?\n/, 1)[0].trim().slice(0, 160);
}

function probeExecutable(command, args = ['--version'], options = {}) {
  const run = options.execFile || execFile;
  return new Promise(resolve => {
    run(command, args, {
      timeout: options.timeout || 5000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
      env: options.env || process.env
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({ available: false, reason: error.code === 'ENOENT' ? 'not-found' : 'probe-failed' });
        return;
      }
      resolve({ available: true, version: firstLine(stdout || stderr) || 'installed' });
    });
  });
}

function capability(definition) {
  const status = VALID_STATUSES.includes(definition.status) ? definition.status : 'degraded';
  return {
    id: definition.id,
    label: definition.label,
    status,
    summary: definition.summary,
    version: definition.version || null,
    setup: definition.setup || null,
    alternatives: definition.alternatives || [],
    checkedAt: definition.checkedAt
  };
}

function toolCapability({ id, label, result, missingSummary, availableSummary, setup, alternatives, checkedAt, missingStatus = 'missing' }) {
  return capability({
    id,
    label,
    status: result.available ? 'available' : missingStatus,
    summary: result.available ? availableSummary : missingSummary,
    version: result.version,
    setup: result.available ? null : setup,
    alternatives,
    checkedAt
  });
}

async function probeFirst(commands, options = {}) {
  for (const candidate of commands) {
    const result = await probeExecutable(candidate.command, candidate.args, options);
    if (result.available) return { ...result, command: candidate.command };
  }
  return { available: false, reason: 'not-found' };
}

async function probeAI(tutorBridge) {
  if (!tutorBridge) return { coreAvailable: false, providerConfigured: false, providers: [] };
  try {
    if (typeof tutorBridge.probeLocalRuntime === 'function') {
      const result = await tutorBridge.probeLocalRuntime();
      return {
        coreAvailable: Boolean(result?.coreAvailable ?? result?.ok),
        providerConfigured: Boolean(result?.providerConfigured),
        providers: Array.isArray(result?.providers) ? result.providers : [],
        storageReady: Boolean(result?.storageReady),
        error: result?.error || null
      };
    }
    const providers = typeof tutorBridge.getAvailableProviders === 'function'
      ? tutorBridge.getAvailableProviders()
      : [];
    return {
      coreAvailable: Boolean(tutorBridge.isAvailable?.()),
      providerConfigured: providers.length > 0,
      providers
    };
  } catch (error) {
    return { coreAvailable: false, providerConfigured: false, providers: [], error: error.message };
  }
}

function summarize(capabilities) {
  const counts = Object.fromEntries(VALID_STATUSES.map(status => [status, 0]));
  for (const item of capabilities) counts[item.status] += 1;
  const status = capabilities.reduce(
    (worst, item) => STATUS_RANK[item.status] > STATUS_RANK[worst] ? item.status : worst,
    'available'
  );
  return { status, counts, total: capabilities.length };
}

async function collectCapabilityHealth(options = {}) {
  const checkedAt = new Date(options.now ? options.now() : Date.now()).toISOString();
  const probeOptions = { execFile: options.execFile, env: options.env || process.env, timeout: options.timeout };
  const [git, pandoc, docling, latex, codex, claude, ai] = await Promise.all([
    probeExecutable('git', ['--version'], probeOptions),
    probeExecutable('pandoc', ['--version'], probeOptions),
    options.doclingProbe
      ? options.doclingProbe()
      : probeExecutable('python3', ['-c', 'import docling; print(getattr(docling, "__version__", "installed"))'], probeOptions),
    probeFirst([
      { command: 'xelatex', args: ['--version'] },
      { command: 'pdflatex', args: ['--version'] },
      { command: 'tectonic', args: ['--version'] }
    ], probeOptions),
    probeExecutable('codex', ['--version'], probeOptions),
    probeExecutable('claude', ['--version'], probeOptions),
    probeAI(options.tutorBridge)
  ]);

  const environment = options.env || process.env;
  const ttsConfigured = options.ttsConfigured == null
    ? Boolean(environment.LEMONFOX_API_KEY)
    : Boolean(options.ttsConfigured);
  const assistantCount = Number(codex.available) + Number(claude.available);
  const capabilities = [
    toolCapability({
      id: 'git', label: 'Git', result: git,
      availableSummary: 'Source control and publishing workflows are ready.',
      missingSummary: 'Source control actions cannot run until Git is installed.',
      setup: { label: 'Install Git', command: 'xcode-select --install', url: 'https://git-scm.com/downloads' }, checkedAt
    }),
    toolCapability({
      id: 'pandoc', label: 'Pandoc', result: pandoc,
      availableSummary: 'Word, PowerPoint, and enhanced document exports are ready.',
      missingSummary: 'Enhanced Word, PowerPoint, and reference-aware exports are unavailable.',
      setup: { label: 'Install Pandoc', command: 'brew install pandoc', url: 'https://pandoc.org/installing.html' }, checkedAt
    }),
    toolCapability({
      id: 'docling', label: 'Docling', result: docling,
      availableSummary: 'Layout-aware PDF and Word import is ready.',
      missingSummary: 'Layout-aware document import is unavailable; basic import paths remain.',
      setup: {
        label: 'Install Docling',
        command: 'python3 -m pip install docling',
        url: 'https://docling-project.github.io/docling/getting_started/installation/',
        action: 'install',
        toolId: 'docling'
      },
      alternatives: ['Basic PDF and Word import'], missingStatus: 'degraded', checkedAt
    }),
    toolCapability({
      id: 'latex', label: 'LaTeX engine', result: latex,
      availableSummary: `PDF typesetting is ready through ${latex.command || 'LaTeX'}.`,
      missingSummary: 'Typeset PDF export is unavailable; browser PDF export remains available.',
      setup: { label: 'Install MacTeX', command: 'brew install --cask mactex-no-gui', url: 'https://tug.org/mactex/' },
      alternatives: ['Browser PDF export'], missingStatus: 'degraded', checkedAt
    }),
    capability({
      id: 'ai', label: 'AI providers',
      status: ai.providerConfigured ? 'available' : ai.coreAvailable ? 'unconfigured' : 'degraded',
      summary: ai.providerConfigured
        ? `${ai.providers.length} AI provider${ai.providers.length === 1 ? '' : 's'} configured.`
        : ai.coreAvailable
          ? 'The local AI runtime is ready, but no model provider is configured.'
          : 'The AI runtime could not be verified; non-AI editing remains available.',
      setup: ai.providerConfigured ? null : { label: 'Configure AI', section: 'ai' },
      alternatives: ['Non-AI editor and proofreader tools'], checkedAt
    }),
    capability({
      id: 'tts', label: 'Text to speech',
      status: ttsConfigured ? 'available' : 'unconfigured',
      summary: ttsConfigured
        ? 'Lemonfox speech is configured without exposing the credential.'
        : 'Lemonfox is not configured; browser speech may still be available.',
      setup: ttsConfigured ? null : { label: 'Configure speech', section: 'tts' },
      alternatives: ['Browser Web Speech when supported'], checkedAt
    }),
    capability({
      id: 'terminal-assistants', label: 'Terminal assistants',
      status: assistantCount === 2 ? 'available' : assistantCount === 1 ? 'degraded' : 'unconfigured',
      summary: assistantCount === 2
        ? 'Codex and Claude command-line assistants are available.'
        : assistantCount === 1
          ? `${codex.available ? 'Codex' : 'Claude'} is available; the other assistant is optional.`
          : 'No optional terminal assistant was found.',
      version: [codex.available ? codex.version : null, claude.available ? claude.version : null].filter(Boolean).join(' · ') || null,
      setup: assistantCount ? null : { label: 'Open terminal assistant guidance', command: 'nightowl --help' },
      alternatives: ['Integrated shell terminal'], checkedAt
    })
  ];

  return {
    success: true,
    schemaVersion: 1,
    generatedAt: checkedAt,
    privacy: 'No credential values, document contents, command paths, or private filesystem paths are included.',
    summary: summarize(capabilities),
    capabilities
  };
}

module.exports = {
  STATUS_RANK,
  VALID_STATUSES,
  collectCapabilityHealth,
  firstLine,
  probeAI,
  probeExecutable,
  probeFirst,
  summarize
};
