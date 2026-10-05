const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const cliAIProvider = require('../../../services/cliAIProvider');

describe('cliAIProvider', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-cli-ai-test-'));
    cliAIProvider.setRuntimeDirectory(tempRoot);
  });

  function createSpawnMock(stdoutText) {
    return jest.fn(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = new EventEmitter();
      child.stdin.end = jest.fn(input => {
        child.stdinInput = input;
        queueMicrotask(() => {
          child.stdout.emit('data', stdoutText);
          child.emit('close', 0);
        });
      });
      child.kill = jest.fn();
      return child;
    });
  }

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('removes direct API credentials from subscription CLI subprocesses', () => {
    const env = cliAIProvider.buildCliEnvironment({
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'secret',
      ANTHROPIC_API_KEY: 'secret',
      CLAUDECODE: '1'
    });

    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.PATH).toContain(path.join(os.homedir(), '.local', 'bin'));
    expect(env.NIGHTOWL_AI_TRANSPORT).toBe('cli');
  });

  test('flattens canonical role history only at the CLI transport boundary', () => {
    const prompt = cliAIProvider.buildConversationPrompt({
      systemPrompt: 'Be concise.',
      messages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Follow up' }
      ]
    });

    expect(prompt).toContain('SYSTEM INSTRUCTIONS\nBe concise.');
    expect(prompt).toContain('USER\nFirst question\n\nASSISTANT\nFirst answer\n\nUSER\nFollow up');
  });

  test('calls Codex in ephemeral read-only mode and returns stdout', async () => {
    const spawn = createSpawnMock('CLI response\n');

    const result = await cliAIProvider.call({
      provider: 'codex-cli',
      systemPrompt: 'Help.',
      messages: [{ role: 'user', content: 'Hello' }],
      spawn
    });

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '-']),
      expect.objectContaining({ cwd: path.join(tempRoot, 'cli-ai-workspace'), stdio: ['pipe', 'pipe', 'pipe'] })
    );
    expect(spawn.mock.results[0].value.stdinInput).toContain('USER\nHello');
    expect(result).toEqual(expect.objectContaining({
      content: 'CLI response',
      provider: 'codex-cli',
      model: 'cli-default',
      usage: null
    }));
  });

  test('calls Claude without tools or persisted sessions', async () => {
    const spawn = createSpawnMock('Claude response');

    await cliAIProvider.call({
      provider: 'claude-cli',
      messages: [{ role: 'user', content: 'Hello' }],
      spawn
    });

    expect(spawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--print', '--no-session-persistence', '--safe-mode', '--tools', '', '--permission-mode', 'dontAsk']),
      expect.any(Object)
    );
    expect(spawn.mock.calls[0][1].join(' ')).not.toContain('Hello');
  });
});
