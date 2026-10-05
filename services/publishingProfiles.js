'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { isPathInsideRoot } = require('../ipc/pathGuards');

const PROFILE_RELATIVE_PATH = path.join('.nightowl', 'publishing.json');
const BUILTIN_PROFILE_PATH = path.join(
  __dirname,
  'publishing-profiles',
  'machinespirits.json'
);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const ENVIRONMENT_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const AUTHORITIES = new Set(['inspect', 'mutate', 'network']);
const STEP_TYPES = new Set(['command', 'repository-status']);
const SAFE_BARE_EXECUTABLES = new Set([
  'git',
  'gh',
  'node',
  'npm',
  'npx',
  'pandoc',
  'python3'
]);
const SECRET_KEY_PATTERN = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSPHRASE|API_KEY|PRIVATE_KEY)(?:$|_)/i;
const MAX_OUTPUT_LENGTH = 200000;
const MAX_MESSAGE_LENGTH = 240;

function fail(message, code = 'invalid-publishing-profile') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function ensureString(value, label, options = {}) {
  if (typeof value !== 'string' || (options.nonEmpty !== false && value.trim() === '')) {
    fail(`${label} must be a non-empty string`);
  }
  if (value.includes('\0')) fail(`${label} contains invalid characters`);
  return value.trim();
}

function ensureId(value, label) {
  const id = ensureString(value, label);
  if (!ID_PATTERN.test(id)) fail(`${label} must use lowercase letters, numbers, dots, dashes, or underscores`);
  return id;
}

function assertNoEmbeddedSecrets(value, location = 'profile') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEmbeddedSecrets(entry, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) && child != null && String(child).trim() !== '') {
      fail(`${location}.${key} must not embed a credential or secret`);
    }
    assertNoEmbeddedSecrets(child, `${location}.${key}`);
  }
}

function normalizeRepository(input, index) {
  const repository = ensureObject(input, `repositories[${index}]`);
  const id = ensureId(repository.id, `repositories[${index}].id`);
  const candidates = Array.isArray(repository.candidates)
    ? repository.candidates.map((candidate, candidateIndex) => {
      const value = ensureString(candidate, `repositories[${index}].candidates[${candidateIndex}]`);
      if (path.isAbsolute(value) || value.includes('\\')) {
        fail(`Repository candidate ${value} must be a portable relative path`);
      }
      return value;
    })
    : [];
  if (candidates.length === 0) fail(`Repository ${id} requires at least one discovery candidate`);
  const expectedBasenames = Array.isArray(repository.expectedBasenames)
    ? repository.expectedBasenames.map((name, nameIndex) => (
      ensureString(name, `repositories[${index}].expectedBasenames[${nameIndex}]`)
    ))
    : [];
  if (expectedBasenames.length === 0) fail(`Repository ${id} requires an expectedBasenames contract`);

  return Object.freeze({
    id,
    label: ensureString(repository.label || id, `repositories[${index}].label`),
    candidates,
    expectedBasenames,
    remote: repository.remote ? ensureString(repository.remote, `repositories[${index}].remote`) : null
  });
}

