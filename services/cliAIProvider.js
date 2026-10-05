'use strict';

const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const PROVIDERS = Object.freeze({
  'codex-cli': {
    command: 'codex',
    label: 'Codex CLI',
    versionArgs: ['--version']
  },
  'claude-cli': {
    command: 'claude',
    label: 'Claude CLI',
    versionArgs: ['--version']
  }
});
const DEFAULT_PRIORITY = Object.freeze(['codex-cli', 'claude-cli']);
const DEFAULT_TIMEOUT_MS = 180000;
const MAX_PROMPT_CHARS = 200000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DIRECT_API_ENV_KEYS = Object.freeze([
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY'
]);

let availability = Object.fromEntries(Object.keys(PROVIDERS).map(id => [id, {
  available: false,
  checked: false,
  version: null,
  reason: 'not-checked'
}]));
let runtimeDirectory = path.join(os.tmpdir(), 'nightowl-cli-ai');

function buildPath(env = process.env) {
  const home = os.homedir();
  const entries = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    ...(String(env.PATH || '').split(path.delimiter).filter(Boolean))
  ];
  return [...new Set(entries)].join(path.delimiter);
}

function buildCliEnvironment(env = process.env, { subscriptionOnly = true } = {}) {
  const childEnv = { ...env, PATH: buildPath(env) };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  if (subscriptionOnly) {
    for (const key of DIRECT_API_ENV_KEYS) delete childEnv[key];
  }
  childEnv.NIGHTOWL_AI_TRANSPORT = 'cli';
  return childEnv;
}

function execute(command, args, options = {}) {
  const run = options.execFile || execFile;
  return new Promise((resolve, reject) => {
    run(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout || DEFAULT_TIMEOUT_MS,
      maxBuffer: options.maxBuffer || MAX_OUTPUT_BYTES,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function executeWithInput(command, args, input, options = {}) {
  const run = options.spawn || spawn;
  return new Promise((resolve, reject) => {
    const child = run(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
    const maxBuffer = options.maxBuffer || MAX_OUTPUT_BYTES;
    const timer = setTimeout(() => {
      const error = new Error('CLI process timed out');
      error.code = 'ETIMEDOUT';
      error.killed = true;
      try { child.kill(); } catch (killError) { /* process may already have exited */ }
      finish(error);
    }, timeoutMs);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve(result);
      }
    }

    function append(stream, chunk) {
      const next = stream + String(chunk || '');
      if (Buffer.byteLength(next, 'utf8') > maxBuffer) {
        const error = new Error('CLI output exceeded the safe buffer limit');
        error.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
        try { child.kill(); } catch (killError) { /* process may already have exited */ }
        finish(error);
        return stream;
      }
      return next;
    }

    child.stdout?.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', chunk => { stderr = append(stderr, chunk); });
    child.once('error', finish);
    child.once('close', code => {
      if (code === 0) {
        finish(null, { stdout, stderr });
        return;
      }
      const error = new Error(`CLI process exited with code ${code}`);
      error.code = code;
      finish(error);
    });
    child.stdin?.on('error', error => finish(error));
    child.stdin?.end(input);
  });
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/, 1)[0].trim().slice(0, 160);
}

function lastLine(value) {
  const lines = String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return String(lines.at(-1) || '').slice(0, 240);
}

async function probeProvider(providerId, options = {}) {
  const definition = PROVIDERS[providerId];
  if (!definition) return { available: false, checked: true, reason: 'unknown-provider', version: null };

  try {
    const result = await execute(definition.command, definition.versionArgs, {
      execFile: options.execFile,
      env: buildCliEnvironment(options.env || process.env),
      timeout: options.timeout || 5000,
      maxBuffer: 256 * 1024
    });
    return {
      available: true,
      checked: true,
      reason: null,
      version: firstLine(result.stdout || result.stderr) || 'installed'
    };
  } catch (error) {
    return {
      available: false,
      checked: true,
      reason: error.code === 'ENOENT' ? 'not-found' : 'probe-failed',
      version: null
    };
  }
}

async function refreshAvailability(options = {}) {
  const entries = await Promise.all(Object.keys(PROVIDERS).map(async providerId => [
    providerId,
    await probeProvider(providerId, options)
  ]));
  availability = Object.fromEntries(entries);
  return getAvailability();
}

function getAvailability() {
  return Object.fromEntries(Object.entries(availability).map(([id, status]) => [id, { ...status }]));
}

function getAvailableProviders(priority = DEFAULT_PRIORITY) {
  return normalizePriority(priority).filter(providerId => availability[providerId]?.available);
}

function normalizePriority(priority) {
  const requested = Array.isArray(priority) ? priority : DEFAULT_PRIORITY;
  const valid = requested.filter((id, index) => PROVIDERS[id] && requested.indexOf(id) === index);
  for (const id of DEFAULT_PRIORITY) {
    if (!valid.includes(id)) valid.push(id);
  }
  return valid;
}

function getPreferredProvider(priority = DEFAULT_PRIORITY) {
  return getAvailableProviders(priority)[0] || null;
}

function setRuntimeDirectory(directory) {
  if (typeof directory === 'string' && path.isAbsolute(directory)) {
    runtimeDirectory = path.join(directory, 'cli-ai-workspace');
  }
  return runtimeDirectory;
}

function buildConversationPrompt({ systemPrompt = '', messages = [], maxTokens } = {}) {
  const sections = [
    'You are responding inside NightOwl, a document editor.',
    'Return only the assistant response. Do not invoke tools, inspect files, or modify the environment.'
  ];
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    sections.push(`Keep the response to approximately ${Math.floor(maxTokens)} tokens or fewer.`);
  }
  if (systemPrompt) sections.push(`SYSTEM INSTRUCTIONS\n${systemPrompt}`);
  if (messages.length) {
    const transcript = messages.map(message => {
      const role = String(message?.role || 'user').toUpperCase();
      return `${role}\n${String(message?.content || '')}`;
    }).join('\n\n');
    sections.push(`CONVERSATION\n${transcript}`);
  }
  const prompt = sections.join('\n\n');
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`CLI AI prompt is too large (${prompt.length} characters; maximum ${MAX_PROMPT_CHARS}).`);
  }
  return prompt;
}

