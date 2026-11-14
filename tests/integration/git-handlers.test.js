/** Exercise the IPC handlers against real disposable repositories and local remotes. */
const { ipcMain } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseStatus, runGit } = require('../../services/gitService');

jest.unmock('child_process');

describe('Git authoring integration', () => {
  let temp, repo, remote, handlers;
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const call = (name, payload = repo) => handlers[`git-${name}`]({}, payload);
  const write = (file, content = '# Revised\n') => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), content); };
  const commit = (message = 'Initial') => { git('add', '.'); git('commit', '-m', message); };
  beforeAll(() => {
    handlers = {};
    ipcMain.handle.mockImplementation((name, handler) => { handlers[name] = handler; });
    require('../../ipc/gitHandlers').register({});
  });
  beforeEach(() => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-authoring-'));
    repo = path.join(temp, 'website'); remote = path.join(temp, 'remote.git');
    fs.mkdirSync(repo);
    git('init', '-b', 'feature/authoring');
    git('config', 'user.name', 'NightOwl Test'); git('config', 'user.email', 'test@example.invalid');
    git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', path.join(temp, 'hooks'));
    git('init', '--bare', remote); git('remote', 'add', 'origin', remote);
    write('lesson.md', '# Original\n'); commit();
  });
  afterEach(() => { fs.rmSync(temp, { recursive: true, force: true }); });

  test('finds nested folders, files, missing paths, and worktrees', async () => {
    fs.mkdirSync(path.join(repo, 'content'));
    expect(await call('find-repo', path.join(repo, 'content'))).toMatchObject({ success: true, repoRoot: repo, relativePath: 'content' });
    expect(await call('find-repo', path.join(repo, 'lesson.md'))).toMatchObject({ success: true, repoRoot: repo });
    expect((await call('find-repo', path.join(repo, 'missing'))).success).toBe(false);
    const worktree = path.join(temp, 'worktree'); git('worktree', 'add', '-b', 'linked', worktree);
    expect(await call('find-repo', worktree)).toMatchObject({ success: true, repoRoot: worktree });
  });

  test('round-trips literal Unicode, quotes, newlines, HTML and shell-like filenames', async () => {
    const files = ['content/α "quoted".md', 'content/line\nbreak.md', 'content/$(touch INJECTED).md', 'content/`touch INJECTED`.md', 'content/<img onerror=alert(1)>.md', 'content/[wild]*.md'];
    files.forEach(file => write(file));
    const status = await call('status-detailed');
    expect(status.unstaged.map(item => item.file).sort()).toEqual(files.sort());
    expect(await call('stage', { repoRoot: repo, paths: files })).toEqual({ success: true });
    const message = 'Revise "quotes" $(touch INJECTED) `touch INJECTED`\n\nKeep this literal.';
    const result = await call('commit', { repoRoot: repo, message });
    expect(result).toMatchObject({ success: true, commitHash: expect.stringMatching(/^[a-f0-9]+$/) });
    expect(git('log', '-1', '--format=%B').trim()).toBe(message);
    expect(fs.existsSync(path.join(repo, 'INJECTED'))).toBe(false);
    expect((await call('status-summary')).total).toBe(0);
  });

  test('staging one literal wildcard path does not stage its neighbors', async () => {
    write('a*.md'); write('abc.md');
    await call('stage', { repoRoot: repo, paths: ['a*.md'] });
    expect((await call('status-detailed')).staged.map(file => file.file)).toEqual(['a*.md']);
  });

  test('preserves both rename paths and filters folders correctly', async () => {
    write('content/old.md'); commit(); git('mv', 'content/old.md', 'content/new name.md');
    const status = await call('status', { repoRoot: repo, subfolder: 'content' });
    expect(status.changes).toEqual([expect.objectContaining({ file: 'content/new name.md', originalFile: 'content/old.md', status: 'renamed' })]);
    expect((await call('status', { repoRoot: repo, subfolder: 'con' })).changes).toEqual([]);
  });

  test('stages, unstages and discards tracked and untracked changes', async () => {
    write('lesson.md');
    await call('stage', { repoRoot: repo, paths: ['lesson.md'] });
    expect((await call('status-summary')).staged).toBe(1);
    await call('unstage', { repoRoot: repo, paths: ['lesson.md'] });
    expect((await call('status-summary')).staged).toBe(0);
    await call('discard', { repoRoot: repo, paths: ['lesson.md'] });
    expect(fs.readFileSync(path.join(repo, 'lesson.md'), 'utf8')).toBe('# Original\n');
    write('new/folder/note.md');
    await call('discard', { repoRoot: repo, paths: ['new'], untracked: true });
    expect(fs.existsSync(path.join(repo, 'new'))).toBe(false);
  });

  test('unstages safely before the first commit', async () => {
    const empty = path.join(temp, 'empty'); fs.mkdirSync(empty);
    execFileSync('git', ['init', '-b', 'main', empty]); fs.writeFileSync(path.join(empty, 'first.md'), 'first');
    await call('stage', { repoRoot: empty, paths: ['first.md'] });
    expect(await call('unstage', { repoRoot: empty, paths: ['first.md'] })).toEqual({ success: true });
    expect((await call('status-detailed', empty)).unstaged).toEqual([expect.objectContaining({ file: 'first.md', status: 'untracked' })]);
    expect(fs.readFileSync(path.join(empty, 'first.md'), 'utf8')).toBe('first');
  });

  test('folder publishing excludes unrelated staged work and sets the first upstream', async () => {
    write('content/new.md'); write('unrelated.md'); git('add', 'unrelated.md');
    const result = await call('publish', { repoRoot: repo, subfolder: 'content', message: 'Publish lesson' });
    expect(result).toMatchObject({ success: true, committed: true, pushed: true });
    expect(git('show', '--format=', '--name-only', 'HEAD').trim()).toBe('content/new.md');
    expect(git('diff', '--cached', '--name-only').trim()).toBe('unrelated.md');
    expect(git('rev-parse', '@{u}').trim()).toBe(git('rev-parse', 'HEAD').trim());
  });

  test('staged publishing preserves unstaged edits to the same file', async () => {
    write('lesson.md', '# Staged\n'); git('add', 'lesson.md'); write('lesson.md', '# Still editing\n');
    expect((await call('publish', { repoRoot: repo, message: 'Publish staged', stagedOnly: true })).success).toBe(true);
    expect(git('show', 'HEAD:lesson.md')).toBe('# Staged\n');
    expect(fs.readFileSync(path.join(repo, 'lesson.md'), 'utf8')).toBe('# Still editing\n');
  });

  test('reports a successful local commit when push fails and retries without another commit', async () => {
    git('remote', 'set-url', 'origin', path.join(temp, 'missing.git'));
    write('lesson.md'); git('add', 'lesson.md');
    const result = await call('publish', { repoRoot: repo, message: 'Keep this commit', stagedOnly: true });
    expect(result).toMatchObject({ success: false, committed: true, pushed: false, error: expect.stringContaining('Retry with Push') });
    expect(result.commitHash).toBe(git('rev-parse', '--short', 'HEAD').trim());
    const head = git('rev-parse', 'HEAD');
    git('remote', 'set-url', 'origin', remote);
    expect(await call('push')).toEqual({ success: true });
    expect(git('rev-parse', 'HEAD')).toBe(head);
  });

  test('rejects missing or ambiguous destinations before creating a commit', async () => {
    git('remote', 'remove', 'origin'); write('lesson.md'); git('add', '.');
    const head = git('rev-parse', 'HEAD');
    expect((await call('publish', { repoRoot: repo, message: 'No remote', stagedOnly: true })).error).toContain('Add a remote');
    expect(git('rev-parse', 'HEAD')).toBe(head);
    git('remote', 'add', 'one', remote); git('remote', 'add', 'two', remote);
    expect((await call('push')).error).toContain('Choose a remote');
  });

  test('rejects a cross-folder rename before modifying the index', async () => {
    write('content/old.md'); commit(); git('mv', 'content/old.md', 'moved.md');
    const before = git('diff', '--cached');
    expect((await call('publish', { repoRoot: repo, subfolder: 'content', message: 'Move' })).error).toContain('rename crosses');
    expect(git('diff', '--cached')).toBe(before);
  });

  test('rejects path traversal and option-like references', async () => {
    expect((await call('stage', { repoRoot: repo, paths: ['../outside'] })).success).toBe(false);
    expect((await call('stage', { repoRoot: repo, paths: [] })).success).toBe(false);
    expect((await call('switch-branch', { repoRoot: repo, branch: '--discard-changes' })).success).toBe(false);
  });

  test('shows conflicts separately and never calls a behind branch clean', () => {
    const status = parseStatus('## main...origin/main [behind 2]\0UU a.md\0AA b.md\0');
    expect(status.conflicts).toEqual(['a.md', 'b.md']); expect(status.staged).toEqual([]);
    expect(status.summary.clean).toBe(false);
    expect(parseStatus('## main...origin/main [behind 2]\0').summary.clean).toBe(false);
  });

  test('reads diffs, content, history, blame and initial-commit diffs', async () => {
    write('lesson.md');
    expect((await call('diff', { repoRoot: repo, filePath: 'lesson.md' })).diff).toContain('+# Revised');
    expect((await call('file-content', { repoRoot: repo, filePath: 'lesson.md', ref: 'HEAD' })).content).toBe('# Original\n');
    expect((await call('log', { repoRoot: repo, limit: 1 })).commits[0].message).toBe('Initial');
    expect((await call('show', { repoRoot: repo, hash: 'HEAD' })).commit.files[0].file).toBe('lesson.md');
    expect((await call('blame', { repoRoot: repo, filePath: 'lesson.md' })).lines).toHaveLength(1);
    expect((await call('diff-commit', { repoRoot: repo, hash: 'HEAD', filePath: 'lesson.md' })).diff).toContain('+# Original');
  });

  test('stages hunks in a linked worktree without assuming .git is a directory', async () => {
    const linked = path.join(temp, 'linked'); git('worktree', 'add', '-b', 'linked', linked);
    fs.writeFileSync(path.join(linked, 'lesson.md'), '# Linked revision\n');
    const patch = await runGit(['diff', '--', 'lesson.md'], { cwd: linked });
    expect(await call('stage-hunk', { repoRoot: linked, patch })).toEqual({ success: true });
    expect((await call('status-detailed', linked)).staged).toHaveLength(1);
  });

  test('supports branches, stashes, tags and remotes with literal messages', async () => {
    expect((await call('switch-branch', { repoRoot: repo, branch: 'lesson/review', create: true })).success).toBe(true);
    expect((await call('list-branches')).current).toBe('lesson/review');
    write('lesson.md');
    expect((await call('stash-save', { repoRoot: repo, message: 'WIP "literal" $HOME' })).success).toBe(true);
    expect((await call('stash-list')).stashes[0].message).toContain('$HOME');
    expect((await call('stash-apply', { repoRoot: repo, ref: 'stash@{0}', drop: true })).success).toBe(true);
    expect((await call('create-tag', { repoRoot: repo, name: 'v1', message: 'Lesson $HOME', annotated: true })).success).toBe(true);
    expect((await call('list-tags')).tags[0].name).toBe('v1');
    expect((await call('delete-tag', { repoRoot: repo, name: 'v1' })).success).toBe(true);
    expect((await call('list-remotes')).remotes[0].push).toBe(remote);
    expect((await call('log-graph', { repoRoot: repo, limit: 5 })).entries).toHaveLength(1);
  });

  test('blocks overlapping mutations while keeping the event loop responsive', async () => {
    const hooks = path.join(temp, 'hooks'); fs.mkdirSync(hooks);
    fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nsleep 0.3\n', { mode: 0o755 });
    write('lesson.md'); git('add', '.');
    const pending = call('commit', { repoRoot: repo, message: 'Slow hook' });
    let responsive = false;
    await new Promise(resolve => setTimeout(() => { responsive = true; resolve(); }, 20));
    expect(responsive).toBe(true);
    expect((await call('stage', { repoRoot: repo, paths: ['.'] })).error).toContain('still running');
    expect((await pending).success).toBe(true);
  });

  test('pull fast-forwards but refuses local edits and divergent history', async () => {
    await call('push');
    const other = path.join(temp, 'other'); git('clone', '--branch', 'feature/authoring', remote, other);
    const otherGit = (...args) => execFileSync('git', args, { cwd: other, encoding: 'utf8', stdio: 'pipe' });
    otherGit('config', 'user.name', 'Other'); otherGit('config', 'user.email', 'other@example.invalid'); otherGit('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(other, 'remote.md'), 'remote'); otherGit('add', '.'); otherGit('commit', '-m', 'Remote'); otherGit('push');
    await call('fetch'); expect((await call('status-summary')).behind).toBe(1);
    expect((await call('pull')).success).toBe(true);
    write('lesson.md'); expect((await call('pull')).error).toContain('Commit or stash'); commit('Local');
    fs.writeFileSync(path.join(other, 'second.md'), 'second'); otherGit('add', '.'); otherGit('commit', '-m', 'Remote second'); otherGit('push');
    const before = git('rev-parse', 'HEAD');
    expect((await call('pull')).success).toBe(false);
    expect(git('rev-parse', 'HEAD')).toBe(before);
    expect(git('status', '--porcelain')).toBe('');
  });
});