function normalizeStep(input, stageId, index, repositoryIds) {
  const step = ensureObject(input, `stage ${stageId} steps[${index}]`);
  const id = ensureId(step.id, `stage ${stageId} steps[${index}].id`);
  const type = ensureString(step.type, `step ${id}.type`);
  if (!STEP_TYPES.has(type)) fail(`Step ${id} has unsupported type: ${type}`);
  const repository = ensureId(step.repository, `step ${id}.repository`);
  if (!repositoryIds.has(repository)) fail(`Step ${id} references unknown repository: ${repository}`);

  if (type === 'repository-status') {
    return Object.freeze({ id, type, repository });
  }

  const executable = ensureString(step.executable, `step ${id}.executable`);
  if (path.isAbsolute(executable) || executable.includes('\\')) {
    fail(`Step ${id} executable must be a portable relative path or an approved tool name`);
  }
  if (executable.includes('/') && !executable.startsWith('./')) {
    fail(`Step ${id} executable path must start with ./`);
  }
  if (!executable.includes('/') && !SAFE_BARE_EXECUTABLES.has(executable)) {
    fail(`Step ${id} executable is not in the direct-execution allowlist: ${executable}`);
  }

  const args = Array.isArray(step.args)
    ? step.args.map((argument, argumentIndex) => (
      ensureString(argument, `step ${id}.args[${argumentIndex}]`, { nonEmpty: false })
    ))
    : [];
  const environment = step.environment == null ? {} : ensureObject(step.environment, `step ${id}.environment`);
  const normalizedEnvironment = {};
  for (const [key, value] of Object.entries(environment)) {
    if (!ENVIRONMENT_KEY_PATTERN.test(key)) fail(`Step ${id} has an invalid environment key: ${key}`);
    if (SECRET_KEY_PATTERN.test(key)) fail(`Step ${id} must not declare secret environment key: ${key}`);
    normalizedEnvironment[key] = ensureString(value, `step ${id}.environment.${key}`, { nonEmpty: false });
  }
  const timeoutMs = step.timeoutMs == null ? 120000 : Number(step.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1800000) {
    fail(`Step ${id}.timeoutMs must be between 1000 and 1800000`);
  }

  return Object.freeze({
    id,
    type,
    repository,
    executable,
    args,
    environment: Object.freeze(normalizedEnvironment),
    timeoutMs
  });
}

function normalizeStage(input, index, repositoryIds) {
  const stage = ensureObject(input, `stages[${index}]`);
  const id = ensureId(stage.id, `stages[${index}].id`);
  const authority = ensureString(stage.authority, `stage ${id}.authority`);
  if (!AUTHORITIES.has(authority)) fail(`Stage ${id} has unsupported authority: ${authority}`);
  const requires = Array.isArray(stage.requires)
    ? stage.requires.map((tool, toolIndex) => {
      const name = ensureString(tool, `stage ${id}.requires[${toolIndex}]`);
      if (!SAFE_BARE_EXECUTABLES.has(name)) fail(`Stage ${id} requires unsupported tool: ${name}`);
      return name;
    })
    : [];
  const requiresCleanIndex = Array.isArray(stage.requiresCleanIndex)
    ? stage.requiresCleanIndex.map((repository, repositoryIndex) => {
      const repositoryId = ensureId(repository, `stage ${id}.requiresCleanIndex[${repositoryIndex}]`);
      if (!repositoryIds.has(repositoryId)) {
        fail(`Stage ${id} references unknown clean-index repository: ${repositoryId}`);
      }
      return repositoryId;
    })
    : [];
  const steps = Array.isArray(stage.steps)
    ? stage.steps.map((step, stepIndex) => normalizeStep(step, id, stepIndex, repositoryIds))
    : [];
  if (steps.length === 0) fail(`Stage ${id} requires at least one step`);
  const stepIds = steps.map(step => step.id);
  if (new Set(stepIds).size !== stepIds.length) fail(`Stage ${id} has duplicate step IDs`);

  return Object.freeze({
    id,
    label: ensureString(stage.label || id, `stage ${id}.label`),
    description: ensureString(stage.description || '', `stage ${id}.description`, { nonEmpty: false }),
    authority,
    requires: Object.freeze(requires),
    requiresCleanIndex: Object.freeze(requiresCleanIndex),
    messageRequired: Boolean(stage.messageRequired),
    steps: Object.freeze(steps)
  });
}

