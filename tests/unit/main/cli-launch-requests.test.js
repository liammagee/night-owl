const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  REQUEST_FILE_NAME,
  appendCliLaunchRequest,
  consumeCliLaunchRequests,
  getCliLaunchRequestFile,
  getDefaultUserDataPath
} = require('../../../services/cliLaunchRequests');

describe('NightOwl CLI launch request bridge', () => {
  test('appends and consumes launch requests from user data', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-cli-requests-'));

    appendCliLaunchRequest({
      userDataPath,
      args: ['/Users/example/project'],
      cwd: '/Users/example'
    });

    const requests = consumeCliLaunchRequests(userDataPath);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      args: ['/Users/example/project'],
      cwd: '/Users/example'
    });
    expect(fs.existsSync(getCliLaunchRequestFile(userDataPath))).toBe(false);
  });

  test('ignores malformed request lines without blocking valid requests', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-cli-requests-'));
    fs.writeFileSync(
      getCliLaunchRequestFile(userDataPath),
      `not-json\n${JSON.stringify({ args: ['/tmp/project'], cwd: '/tmp' })}\n`,
      'utf8'
    );

    const requests = consumeCliLaunchRequests(userDataPath);

    expect(requests).toHaveLength(1);
    expect(requests[0].args).toEqual(['/tmp/project']);
  });

  test('uses the platform user-data location for the shell launcher', () => {
    expect(getDefaultUserDataPath('NightOwl', 'darwin')).toContain(
      path.join('Library', 'Application Support', 'NightOwl')
    );
    expect(getDefaultUserDataPath('NightOwl', 'linux', { XDG_CONFIG_HOME: '/tmp/config' }))
      .toBe(path.join('/tmp/config', 'NightOwl'));
    expect(REQUEST_FILE_NAME).toBe('cli-launch-requests.jsonl');
  });
});
