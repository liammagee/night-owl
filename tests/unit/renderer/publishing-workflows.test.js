const modulePath = '../../../orchestrator/modules/publishing-workflows.js';

function emptyInspection() {
  return {
    success: true,
    workspaceRoot: '/workspace',
    customProfilePath: '/workspace/.nightowl/publishing.json',
    configurationErrors: [],
    profiles: []
  };
}

function profileInspection() {
  return {
    success: true,
    workspaceRoot: '/portfolio/content',
    customProfilePath: '/portfolio/content/.nightowl/publishing.json',
    configurationErrors: [],
    profiles: [{
      id: 'site',
      title: 'Site workflow',
      description: 'Test the content handoff',
      source: 'fixture',
      downstreamRevision: 'a'.repeat(40),
      warnings: [],
      tools: [{ name: 'git', available: true, executable: '/usr/bin/git' }],
      repositories: [{
        id: 'content',
        label: 'Content',
        found: true,
        path: '/portfolio/content',
        branch: 'main',
        revision: 'a'.repeat(40),
        origin: 'https://github.com/example/content.git',
        remote: 'example/content',
        remoteMatches: true,
        status: {
          clean: true,
          total: 0,
          staged: 0,
          modified: 0,
          untracked: 0,
          changedFiles: []
        }
      }],
      stages: [{
        id: 'publish',
        label: '1. Publish',
        description: 'Commit and push content',
        authority: 'mutate',
        messageRequired: true,
        canRun: true,
        blockers: [],
        planDigest: 'b'.repeat(64),
        plan: [{
          id: 'publish-content',
          type: 'command',
          repository: 'content',
          cwd: '/portfolio/content',
          command: './publish --message "<release message>"',
          display: 'Content: ./publish --message "<release message>"',
          environment: {}
        }]
      }]
    }]
  };
}

describe('publishing workflows renderer', () => {
  let inspect;
  let runStage;
  let registeredAction;
  let openFromMenu;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    inspect = jest.fn(async () => emptyInspection());
    runStage = jest.fn();
    registeredAction = null;
    openFromMenu = null;
    window.electronAPI = {
      publishing: { inspect, runStage },
      events: {
        openPublishingWorkflows: jest.fn(callback => {
          openFromMenu = callback;
          return jest.fn();
        })
      }
    };
    window.registerCommand = jest.fn((id, label, action) => {
      registeredAction = { id, label, action };
    });
    window.showAppConfirm = jest.fn(async () => true);
    window.showNotification = jest.fn();
    delete window.NightOwlPublishingWorkflows;
    require(modulePath);
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterEach(() => {
    window.NightOwlPublishingWorkflows?.close();
    delete window.NightOwlPublishingWorkflows;
    delete window.electronAPI;
    delete window.registerCommand;
    delete window.showAppConfirm;
    delete window.showNotification;
  });

  test('registers a discoverable action and explains how to add a workspace profile', async () => {
    expect(registeredAction).toMatchObject({
      id: 'publishing.openWorkflows',
      label: 'Publishing: Open Workflow'
    });
    expect(typeof openFromMenu).toBe('function');

    await registeredAction.action();
    const dialog = document.querySelector('#publishing-workflows-overlay');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('role')).toBeNull();
    expect(dialog.textContent).toContain('No publishing profile matches this workspace');
    expect(dialog.textContent).toContain('/workspace/.nightowl/publishing.json');
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  test('shows the exact revision and command, then confirms before a mutating stage', async () => {
    inspect.mockResolvedValue(profileInspection());
    runStage.mockResolvedValue({
      success: true,
      profileId: 'site',
      stageId: 'publish',
      downstreamRevision: 'c'.repeat(40),
      results: [{
        id: 'publish-content',
        success: true,
        command: './publish --message "Ship content"',
        stdout: 'published',
        stderr: '',
        durationMs: 10
      }]
    });

    await window.NightOwlPublishingWorkflows.open();
    const dialog = document.querySelector('.publishing-workflows-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.textContent).toContain('a'.repeat(40));
    expect(dialog.textContent).toContain('./publish --message "<release message>"');

    const message = dialog.querySelector('.publishing-message input');
    message.value = 'Ship content';
    message.dispatchEvent(new Event('input', { bubbles: true }));
    dialog.querySelector('.publishing-stage-footer button').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(window.showAppConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Publish across repositories?',
      paths: ['/portfolio/content'],
      confirmText: 'Publish content'
    }));
    expect(runStage).toHaveBeenCalledWith({
      profileId: 'site',
      stageId: 'publish',
      planDigest: 'b'.repeat(64),
      message: 'Ship content',
      confirmed: true
    });
    expect(document.body.textContent).toContain('content revision ' + 'c'.repeat(40));
  });
});