function normalizeProfile(input, source = 'unknown') {
  assertNoEmbeddedSecrets(input, `profile from ${source}`);
  const profile = ensureObject(input, `profile from ${source}`);
  const id = ensureId(profile.id, 'profile.id');
  const repositories = Array.isArray(profile.repositories)
    ? profile.repositories.map(normalizeRepository)
    : [];
  if (repositories.length === 0) fail(`Profile ${id} requires repositories`);
  const repositoryIds = repositories.map(repository => repository.id);
  if (new Set(repositoryIds).size !== repositoryIds.length) fail(`Profile ${id} has duplicate repository IDs`);
  const stages = Array.isArray(profile.stages)
    ? profile.stages.map((stage, index) => normalizeStage(stage, index, new Set(repositoryIds)))
    : [];
  if (stages.length === 0) fail(`Profile ${id} requires stages`);
  const stageIds = stages.map(stage => stage.id);
  if (new Set(stageIds).size !== stageIds.length) fail(`Profile ${id} has duplicate stage IDs`);
  const matchesWorkspaceBasenames = Array.isArray(profile.matchesWorkspaceBasenames)
    ? profile.matchesWorkspaceBasenames.map((name, index) => (
      ensureString(name, `profile ${id}.matchesWorkspaceBasenames[${index}]`)
    ))
    : [];

  return Object.freeze({
    id,
    title: ensureString(profile.title || id, `profile ${id}.title`),
    description: ensureString(profile.description || '', `profile ${id}.description`, { nonEmpty: false }),
    matchesWorkspaceBasenames: Object.freeze(matchesWorkspaceBasenames),
    repositories: Object.freeze(repositories),
    stages: Object.freeze(stages),
    source
  });
}

function parseProfileDocument(document, source) {
  const input = ensureObject(document, `publishing profile document ${source}`);
  if (input.schemaVersion !== 1) fail(`Publishing profile ${source} must use schemaVersion 1`);
  if (!Array.isArray(input.profiles) || input.profiles.length === 0) {
    fail(`Publishing profile ${source} must contain a non-empty profiles array`);
  }
  return input.profiles.map(profile => normalizeProfile(profile, source));
}

function readProfileDocument(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
}

function profileMatchesWorkspace(profile, workspaceRoot) {
  return profile.matchesWorkspaceBasenames.length === 0 ||
    profile.matchesWorkspaceBasenames.includes(path.basename(workspaceRoot));
}

function loadWorkspaceProfiles(workspaceRoot, options = {}) {
  const fsImpl = options.fs || fs;
  const builtinPath = options.builtinProfilePath || BUILTIN_PROFILE_PATH;
  const customPath = path.join(workspaceRoot, PROFILE_RELATIVE_PATH);
  const profilesById = new Map();
  const errors = [];

  try {
    for (const profile of parseProfileDocument(readProfileDocument(builtinPath, fsImpl), builtinPath)) {
      if (profileMatchesWorkspace(profile, workspaceRoot)) profilesById.set(profile.id, profile);
    }
  } catch (error) {
    errors.push({ source: builtinPath, error: error.message });
  }

  if (fsImpl.existsSync(customPath)) {
    try {
      for (const profile of parseProfileDocument(readProfileDocument(customPath, fsImpl), customPath)) {
        if (profileMatchesWorkspace(profile, workspaceRoot)) profilesById.set(profile.id, profile);
      }
    } catch (error) {
      errors.push({ source: customPath, error: error.message });
    }
  }

  return {
    profiles: Array.from(profilesById.values()),
    errors,
    customPath
  };
}

function truncateOutput(value) {
  const text = String(value || '')
    .replace(/((?:token|secret|password|api[_-]?key)\s*[=:]\s*)[^\s]+/gi, '$1[redacted]')
    .replace(/\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{12,}\b/g, '[redacted]');
  if (text.length <= MAX_OUTPUT_LENGTH) return text;
  return `${text.slice(0, MAX_OUTPUT_LENGTH)}\n… output truncated by NightOwl`;
}

function defaultExecute(executable, args, options = {}) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    execFile(executable, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: 'utf8',
      timeout: options.timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
        signal: error?.signal || null,
        timedOut: Boolean(error?.killed && error?.signal),
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr || (error && !stderr ? error.message : '')),
        durationMs: Date.now() - startedAt
      });
    });
  });
}

