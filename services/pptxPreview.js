'use strict';

const crypto = require('crypto');
const { execFile: defaultExecFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const MAX_PREVIEW_HTML_BYTES = 32 * 1024 * 1024;

function run(command, args, options = {}) {
  const execFile = options.execFile || defaultExecFile;
  return new Promise(resolve => {
    execFile(command, args, {
      timeout: options.timeout || 60 * 1000,
      maxBuffer: options.maxBuffer || 1024 * 1024,
      windowsHide: true,
      env: options.env || process.env
    }, (error, stdout, stderr) => resolve({
      error,
      stdout: String(stdout || ''),
      stderr: String(stderr || '')
    }));
  });
}

async function findPreviewHtml(directory, depth = 0) {
  if (depth > 3) return null;
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (_error) {
    return null;
  }

  const preview = entries.find(entry => entry.isFile() && entry.name === 'Preview.html');
  if (preview) return path.join(directory, preview.name);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = await findPreviewHtml(path.join(directory, entry.name), depth + 1);
    if (nested) return nested;
  }
  return null;
}

function previewCacheKey(filePath, stat) {
  return crypto
    .createHash('sha256')
    .update(`${path.resolve(filePath)}\0${stat.size}\0${stat.mtimeMs}`)
    .digest('hex')
    .slice(0, 24);
}

async function readPreview(previewPath, metadata = {}) {
  const stat = await fs.promises.stat(previewPath);
  if (stat.size > MAX_PREVIEW_HTML_BYTES) {
    return {
      success: false,
      code: 'PPTX_PREVIEW_TOO_LARGE',
      error: 'The generated PowerPoint preview is too large to display safely.'
    };
  }
  return {
    success: true,
    renderer: 'html',
    engine: 'macos-quick-look',
    html: await fs.promises.readFile(previewPath, 'utf8'),
    previewPath,
    baseUrl: pathToFileURL(`${path.dirname(previewPath)}${path.sep}`).href,
    ...metadata
  };
}

async function renderPptxPreview(filePath, options = {}) {
  const platform = options.platform || process.platform;
  const resolvedPath = path.resolve(filePath || '');
  if (path.extname(resolvedPath).toLowerCase() !== '.pptx') {
    return {
      success: false,
      code: 'PPTX_PREVIEW_UNSUPPORTED_TYPE',
      error: 'PowerPoint preview currently supports .pptx files.'
    };
  }

  let stat;
  try {
    stat = await fs.promises.stat(resolvedPath);
    if (!stat.isFile()) throw new Error('Not a file');
  } catch (_error) {
    return { success: false, code: 'PPTX_PREVIEW_NOT_FOUND', error: 'The PowerPoint file could not be found.' };
  }

  if (platform !== 'darwin') {
    return {
      success: false,
      code: 'PPTX_PREVIEW_UNAVAILABLE',
      error: 'In-app PowerPoint rendering currently requires macOS Quick Look. You can still open the deck in PowerPoint.'
    };
  }

  const cacheRoot = options.cacheRoot || path.join(options.userDataPath || process.cwd(), 'pptx-previews');
  const cacheDirectory = path.join(cacheRoot, previewCacheKey(resolvedPath, stat));
  const cachedPreview = await findPreviewHtml(cacheDirectory);
  if (cachedPreview) return readPreview(cachedPreview, { cacheHit: true });

  await fs.promises.mkdir(cacheDirectory, { recursive: true });
  const command = options.quickLookPath || '/usr/bin/qlmanage';
  const result = await run(command, ['-p', '-o', cacheDirectory, resolvedPath], options);
  if (result.error) {
    return {
      success: false,
      code: result.error.code === 'ENOENT' ? 'PPTX_QUICK_LOOK_MISSING' : 'PPTX_PREVIEW_FAILED',
      error: 'macOS Quick Look could not render this PowerPoint file. You can still open it in PowerPoint.'
    };
  }

  const previewPath = await findPreviewHtml(cacheDirectory);
  if (!previewPath) {
    return {
      success: false,
      code: 'PPTX_PREVIEW_MISSING_OUTPUT',
      error: 'Quick Look completed without producing a PowerPoint preview.'
    };
  }
  return readPreview(previewPath, { cacheHit: false });
}

module.exports = {
  MAX_PREVIEW_HTML_BYTES,
  findPreviewHtml,
  previewCacheKey,
  renderPptxPreview,
  run
};
