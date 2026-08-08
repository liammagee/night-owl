const fs = require('fs');
const path = require('path');
const {
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_ON_CHANNELS,
  ALLOWED_SEND_CHANNELS,
  getInvokeContract,
  toMethodName
} = require('../../../preload-ipc-guard');

function collectRegisteredChannels(pattern) {
  const root = path.resolve(__dirname, '../../..');
  const files = [
    path.join(root, 'main.js'),
    ...fs.readdirSync(path.join(root, 'ipc'))
      .filter(file => file.endsWith('.js'))
      .map(file => path.join(root, 'ipc', file))
  ];
  const channels = new Set();
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) channels.add(match[1]);
  }
  return channels;
}

function collectRendererFiles() {
  const root = path.resolve(__dirname, '../../..');
  const files = [];
  const visit = target => {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target)) visit(path.join(target, entry));
    } else if (/\.(?:js|jsx)$/.test(target)) {
      files.push(target);
    }
  };
  for (const directory of ['js', 'orchestrator', 'plugins']) visit(path.join(root, directory));
  return files;
}

describe('IPC contract coverage', () => {
  test('every fixed invoke capability has exactly one registered main handler', () => {
    const registered = collectRegisteredChannels(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g);
    expect([...ALLOWED_INVOKE_CHANNELS].filter(channel => !registered.has(channel))).toEqual([]);
    expect([...registered].filter(channel => !ALLOWED_INVOKE_CHANNELS.has(channel))).toEqual([]);

    const methods = [...ALLOWED_INVOKE_CHANNELS].map(channel => {
      const contract = getInvokeContract(channel);
      return `${contract.capability}.${contract.method}`;
    });
    expect(new Set(methods).size).toBe(methods.length);
  });

  test('every renderer signal has a declared main listener', () => {
    const registered = collectRegisteredChannels(/ipcMain\.on\(\s*['"]([^'"]+)['"]/g);
    expect([...ALLOWED_SEND_CHANNELS].filter(channel => !registered.has(channel))).toEqual([]);
    expect([...registered].filter(channel => !ALLOWED_SEND_CHANNELS.has(channel))).toEqual([]);
  });

  test('every renderer capability call resolves to a declared contract method', () => {
    const declared = new Set([...ALLOWED_INVOKE_CHANNELS].map(channel => {
      const contract = getInvokeContract(channel);
      return `${contract.capability}.${contract.method}`;
    }));
    for (const channel of ALLOWED_ON_CHANNELS) declared.add(`events.${toMethodName(channel)}`);
    for (const channel of ALLOWED_SEND_CHANNELS) declared.add(`signals.${toMethodName(channel)}`);

    const unknown = [];
    const pattern = /(?:electronAPI|this\.api)(?:\?\.|\.)([A-Za-z_$][\w$]*)(?:\?\.|\.)([A-Za-z_$][\w$]*)/g;
    for (const file of collectRendererFiles()) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        const method = `${match[1]}.${match[2]}`;
        if (!declared.has(method)) unknown.push(`${path.relative(path.resolve(__dirname, '../../..'), file)}: ${method}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