function defaultToolResolver(toolName, env = process.env) {
  const pathValue = String(env.PATH || '');
  const extensions = process.platform === 'win32'
    ? String(env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
    : [''];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${toolName}${extension}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch (_error) {
        // Continue searching PATH.
      }
    }
  }
  return null;
}

function statusFingerprint(statusOutput) {
  return crypto.createHash('sha256').update(String(statusOutput || '')).digest('hex');
}

function parseStatus(statusOutput) {
  const lines = String(statusOutput || '').split(/\r?\n/).filter(Boolean);
  let staged = 0;
  let modified = 0;
  let untracked = 0;
  const changedFiles = lines.slice(0, 200).map(line => {
    const indexStatus = line[0] || ' ';
    const worktreeStatus = line[1] || ' ';
    if (indexStatus === '?' && worktreeStatus === '?') untracked += 1;
    else {
      if (indexStatus !== ' ' && indexStatus !== '?') staged += 1;
      if (worktreeStatus !== ' ' && worktreeStatus !== '?') modified += 1;
    }
    return { status: line.slice(0, 2), path: line.slice(3) };
  });
  return {
    clean: lines.length === 0,
    staged,
    modified,
    untracked,
    total: lines.length,
    truncated: lines.length > changedFiles.length,
    changedFiles,
    fingerprint: statusFingerprint(statusOutput)
  };
}

function normalizeRemoteIdentity(remote) {
  return String(remote || '')
    .trim()
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function remoteMatchesContract(origin, expectedRemote) {
  if (!expectedRemote) return true;
  const normalizedOrigin = normalizeRemoteIdentity(origin);
  const normalizedExpected = normalizeRemoteIdentity(expectedRemote);
  return normalizedOrigin === normalizedExpected ||
    normalizedOrigin.endsWith(`/${normalizedExpected.replace(/^https?:\/\/[^/]+\//, '')}`);
}

function quoteCommandPart(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(text) ? text : JSON.stringify(text);
}

function renderTemplate(value, context, options = {}) {
  return String(value).replace(/\{\{([^}]+)\}\}/g, (_match, rawKey) => {
    const key = rawKey.trim();
    if (key === 'message') {
      if (context.message) return context.message;
      if (options.preview) return '<release message>';
      fail('This publishing stage requires a release message', 'message-required');
    }
    const repositoryMatch = key.match(/^repo\.([a-z0-9._-]+)\.(revision|path)$/);
    if (repositoryMatch) {
      const repository = context.repositories[repositoryMatch[1]];
      const resolved = repository?.[repositoryMatch[2]];
      if (resolved) return resolved;
      fail(`Publishing placeholder cannot be resolved: ${key}`, 'unresolved-placeholder');
    }
    fail(`Publishing placeholder is not supported: ${key}`, 'unsupported-placeholder');
  });
}

function resolveRepositoryCandidate(workspaceRoot, repository, fsImpl = fs) {
  const portfolioRoot = path.dirname(workspaceRoot);
  for (const candidate of repository.candidates) {
    const resolvedPath = path.resolve(workspaceRoot, candidate);
    if (!isPathInsideRoot(resolvedPath, portfolioRoot)) continue;
    if (!repository.expectedBasenames.includes(path.basename(resolvedPath))) continue;
    try {
      if (!fsImpl.statSync(resolvedPath).isDirectory()) continue;
      if (!fsImpl.existsSync(path.join(resolvedPath, '.git'))) continue;
      return resolvedPath;
    } catch (_error) {
      // Try the next declared candidate.
    }
  }
  return null;
}

function resolveStepExecutable(step, repositoryPath, fsImpl = fs) {
  if (!step.executable.includes('/')) return { success: true, executable: step.executable };
  const executable = path.resolve(repositoryPath, step.executable);
  if (!isPathInsideRoot(executable, repositoryPath)) {
    return { success: false, error: `Executable escapes repository root: ${step.executable}` };
  }
  try {
    fsImpl.accessSync(executable, fs.constants.X_OK);
    return { success: true, executable };
  } catch (_error) {
    return { success: false, error: `Executable is missing or not runnable: ${step.executable}` };
  }
}

