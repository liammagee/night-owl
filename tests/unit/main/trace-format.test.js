const fs = require('fs');
const os = require('os');
const path = require('path');
const { readTrace } = require('../../../scripts/compare-chromium-traces');

test('trace comparison rejects protobuf and dataless JSON with useful errors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-traces-'));
  const target = path.join(root, 'trace');
  try {
    fs.writeFileSync(target, Buffer.from([10, 42, 0, 1]));
    expect(() => readTrace(target)).toThrow('traceconv json');
    fs.writeFileSync(target, '{}');
    expect(() => readTrace(target)).toThrow('traceEvents');
    fs.writeFileSync(target, '{"traceEvents":[{"name":"test"}]}');
    expect(readTrace(target)).toEqual([{ name: 'test' }]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
