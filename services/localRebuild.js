'use strict';

const fs = require('fs');
// Electron's patched fs treats app.asar as a virtual directory. Bundle removal
// must use the actual disk filesystem, while copying this module needs asar support.
const diskFs = process.versions.electron ? require('original-fs') : fs;
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

function validateSource(source) {
  const root = fs.realpathSync(source);
  const dev = fs.realpathSync(path.join(os.homedir(), 'Dev'));
  if (!root.startsWith(dev + path.sep)) throw new Error('Choose a local NightOwl checkout under ~/Dev.');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.name !== 'night-owl' || !pkg.scripts?.['dist:dir']) throw new Error('This folder is not a buildable NightOwl checkout.');
  for (const file of ['main.js', 'node_modules/electron-builder/cli.js']) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}. Install this checkout’s dependencies first.`);
  }
  return root;
}

function findTool(name) {
  const dirs = [...(process.env.PATH || '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  for (const dir of dirs.filter(Boolean)) {
    const file = path.join(dir, name);
    try { fs.accessSync(file, fs.constants.X_OK); return fs.realpathSync(file); } catch (_) { /* try next */ }
  }
  throw new Error(`${name} was not found. Install Node.js and npm before rebuilding.`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', options.log ?? 'ignore', options.log ?? 'ignore'] });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${signal || code}).`)));
  });
}

function verifyBundle(bundle) {
  const resources = path.join(bundle, 'Contents', 'Resources');
  for (const file of ['app.asar', 'app.asar.unpacked/node_modules/sqlite3/build/Release/node_sqlite3.node', 'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'app.asar.unpacked/node_modules/node-pty/build/Release/pty.node']) {
    if (!fs.existsSync(path.join(resources, file))) throw new Error(`Incomplete build: ${file}`);
  }
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'pipe' });
}