function buildStageDigest(profile, stage, repositories) {
  const repositoryState = Object.fromEntries(Object.entries(repositories).map(([id, repository]) => [id, {
    path: repository.path || null,
    revision: repository.revision || null,
    statusFingerprint: repository.status?.fingerprint || null
  }]));
  return crypto.createHash('sha256')
    .update(JSON.stringify({ profileId: profile.id, stage, repositoryState }))
    .digest('hex');
}

function createPublishingProfileService(options = {}) {
  const fsImpl = options.fs || fs;
  const execute = options.execute || defaultExecute;
  const toolResolver = options.toolResolver || defaultToolResolver;
  const activeRuns = new Set();

  async function runGit(repositoryPath, args, timeoutMs = 10000) {
    return execute('git', args, {
      cwd: repositoryPath,
      env: process.env,
      timeoutMs
    });
  }

  async function inspectRepository(workspaceRoot, repository) {
    const repositoryPath = resolveRepositoryCandidate(workspaceRoot, repository, fsImpl);
    if (!repositoryPath) {
      return {
        id: repository.id,
        label: repository.label,
        remote: repository.remote,
        found: false,
        candidates: repository.candidates,
        expectedBasenames: repository.expectedBasenames
      };
    }

    const [revisionResult, branchResult, statusResult, remoteResult] = await Promise.all([
      runGit(repositoryPath, ['rev-parse', 'HEAD']),
      runGit(repositoryPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
      runGit(repositoryPath, ['status', '--porcelain=v1', '--untracked-files=all']),
      runGit(repositoryPath, ['remote', 'get-url', 'origin'])
    ]);
    const gitErrors = [revisionResult, branchResult, statusResult]
      .filter(result => result.exitCode !== 0)
      .map(result => result.stderr || 'Git inspection failed');
    const status = parseStatus(statusResult.stdout);

    const origin = remoteResult.exitCode === 0 ? remoteResult.stdout.trim() : null;
    return {
      id: repository.id,
      label: repository.label,
      remote: repository.remote,
      found: true,
      path: repositoryPath,
      revision: revisionResult.exitCode === 0 ? revisionResult.stdout.trim() : null,
      branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() : null,
      origin,
      remoteMatches: remoteMatchesContract(origin, repository.remote),
      status,
      errors: gitErrors
    };
  }

  function buildStepPlan(step, repositories, message = '') {
    const repository = repositories[step.repository];
    if (step.type === 'repository-status') {
      return {
        id: step.id,
        type: step.type,
        repository: step.repository,
        display: `Inspect Git state: ${repository?.label || step.repository}`
      };
    }
    const context = { message, repositories };
    const args = step.args.map(argument => renderTemplate(argument, context, { preview: true }));
    const environment = Object.fromEntries(Object.entries(step.environment).map(([key, value]) => (
      [key, renderTemplate(value, context, { preview: true })]
    )));
    const command = [step.executable, ...args].map(quoteCommandPart).join(' ');
    return {
      id: step.id,
      type: step.type,
      repository: step.repository,
      cwd: repository?.path || null,
      command,
      environment,
      display: `${repository?.label || step.repository}: ${command}`
    };
  }

  async function inspectProfile(workspaceRoot, profile) {
    const repositoryList = await Promise.all(
      profile.repositories.map(repository => inspectRepository(workspaceRoot, repository))
    );
    const repositories = Object.fromEntries(repositoryList.map(repository => [repository.id, repository]));
    const toolNames = Array.from(new Set(profile.stages.flatMap(stage => stage.requires)));
    const tools = Object.fromEntries(toolNames.map(tool => {
      const executable = toolResolver(tool, process.env);
      return [tool, { name: tool, available: Boolean(executable), executable: executable || null }];
    }));

    const stages = profile.stages.map(stage => {
      const blockers = [];
      for (const toolName of stage.requires) {
        if (!tools[toolName]?.available) blockers.push(`Required tool is unavailable: ${toolName}`);
      }
      for (const step of stage.steps) {
        const repository = repositories[step.repository];
        if (!repository?.found) {
          blockers.push(`Repository is unavailable: ${step.repository}`);
          continue;
        }
        if (!repository.remoteMatches) {
          blockers.push(`Repository origin does not match ${repository.remote}: ${step.repository}`);
        }
        if (step.type === 'command') {
          const executable = resolveStepExecutable(step, repository.path, fsImpl);
          if (!executable.success) blockers.push(executable.error);
        }
      }
      for (const repositoryId of stage.requiresCleanIndex) {
        const repository = repositories[repositoryId];
        if (repository?.status?.staged > 0) {
          blockers.push(`${repository.label} has pre-existing staged changes`);
        }
      }
      return {
        id: stage.id,
        label: stage.label,
        description: stage.description,
        authority: stage.authority,
        messageRequired: stage.messageRequired,
        canRun: blockers.length === 0,
        blockers: Array.from(new Set(blockers)),
        planDigest: buildStageDigest(profile, stage, repositories),
        plan: stage.steps.map(step => buildStepPlan(step, repositories))
      };
    });
    const warnings = repositoryList.flatMap(repository => {
      if (!repository.found) return [`${repository.label} was not found`];
      const messages = [];
      if (repository.status && !repository.status.clean) {
        messages.push(`${repository.label} has ${repository.status.total} changed path(s)`);
      }
      if (repository.status?.staged > 0) {
        messages.push(`${repository.label} has pre-existing staged changes`);
      }
      return messages;
    });

    return {
      id: profile.id,
      title: profile.title,
      description: profile.description,
      source: profile.source,
      repositories: repositoryList,
      tools: Object.values(tools),
      stages,
      warnings,
      downstreamRevision: repositories.content?.revision || null
    };
  }

  async function inspectWorkspace(workspaceRoot) {
    const resolvedWorkspaceRoot = path.resolve(ensureString(workspaceRoot, 'workspaceRoot'));
    const loaded = loadWorkspaceProfiles(resolvedWorkspaceRoot, {
      fs: fsImpl,
      builtinProfilePath: options.builtinProfilePath
    });
    const profiles = await Promise.all(
      loaded.profiles.map(profile => inspectProfile(resolvedWorkspaceRoot, profile))
    );
    return {
      success: loaded.errors.length === 0,
      workspaceRoot: resolvedWorkspaceRoot,
      customProfilePath: loaded.customPath,
      configurationErrors: loaded.errors,
      profiles
    };
  }

  async function runStage(workspaceRoot, request = {}) {
    const profileId = ensureId(request.profileId, 'profileId');
    const stageId = ensureId(request.stageId, 'stageId');
    const message = request.message == null ? '' : ensureString(request.message, 'message', { nonEmpty: false });
    if (message.length > MAX_MESSAGE_LENGTH) fail(`Release message exceeds ${MAX_MESSAGE_LENGTH} characters`);
    const runKey = `${path.resolve(workspaceRoot)}:${profileId}`;
    if (activeRuns.has(runKey)) fail(`Publishing profile is already running: ${profileId}`, 'publishing-run-active');

    const loaded = loadWorkspaceProfiles(path.resolve(workspaceRoot), {
      fs: fsImpl,
      builtinProfilePath: options.builtinProfilePath
    });
    if (loaded.errors.length > 0) fail(loaded.errors.map(entry => entry.error).join('; '));
    const profile = loaded.profiles.find(candidate => candidate.id === profileId);
    if (!profile) fail(`Publishing profile is unavailable: ${profileId}`, 'unknown-publishing-profile');
    const stageDefinition = profile.stages.find(candidate => candidate.id === stageId);
    if (!stageDefinition) fail(`Publishing stage is unavailable: ${stageId}`, 'unknown-publishing-stage');

    const before = await inspectProfile(path.resolve(workspaceRoot), profile);
    const stage = before.stages.find(candidate => candidate.id === stageId);
    if (!stage.canRun) fail(stage.blockers.join('; '), 'publishing-stage-blocked');
    if (!request.planDigest || request.planDigest !== stage.planDigest) {
      fail('Publishing plan changed; refresh the workflow before running it', 'stale-publishing-plan');
    }
    if (stageDefinition.messageRequired && message.trim() === '') {
      fail('This publishing stage requires a release message', 'message-required');
    }
    if (stageDefinition.authority === 'mutate' && request.confirmed !== true) {
      fail('This publishing stage requires explicit confirmation', 'confirmation-required');
    }

    const repositories = Object.fromEntries(before.repositories.map(repository => [repository.id, repository]));
    const results = [];
    let successful = true;
    activeRuns.add(runKey);
    try {
      for (const step of stageDefinition.steps) {
        const repository = repositories[step.repository];
        if (step.type === 'repository-status') {
          const snapshot = await inspectRepository(path.resolve(workspaceRoot), profile.repositories.find(
            candidate => candidate.id === step.repository
          ));
          results.push({
            id: step.id,
            type: step.type,
            repository: step.repository,
            success: snapshot.found && (snapshot.errors || []).length === 0,
            snapshot
          });
          if (!results[results.length - 1].success) {
            successful = false;
            break;
          }
          continue;
        }

        const resolvedExecutable = resolveStepExecutable(step, repository.path, fsImpl);
        if (!resolvedExecutable.success) fail(resolvedExecutable.error, 'publishing-executable-unavailable');
        const context = { message: message.trim(), repositories };
        const args = step.args.map(argument => renderTemplate(argument, context));
        const environment = Object.fromEntries(Object.entries(step.environment).map(([key, value]) => (
          [key, renderTemplate(value, context)]
        )));
        const result = await execute(resolvedExecutable.executable, args, {
          cwd: repository.path,
          env: { ...process.env, ...environment },
          timeoutMs: step.timeoutMs
        });
        const command = [step.executable, ...args].map(quoteCommandPart).join(' ');
        const stepResult = {
          id: step.id,
          type: step.type,
          repository: step.repository,
          cwd: repository.path,
          command,
          environment,
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          signal: result.signal || null,
          timedOut: Boolean(result.timedOut),
          stdout: truncateOutput(result.stdout),
          stderr: truncateOutput(result.stderr),
          durationMs: result.durationMs || 0
        };
        results.push(stepResult);
        if (!stepResult.success) {
          successful = false;
          break;
        }
      }
    } finally {
      activeRuns.delete(runKey);
    }

    const after = await inspectProfile(path.resolve(workspaceRoot), profile);
    return {
      success: successful,
      profileId,
      stageId,
      authority: stageDefinition.authority,
      results,
      repositoriesBefore: before.repositories,
      repositoriesAfter: after.repositories,
      downstreamRevision: after.downstreamRevision,
      error: successful ? null : (results.at(-1)?.stderr || `Publishing stage failed: ${stageId}`)
    };
  }

  return Object.freeze({ inspectWorkspace, runStage });
}

module.exports = {
  AUTHORITIES,
  BUILTIN_PROFILE_PATH,
  MAX_MESSAGE_LENGTH,
  PROFILE_RELATIVE_PATH,
  SAFE_BARE_EXECUTABLES,
  assertNoEmbeddedSecrets,
  buildStageDigest,
  createPublishingProfileService,
  defaultExecute,
  defaultToolResolver,
  loadWorkspaceProfiles,
  normalizeProfile,
  parseProfileDocument,
  parseStatus,
  renderTemplate,
  resolveRepositoryCandidate,
  resolveStepExecutable,
  truncateOutput
};
