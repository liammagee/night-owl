const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  BUILTIN_PROFILE_PATH,
  createPublishingProfileService,
  defaultExecute,
  parseProfileDocument
} = require('../../../services/publishingProfiles');

function runGit(repoPath, args) {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim();
}

function initializeRepository(parentPath, name, remoteName = name) {
  const repoPath = path.join(parentPath, name);
  fs.mkdirSync(repoPath, { recursive: true });
  runGit(repoPath, ['init', '-q']);
  fs.writeFileSync(path.join(repoPath, 'README.md'), `# ${name}\n`, 'utf8');
  runGit(repoPath, ['add', 'README.md']);
  runGit(repoPath, [
    '-c', 'user.name=NightOwl Tests',
    '-c', 'user.email=nightowl@example.test',
    'commit', '-q', '-m', 'Initial fixture'
  ]);
  runGit(repoPath, ['remote', 'add', 'origin', `https://github.com/example/${remoteName}.git`]);
  return repoPath;
}

function writeExecutable(filePath, content = '#!/bin/sh\nexit 0\n') {
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function createProfileDocument() {
  return {
    schemaVersion: 1,
    profiles: [{
      id: 'fixture-site',
      title: 'Fixture site',
      description: 'Hermetic publishing fixture',
      repositories: [{
        id: 'content',
        label: 'Content',
        expectedBasenames: ['content-repo'],
        candidates: ['.'],
        remote: 'example/content-repo'
      }],
      stages: [
        {
          id: 'inspect',
          label: 'Inspect',
          authority: 'inspect',
          requires: ['git'],
          steps: [{ id: 'status', type: 'repository-status', repository: 'content' }]
        },
        {
          id: 'publish',
          label: 'Publish',
          authority: 'mutate',
          requires: ['git'],
          requiresCleanIndex: ['content'],
          messageRequired: true,
          steps: [{
            id: 'publish-content',
            type: 'command',
            repository: 'content',
            executable: './publish-test',
            args: ['--message', '{{message}}'],
            timeoutMs: 10000
          }]
        }
      ]
    }]
  };
}

describe('publishing profile orchestration', () => {
  let portfolioRoot;
  let workspaceRoot;

  beforeEach(() => {
    portfolioRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-publishing-'));
    workspaceRoot = initializeRepository(portfolioRoot, 'content-repo');
    writeExecutable(path.join(workspaceRoot, 'publish-test'));
    fs.mkdirSync(path.join(workspaceRoot, '.nightowl'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, '.nightowl', 'publishing.json'),
      `${JSON.stringify(createProfileDocument(), null, 2)}\n`,
      'utf8'
    );
  });

  afterEach(() => {
    fs.rmSync(portfolioRoot, { recursive: true, force: true });
  });

  test('the Machine Spirits profile names each ownership and verification boundary', () => {
    const document = JSON.parse(fs.readFileSync(BUILTIN_PROFILE_PATH, 'utf8'));
    const [profile] = parseProfileDocument(document, BUILTIN_PROFILE_PATH);

    expect(profile.id).toBe('machinespirits-public-site');
    expect(profile.repositories.map(repository => repository.id)).toEqual(['brand', 'content', 'website']);
    expect(profile.stages.map(stage => [stage.id, stage.authority])).toEqual([
      ['preflight', 'inspect'],
      ['preview', 'inspect'],
      ['publish', 'mutate'],
      ['deployment', 'network'],
      ['verify', 'network']
    ]);
    expect(profile.stages.find(stage => stage.id === 'publish')).toMatchObject({
      messageRequired: true,
      requiresCleanIndex: ['content']
    });
    expect(profile.stages.find(stage => stage.id === 'verify').steps[0].environment)
      .toMatchObject({ EXPECTED_CONTENT_REVISION: '{{repo.content.revision}}' });
  });

  test('discovers repository state, exact revision, tools, and an immutable command plan', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'draft.md'), 'uncommitted content\n', 'utf8');
    const service = createPublishingProfileService({ toolResolver: tool => `/tools/${tool}` });
    const inspection = await service.inspectWorkspace(workspaceRoot);
    const profile = inspection.profiles[0];
    const repository = profile.repositories[0];

    expect(inspection.success).toBe(true);
    expect(profile.id).toBe('fixture-site');
    expect(repository).toMatchObject({
      found: true,
      branch: expect.any(String),
      remoteMatches: true,
      status: { clean: false, untracked: 3 }
    });
    expect(repository.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(profile.downstreamRevision).toBe(repository.revision);
    expect(profile.stages.find(stage => stage.id === 'publish')).toMatchObject({
      canRun: true,
      planDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      plan: [expect.objectContaining({
        command: './publish-test --message "<release message>"'
      })]
    });
  });

  test('requires a current plan, release message, and explicit confirmation before mutation', async () => {
    const executed = [];
    const service = createPublishingProfileService({
      toolResolver: tool => `/tools/${tool}`,
      execute: async (executable, args, options) => {
        if (executable === 'git') return defaultExecute(executable, args, options);
        executed.push({ executable, args, options });
        return { exitCode: 0, stdout: 'published fixture', stderr: '', durationMs: 4 };
      }
    });
    const inspection = await service.inspectWorkspace(workspaceRoot);
    const stage = inspection.profiles[0].stages.find(candidate => candidate.id === 'publish');
    const request = {
      profileId: 'fixture-site',
      stageId: 'publish',
      planDigest: stage.planDigest,
      message: 'Ship fixture'
    };

    await expect(service.runStage(workspaceRoot, request)).rejects.toMatchObject({
      code: 'confirmation-required'
    });
    await expect(service.runStage(workspaceRoot, { ...request, confirmed: true, planDigest: 'stale' }))
      .rejects.toMatchObject({ code: 'stale-publishing-plan' });
    await expect(service.runStage(workspaceRoot, { ...request, confirmed: true, message: '' }))
      .rejects.toMatchObject({ code: 'message-required' });

    const result = await service.runStage(workspaceRoot, { ...request, confirmed: true });
    expect(result).toMatchObject({ success: true, downstreamRevision: expect.stringMatching(/^[a-f0-9]{40}$/) });
    expect(executed).toHaveLength(1);
    expect(executed[0]).toMatchObject({
      executable: path.join(workspaceRoot, 'publish-test'),
      args: ['--message', 'Ship fixture'],
      options: { cwd: workspaceRoot, timeoutMs: 10000 }
    });
    expect(executed[0].options).not.toHaveProperty('shell');
  });

  test('invalidates a reviewed plan when repository state changes', async () => {
    const service = createPublishingProfileService({ toolResolver: tool => `/tools/${tool}` });
    const inspection = await service.inspectWorkspace(workspaceRoot);
    const stage = inspection.profiles[0].stages.find(candidate => candidate.id === 'publish');
    fs.writeFileSync(path.join(workspaceRoot, 'changed-after-review.md'), 'changed\n', 'utf8');

    await expect(service.runStage(workspaceRoot, {
      profileId: 'fixture-site',
      stageId: 'publish',
      planDigest: stage.planDigest,
      message: 'Stale review',
      confirmed: true
    })).rejects.toMatchObject({ code: 'stale-publishing-plan' });
  });

  test('blocks publication when a scoped publisher would inherit staged changes', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'staged.md'), 'staged\n', 'utf8');
    runGit(workspaceRoot, ['add', 'staged.md']);
    const service = createPublishingProfileService({ toolResolver: tool => `/tools/${tool}` });
    const inspection = await service.inspectWorkspace(workspaceRoot);
    const publishStage = inspection.profiles[0].stages.find(stage => stage.id === 'publish');

    expect(publishStage.canRun).toBe(false);
    expect(publishStage.blockers).toContain('Content has pre-existing staged changes');
  });

  test('reports missing tools and repositories before offering a stage', async () => {
    const document = createProfileDocument();
    document.profiles[0].repositories[0].candidates = ['../missing-content-repo'];
    fs.writeFileSync(
      path.join(workspaceRoot, '.nightowl', 'publishing.json'),
      `${JSON.stringify(document, null, 2)}\n`,
      'utf8'
    );
    const service = createPublishingProfileService({ toolResolver: () => null });
    const inspection = await service.inspectWorkspace(workspaceRoot);
    const stage = inspection.profiles[0].stages[0];

    expect(stage.canRun).toBe(false);
    expect(stage.blockers).toEqual(expect.arrayContaining([
      'Required tool is unavailable: git',
      'Repository is unavailable: content'
    ]));
  });

  test('rejects embedded credentials and unsafe executable contracts', () => {
    const withSecret = createProfileDocument();
    withSecret.profiles[0].stages[0].token = 'do-not-store-this';
    expect(() => parseProfileDocument(withSecret, 'secret.json')).toThrow(/must not embed/);

    const withUnsafeExecutable = createProfileDocument();
    withUnsafeExecutable.profiles[0].stages[1].steps[0].executable = '/bin/sh';
    expect(() => parseProfileDocument(withUnsafeExecutable, 'unsafe.json')).toThrow(/portable relative path/);
  });
});