function acquireLock(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, 'rebuild.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error(`Invalid rebuild lock: ${lock}`);
    try { process.kill(pid, 0); throw new Error('A NightOwl rebuild or installation is already running.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  return lock;
}

async function prepareRebuild({ source, target, stateDir, userData, args = [], onProgress = () => {} }) {
  if (process.platform !== 'darwin') throw new Error('Automatic local rebuild is currently supported on macOS.');
  source = validateSource(source);
  target = fs.realpathSync(target);
  if (path.basename(target) !== 'NightOwl.app') throw new Error('The running app must be named NightOwl.app.');
  const lock = acquireLock(stateDir);
  let log;
  let staged;
  try {
    const node = findTool('node');
    const npm = findTool('npm');
    const job = fs.mkdtempSync(path.join(stateDir, 'rebuild-'));
    const logPath = path.join(job, 'build.log');
    log = fs.openSync(logPath, 'a', 0o600);
    const env = { ...process.env, PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH || '/usr/bin:/bin'}` };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    // A local rebuild must not publish or submit an artifact for notarization.
    const output = path.join(job, 'dist');
    onProgress('Building latest code…', logPath);
    await run(node, [npm, 'run', 'dist:dir', '--', '--mac', `--${process.arch}`, `--config.directories.output=${output}`, '--config.mac.notarize=false'], { cwd: source, env, log });
    const built = path.join(output, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'NightOwl.app');
    onProgress('Checking build…', logPath);
    verifyBundle(built);
    staged = path.join(path.dirname(target), `.NightOwl-${path.basename(job)}.app`);
    await run('/usr/bin/ditto', [built, staged], { log });
    verifyBundle(staged);
    diskFs.rmSync(output, { recursive: true, force: true });
    const worker = path.join(job, 'installer.cjs');
    fs.copyFileSync(__filename, worker);
    const config = path.join(job, 'install.json');
    fs.writeFileSync(config, JSON.stringify({ parentPid: process.pid, target, staged, backup: path.join(path.dirname(target), `.NightOwl-previous-${path.basename(job)}.app`), lock, args, userData, logPath }), { mode: 0o600 });
    fs.closeSync(log);
    log = undefined;
    let handedOff = false;
    let discarded = false;
    return {
      logPath,
      async handoff() {
        if (discarded || handedOff) throw new Error('This prepared update is no longer available.');
        const fd = fs.openSync(logPath, 'a');
        try {
          const child = spawn(node, [worker, '--install', config], { detached: true, stdio: ['ignore', fd, fd, 'ipc'], env });
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { child.kill(); reject(new Error('Installer did not become ready.')); }, 10000);
            const fail = error => { clearTimeout(timer); reject(error); };
            child.once('error', fail);
            child.once('exit', code => fail(new Error(`Installer exited before handoff (${code}).`)));
            child.once('message', message => {
              if (message !== 'ready') return;
              clearTimeout(timer);
              child.disconnect();
              resolve();
            });
          });
          fs.writeFileSync(lock, String(child.pid));
          child.unref();
          handedOff = true;
        } finally { fs.closeSync(fd); }
      },
      discard() {
        if (handedOff || discarded) return;
        discarded = true;
        diskFs.rmSync(staged, { recursive: true, force: true });
        diskFs.rmSync(lock, { force: true });
      }
    };
  } catch (error) {
    if (log !== undefined) fs.closeSync(log);
    if (staged) diskFs.rmSync(staged, { recursive: true, force: true });
    diskFs.rmSync(lock, { force: true });
    throw error;
  }
}

async function installPrepared(config, options = {}) {
  const runCommand = options.run || run;
  const alive = options.alive || (pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } });
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let oldMoved = false;
  let installed = false;
  try {
    // Never replace the bundle until the process that approved this update exits.
    let attempts = 0;
    while (alive(config.parentPid)) {
      if (++attempts > 120) throw new Error('NightOwl did not exit within two minutes; installation cancelled.');
      await sleep(1000);
    }
    fs.renameSync(config.target, config.backup);
    oldMoved = true;
    fs.renameSync(config.staged, config.target);
    installed = true;
    await runCommand('/usr/bin/open', ['-n', config.target, '--args', ...config.args, `--nightowl-user-data-dir=${config.userData}`], { env: { ...process.env, NIGHTOWL_WORKSPACE_USER_DATA_DIR: config.userData } });
    console.log('Installed and reopened NightOwl. Previous app:', config.backup);
    // Keep one rollback bundle rather than accumulating a full app per restart.
    for (const name of fs.readdirSync(path.dirname(config.target))) {
      if (!name.startsWith('.NightOwl-previous-rebuild-') || !name.endsWith('.app')) continue;
      const previous = path.join(path.dirname(config.target), name);
      if (previous !== config.backup) {
        try { diskFs.rmSync(previous, { recursive: true, force: true }); } catch (error) { console.error('Could not remove older rollback:', error.message); }
      }
    }
  } catch (error) {
    if (oldMoved) {
      if (installed) fs.renameSync(config.target, config.staged);
      fs.renameSync(config.backup, config.target);
      await runCommand('/usr/bin/open', ['-n', config.target, '--args', ...config.args, `--nightowl-user-data-dir=${config.userData}`]).catch(() => {});
    }
    throw error;
  } finally {
    diskFs.rmSync(config.lock, { force: true });
  }
}

if (require.main === module && process.argv[2] === '--install') {
  const config = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  if (process.send) process.send('ready');
  installPrepared(config).catch(error => {
    console.error(error);
    // A fixed dialog directs the user to the persisted build/install log.
    run('/usr/bin/osascript', ['-e', 'display alert "NightOwl update failed" message "The previous app was retained or restored. See the latest build log in NightOwl’s local-rebuild folder in Application Support."']).finally(() => { process.exitCode = 1; });
  });
}

module.exports = { validateSource, findTool, acquireLock, prepareRebuild, installPrepared };
