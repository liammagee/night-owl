const fs = require('fs').promises;
const { convertMarkdown } = require('../../../services/documentConversion');

test('conversion uses argv, metadata file and cleans temporary inputs', async () => {
  let directory;
  const execFile = (command, args, options, callback) => {
    directory = require('path').dirname(args[0]);
    expect(command).toBe('pandoc');
    expect(args).toContain('--to=epub3');
    expect(options).toMatchObject({ timeout: 120000 });
    expect(options.shell).toBeUndefined();
    fs.readFile(args[args.indexOf('--metadata-file') + 1], 'utf8').then(metadata => {
      expect(JSON.parse(metadata).title).toBe('Title $(literal)');
      return fs.writeFile(args[args.indexOf('--output') + 1], Buffer.from('PK-test'));
    }).then(() => callback(null), callback);
  };
  expect(await convertMarkdown('# Title', { format: 'epub', metadata: { title: 'Title $(literal)' } }, { execFile })).toEqual(Buffer.from('PK-test'));
  await expect(fs.stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('missing converter gives an actionable error and removes temporary files', async () => {
  let directory;
  const execFile = (_command, args, _options, callback) => {
    directory = require('path').dirname(args[0]);
    callback(Object.assign(new Error('missing'), { code: 'ENOENT' }));
  };
  await expect(convertMarkdown('Text', { format: 'epub' }, { execFile })).rejects.toThrow('Pandoc is required');
  await expect(fs.stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});
