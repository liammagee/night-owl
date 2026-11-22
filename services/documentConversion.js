'use strict';

const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

/** Use the same document converter as standard exports; never label HTML as EPUB. */
async function convertMarkdown(content, { format, metadata = {}, options = {}, resourcePath } = {}, dependencies = {}) {
  if (typeof content !== 'string') throw new TypeError('Export content must be text');
  if (!['epub', 'latex'].includes(format)) throw new TypeError('Unsupported export format');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nightowl-export-'));
  try {
    const input = path.join(temporary, 'document.md');
    const output = path.join(temporary, format === 'epub' ? 'document.epub' : 'document.tex');
    const metadataPath = path.join(temporary, 'metadata.json');
    const safeMetadata = Object.fromEntries(['title', 'author', 'date', 'lang'].filter(key => typeof metadata[key] === 'string').map(key => [key, metadata[key]]));
    await fs.writeFile(input, content, 'utf8');
    await fs.writeFile(metadataPath, JSON.stringify(safeMetadata), 'utf8');
    const args = [input, '--from=markdown', `--to=${format === 'epub' ? 'epub3' : 'latex'}`, '--standalone', '--metadata-file', metadataPath, '--output', output];
    if (resourcePath) args.push('--resource-path', resourcePath);
    if (format === 'latex') {
      for (const [key, value] of [['documentclass', options.documentClass || 'article'], ['fontsize', options.fontSize || '12pt']]) {
        if (!/^[a-zA-Z0-9.-]+$/.test(value)) throw new TypeError(`Invalid LaTeX ${key}`);
        args.push('--variable', `${key}=${value}`);
      }
    }
    await new Promise((resolve, reject) => {
      (dependencies.execFile || execFile)('pandoc', args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, error => {
        if (error?.code === 'ENOENT') reject(new Error('Pandoc is required for EPUB and LaTeX export. Install Pandoc and try again.'));
        else if (error) reject(error);
        else resolve();
      });
    });
    return await fs.readFile(output);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

module.exports = { convertMarkdown };
