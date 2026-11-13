'use strict';

const { execFile } = require('child_process');
const path = require('path');

/** Execute Git without a shell or blocking Electron's main process. */
function runGit(args, options = {}) {
  const { input, ...execOptions } = options;
  return new Promise((resolve, reject) => {
    const child = execFile('git', ['--literal-pathspecs', ...args], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024,
      ...execOptions,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
        GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0' },
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = error.killed ? 'Git timed out. Check your connection and authentication, then retry.'
          : String(stderr || stdout || error.message).trim();
        reject(error);
      } else resolve(stdout);
    });
    // Consume stdin even without a patch so a subprocess cannot wait on input.
    child.stdin?.on('error', () => {});
    child.stdin?.end(input);
  });
}

function validatePaths(paths) {
  if (!Array.isArray(paths) || !paths.length) throw new Error('Choose at least one path.');
  return paths.map(file => {
    if (typeof file !== 'string' || !file || file.includes('\0') || path.isAbsolute(file) ||
        file.split(/[\\/]/).includes('..')) throw new Error('Paths must stay inside the repository.');
    return file;
  });
}

function validateRef(ref) {
  if (typeof ref !== 'string' || !ref || ref.startsWith('-') || /[\0\r\n]/.test(ref)) {
    throw new Error('Invalid Git reference.');
  }
  return ref;
}

const labels = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', T: 'modified', '?': 'untracked' };
const conflictCodes = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

/** NUL records preserve spaces, quotes, Unicode, newlines, and both rename paths. */
function parseStatus(output) {
  const records = output.split('\0');
  const header = records.shift() || '';
  const branchLine = header.replace(/^## /, '');
  const unborn = /^(No commits yet on |Initial commit on )/.test(branchLine);
  const detached = branchLine.startsWith('HEAD (');
  const branch = detached ? 'HEAD' : branchLine.replace(/^(No commits yet on |Initial commit on )/, '').split('...')[0];
  const upstream = branchLine.includes('...') ? branchLine.split('...')[1].replace(/ \[.*$/, '') : null;
  const ahead = Number(branchLine.match(/ahead (\d+)/)?.[1] || 0);
  const behind = Number(branchLine.match(/behind (\d+)/)?.[1] || 0);
  const changes = [], staged = [], unstaged = [], conflicts = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    const code = record.slice(0, 2);
    const file = record.slice(3);
    const originalFile = /[RC]/.test(code) ? records[++i] : undefined;
    const conflict = conflictCodes.has(code);
    const change = { file, statusCode: code.trim(), status: conflict ? 'conflict' : labels[code[0]] || labels[code[1]] || 'modified' };
    if (originalFile) change.originalFile = originalFile;
    changes.push(change);
    if (conflict) { conflicts.push(file); unstaged.push(change); continue; }
    if (code[0] !== ' ' && code[0] !== '?') staged.push({ ...change, status: labels[code[0]] || 'modified', statusCode: code[0] });
    if (code[1] !== ' ') unstaged.push({ ...change, status: labels[code[1]] || 'modified', statusCode: code === '??' ? '??' : code[1] });
  }
  return { branch, unborn, detached, changes, staged, unstaged, conflicts,
    summary: { branch, unborn, detached, upstream, upstreamGone: branchLine.includes('[gone]'),
      staged: staged.length, modified: unstaged.filter(f => f.status !== 'untracked').length,
      untracked: unstaged.filter(f => f.status === 'untracked').length, total: changes.length,
      ahead, behind, conflicts: conflicts.length, clean: changes.length === 0 && ahead === 0 && behind === 0 } };
}

// Share simultaneous status requests (panel, status bar, file tree), without a
// time-based cache that could hide edits made outside NightOwl.
const pendingStatus = new Map();
function invalidateStatus(repoRoot) { pendingStatus.delete(repoRoot); }
function readStatus(repoRoot) {
  if (!pendingStatus.has(repoRoot)) {
    const pending = runGit(['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all'], { cwd: repoRoot })
      .then(parseStatus).finally(() => { if (pendingStatus.get(repoRoot) === pending) pendingStatus.delete(repoRoot); });
    pendingStatus.set(repoRoot, pending);
  }
  return pendingStatus.get(repoRoot);
}

async function pushBranch(repoRoot, { dryRun = false } = {}) {
  const state = await readStatus(repoRoot);
  if (state.detached) throw new Error('Switch to a branch before pushing.');
  const branch = validateRef(state.branch);
  const config = async key => {
    try { return (await runGit(['config', '--get', key], { cwd: repoRoot })).trim(); }
    catch (error) { if (error.code === 1) return ''; throw error; }
  };
  const [configuredRemote, merge] = await Promise.all([
    config(`branch.${branch}.remote`), config(`branch.${branch}.merge`)
  ]);
  let remote = configuredRemote;
  let setUpstream = false;
  if (!remote) {
    const remotes = (await runGit(['remote'], { cwd: repoRoot })).trim().split('\n').filter(Boolean);
    if (remotes.length !== 1) throw new Error(remotes.length ? 'Choose a remote in the Remotes section and push once to set the upstream.' : 'Add a remote in the Remotes section before pushing.');
    remote = remotes[0];
    setUpstream = true;
  }
  if (remote === '.') throw new Error('This branch tracks a local branch. Choose a publishing remote first.');
  const target = merge || `refs/heads/${branch}`;
  if (!target.startsWith('refs/heads/')) throw new Error('The upstream is not a branch. Choose a publishing branch first.');
  if (dryRun) return { remote, branch, target };
  await runGit(['push', ...(setUpstream ? ['--set-upstream'] : []), '--', validateRef(remote), `HEAD:${target}`], { cwd: repoRoot, timeout: 60000 });
}

module.exports = { runGit, validatePaths, validateRef, parseStatus, readStatus, invalidateStatus, pushBranch };