function buildCodexArgs(options, cwd) {
  const args = [
    'exec',
    '--ephemeral',
    '--sandbox', 'read-only',
    '--skip-git-repo-check',
    '--color', 'never',
    '-C', cwd
  ];
  if (options.model && !['auto', 'default'].includes(options.model)) {
    args.push('--model', options.model);
  }
  args.push('-');
  return args;
}

function buildClaudeArgs(options) {
  const args = [
    '--print',
    '--output-format', 'text',
    '--no-session-persistence',
    '--safe-mode',
    '--tools', '',
    '--permission-mode', 'dontAsk'
  ];
  if (options.model && !['auto', 'default'].includes(options.model)) {
    args.push('--model', options.model);
  }
  return args;
}

function friendlyCliError(providerId, error) {
  const label = PROVIDERS[providerId]?.label || providerId;
  if (error.code === 'ENOENT') {
    return new Error(`${label} is not installed or is not available on NightOwl's PATH.`);
  }
  if (error.killed || error.code === 'ETIMEDOUT') {
    return new Error(`${label} did not respond before the timeout.`);
  }
  const detail = lastLine(error.stderr || error.stdout || error.message);
  return new Error(`${label} failed${detail ? `: ${detail}` : '.'}`);
}

async function call(options = {}) {
  const providerId = options.provider;
  const definition = PROVIDERS[providerId];
  if (!definition) throw new Error(`Unsupported CLI AI provider: ${providerId || 'none'}.`);

  await fs.mkdir(runtimeDirectory, { recursive: true });
  const prompt = buildConversationPrompt(options);
  const args = providerId === 'codex-cli'
    ? buildCodexArgs(options, runtimeDirectory)
    : buildClaudeArgs(options);
  const startedAt = Date.now();

  try {
    const result = await executeWithInput(definition.command, args, prompt, {
      spawn: options.spawn,
      cwd: runtimeDirectory,
      env: buildCliEnvironment(options.env || process.env, {
        subscriptionOnly: options.subscriptionOnly !== false
      }),
      timeout: options.timeout,
      maxBuffer: options.maxBuffer
    });
    const content = result.stdout.trim();
    if (!content) {
      throw new Error(`${definition.label} returned no response${result.stderr ? `: ${firstLine(result.stderr)}` : '.'}`);
    }
    return {
      content,
      provider: providerId,
      model: options.model && !['auto', 'default'].includes(options.model) ? options.model : 'cli-default',
      usage: null,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    throw friendlyCliError(providerId, error);
  }
}

module.exports = {
  DEFAULT_PRIORITY,
  PROVIDERS,
  buildCliEnvironment,
  buildConversationPrompt,
  call,
  getAvailability,
  getAvailableProviders,
  getPreferredProvider,
  normalizePriority,
  probeProvider,
  refreshAvailability,
  setRuntimeDirectory
};
