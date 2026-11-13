const fs = require('fs');
const path = require('path');
const markup = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const source = fs.readFileSync(path.resolve(__dirname, '../../orchestrator/modules/git-panel.js'), 'utf8');
const state = (extra = {}) => ({ success: true, branch: 'main', staged: [{ file: 'lesson.md', status: 'modified' }], unstaged: [], total: 1, ahead: 0, behind: 0, conflicts: 0, upstream: 'origin/main', ...extra });
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

describe('Git authoring panel behavior', () => {
  let git;
  beforeEach(async () => {
    jest.useFakeTimers();
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    document.body.innerHTML = parsed.getElementById('git-pane').outerHTML;
    window.editor = null;
    window.hasUnsavedChanges = false;
    window.NightOwlWindowClose = { unsavedNames: () => [] };
    window.showNotification = jest.fn();
    window.updateGitStatusIndicator = jest.fn();
    window.showAppConfirm = jest.fn().mockResolvedValue(true);
    git = {
      findRepo: jest.fn().mockResolvedValue({ success: true, repoRoot: '/website' }),
      statusDetailed: jest.fn().mockResolvedValue(state()),
      listRemotes: jest.fn().mockResolvedValue({ success: true, remotes: [{ name: 'origin', push: 'https://github.com/example/website.git' }] }),
      stashList: jest.fn().mockResolvedValue({ success: true, stashes: [] }),
      publish: jest.fn().mockResolvedValue({ success: true, committed: true, commitHash: 'abc123' }),
      stage: jest.fn().mockResolvedValue({ success: true }),
      unstage: jest.fn().mockResolvedValue({ success: true }),
      commit: jest.fn().mockResolvedValue({ success: true, commitHash: 'abc123' }),
      push: jest.fn().mockResolvedValue({ success: true }),
      pull: jest.fn().mockResolvedValue({ success: true })
    };
    window.electronAPI = { git, workspace: { getWorkingDirectory: jest.fn().mockResolvedValue('/website') } };
    jest.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    window.eval(source);
    jest.advanceTimersByTime(100);
    await window.gitPanel.refresh();
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
  const message = () => {
    const input = document.getElementById('git-commit-message');
    input.value = 'Refine lesson'; input.dispatchEvent(new Event('input')); return input;
  };

  test('shows the repository and destination, and enables publishing only with a staged change and message', () => {
    expect(document.getElementById('git-repository-name').textContent).toBe('website');
    expect(document.getElementById('git-destination').textContent).toBe('origin/main');
    expect(document.getElementById('git-publish-btn').disabled).toBe(true);
    message(); expect(document.getElementById('git-publish-btn').disabled).toBe(false);
  });

  test('renders unusual filenames as text, never executable HTML', async () => {
    const file = '<img src=x onerror=alert(1)>/"lesson".md';
    git.statusDetailed.mockResolvedValue(state({ unstaged: [{ file, status: 'untracked' }] }));
    await window.gitPanel.refresh();
    expect(document.querySelector('#git-unstaged-list img')).toBeNull();
    expect(document.querySelector('#git-unstaged-list').textContent).toContain('<img src=x onerror=alert(1)>');
  });

  test('escapes quotes in repository metadata used inside HTML attributes', async () => {
    const message = '\" onmouseover=\"alert(1)';
    git.stashList.mockResolvedValue({ success: true, stashes: [{ ref: 'stash@{0}', message, relativeTime: 'now' }] });
    await window.gitPanel.refresh();
    const title = document.querySelector('.git-stash-msg');
    expect(title.getAttribute('title')).toBe(message);
    expect(title.hasAttribute('onmouseover')).toBe(false);
  });

  test('refreshes saved edits only when the panel is visible', async () => {
    document.getElementById('git-pane').style.display = 'flex';
    git.statusDetailed.mockClear();
    window.gitPanel.onFileSaved(); window.gitPanel.onFileSaved();
    jest.advanceTimersByTime(200); await flush();
    expect(git.statusDetailed).toHaveBeenCalledTimes(1);
    document.getElementById('git-pane').style.display = 'none';
    window.gitPanel.onFileSaved(); jest.advanceTimersByTime(200); await flush();
    expect(git.statusDetailed).toHaveBeenCalledTimes(1);
  });

  test('publishes exactly once, locks controls during a push, and reports completion', async () => {
    let complete;
    git.publish.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const input = message(); const button = document.getElementById('git-publish-btn');
    button.click(); button.click();
    expect(git.publish).toHaveBeenCalledTimes(1);
    expect(git.publish).toHaveBeenCalledWith({ repoRoot: '/website', message: 'Refine lesson', stagedOnly: true });
    expect(document.getElementById('git-push-btn').disabled).toBe(true);
    complete({ success: true, committed: true, commitHash: 'abc123' }); await flush();
    expect(input.value).toBe('');
    expect(document.getElementById('git-operation-status').textContent).toBe('Published abc123.');
    expect(document.getElementById('git-push-btn').disabled).toBe(false);
  });

  test('keeps the committed-but-not-pushed message visible and enables Push retry', async () => {
    git.publish.mockResolvedValue({ success: false, committed: true, error: 'Committed locally. Retry with Push.' });
    const input = message(); document.getElementById('git-publish-btn').click(); await flush();
    expect(input.value).toBe('');
    expect(document.getElementById('git-operation-status').textContent).toContain('Retry with Push');
    document.getElementById('git-push-btn').click(); await flush();
    expect(git.push).toHaveBeenCalledWith('/website'); expect(git.publish).toHaveBeenCalledTimes(1);
  });

  test('blocks publishing while any open editor has unsaved edits', async () => {
    window.NightOwlWindowClose.unsavedNames = () => ['inactive.md'];
    message(); document.getElementById('git-publish-btn').click(); await flush();
    expect(git.publish).not.toHaveBeenCalled();
    expect(window.showNotification).toHaveBeenCalledWith(expect.stringContaining('Save your open edits'), 'warning');
  });

  test('clears old repository controls when the workspace has no Git repository', async () => {
    git.findRepo.mockResolvedValue({ success: false }); await window.gitPanel.refresh();
    expect(document.getElementById('git-branch-name').textContent).toBe('No repository');
    expect(document.getElementById('git-staged-list').textContent).toBe('');
    expect(document.getElementById('git-push-btn').disabled).toBe(true);
    expect(window.gitFileStatus.files).toEqual({});
  });

  test('ignores an old refresh that completes after a newer workspace refresh', async () => {
    let complete;
    git.statusDetailed.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const older = window.gitPanel.refresh(); await flush();
    git.findRepo.mockResolvedValue({ success: true, repoRoot: '/new-website' });
    git.statusDetailed.mockResolvedValue(state({ branch: 'new-branch' }));
    await window.gitPanel.refresh();
    complete(state({ branch: 'old-branch' })); await older;
    expect(document.getElementById('git-repository-name').textContent).toBe('new-website');
    expect(document.getElementById('git-branch-name').textContent).toBe('new-branch');
  });

  test('unstages both ends of a rename and reports staging failures', async () => {
    git.statusDetailed.mockResolvedValue(state({ staged: [{ file: 'new.md', originalFile: 'old.md', status: 'renamed' }] }));
    await window.gitPanel.refresh(); document.querySelector('.git-act-unstage').click(); await flush();
    expect(git.unstage).toHaveBeenCalledWith({ repoRoot: '/website', paths: ['new.md', 'old.md'] });
    git.stage.mockResolvedValue({ success: false, error: 'Index locked' });
    document.getElementById('git-stage-all-btn').click(); await flush();
    expect(document.getElementById('git-operation-status').textContent).toBe('Index locked');
  });
});
