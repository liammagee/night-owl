'use strict';

const fs = require('fs').promises;
const path = require('path');

const EXTRACTION_VERSION = 1;
const DEFAULT_MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_FILES = 50000;
const DEFAULT_YIELD_EVERY = 100;
const TEXT_FORMATS = Object.freeze({
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.text': 'text',
  '.bib': 'bibtex',
  '.json': 'json',
  '.jsonc': 'json',
  '.jsonl': 'jsonl',
  '.csv': 'csv',
  '.tsv': 'tsv',
  '.html': 'html',
  '.htm': 'html',
  '.yaml': 'yaml',
  '.yml': 'yaml'
});
const BINARY_FORMATS = Object.freeze({
  '.pdf': 'pdf',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.ppt': 'presentation',
  '.pptx': 'presentation',
  '.doc': 'document',
  '.docx': 'document'
});
const IGNORED_DIRECTORIES = new Set([
  '.git', '.hg', '.svn', '.nightowl-backups', 'node_modules', '__pycache__',
  'dist', 'build', 'coverage', '.cache', '.turbo'
]);
const INTERNAL_LINK_EXTENSIONS = Object.freeze([
  '.md', '.markdown', '.html', '.htm', '.bib', '.jsonl', '.csv', '.txt', '.text'
]);

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function extensionFor(filePath) {
  return path.extname(filePath).toLowerCase();
}

function classifyFile(filePath) {
  const extension = extensionFor(filePath);
  if (TEXT_FORMATS[extension]) {
    return { supported: true, searchable: true, kind: 'text', format: TEXT_FORMATS[extension], extension };
  }
  if (BINARY_FORMATS[extension]) {
    return { supported: true, searchable: false, kind: 'binary', format: BINARY_FORMATS[extension], extension };
  }
  return { supported: false, searchable: false, kind: 'unknown', format: 'unknown', extension };
}

function lineAndColumn(content, offset) {
  const before = String(content || '').slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].replace(/\r$/, '').length + 1 };
}

function slugify(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function extractFrontmatter(content) {
  const match = String(content || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { values: {}, bodyOffset: 0 };
  const values = {};
  const lines = match[1].split(/\r?\n/);
  let listKey = null;
  for (const rawLine of lines) {
    const listItem = rawLine.match(/^\s*-\s+(.+)$/);
    if (listKey && listItem) {
      if (!Array.isArray(values[listKey])) values[listKey] = [];
      values[listKey].push(listItem[1].trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    const field = rawLine.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!field) {
      listKey = null;
      continue;
    }
    const key = field[1];
    const rawValue = field[2].trim();
    listKey = rawValue ? null : key;
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      values[key] = rawValue.slice(1, -1).split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else {
      values[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
  return { values, bodyOffset: match[0].length };
}

function addMatches(content, regex, create) {
  const result = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    result.push(create(match));
    if (match[0] === '') regex.lastIndex += 1;
  }
  return result;
}

function extractTextMetadata(content, classification) {
  const frontmatter = classification.format === 'markdown' ? extractFrontmatter(content) : { values: {} };
  const headings = classification.format === 'markdown'
    ? addMatches(content, /^(#{1,6})\s+(.+)$/gm, match => ({
      text: match[2].trim(),
      level: match[1].length,
      slug: slugify(match[2]),
      ...lineAndColumn(content, match.index)
    }))
    : [];
  const tags = new Set();
  const frontmatterTags = frontmatter.values.tags;
  (Array.isArray(frontmatterTags) ? frontmatterTags : frontmatterTags ? [frontmatterTags] : [])
    .forEach(tag => tags.add(String(tag).replace(/^#/, '').trim()));
  if (classification.format === 'markdown') {
    addMatches(content, /(^|[\s(])#([\p{L}\p{N}_/-]+)/gmu, match => {
      tags.add(match[2]);
      return null;
    });
  }
  const citations = classification.format === 'bibtex'
    ? []
    : unique(addMatches(content, /(^|[\s[(;,])@([A-Za-z0-9][\w:.-]*)/gm, match => match[2]));
  const definedCitations = classification.format === 'bibtex'
    ? unique(addMatches(content, /@[A-Za-z]+\s*[{(]\s*([^,\s]+)/g, match => match[1]))
    : [];
  const links = [];
  if (classification.format === 'markdown' || classification.format === 'text') {
    links.push(...addMatches(content, /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, match => ({
      kind: 'wiki',
      target: match[1].trim(),
      display: (match[2] || match[1]).trim(),
      raw: match[0],
      offset: match.index + 2,
      length: match[1].length,
      ...lineAndColumn(content, match.index)
    })));
    links.push(...addMatches(content, /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+['"][^)]*)?\)/g, match => ({
      kind: match[1] ? 'image' : 'markdown',
      target: match[3].replace(/^<|>$/g, ''),
      display: match[2],
      raw: match[0],
      offset: match.index + match[0].indexOf(match[3]),
      length: match[3].length,
      ...lineAndColumn(content, match.index)
    })));
    const bibliography = frontmatter.values.bibliography;
    (Array.isArray(bibliography) ? bibliography : bibliography ? [bibliography] : []).forEach(target => {
      const index = content.indexOf(String(target));
      links.push({
        kind: 'bibliography', target: String(target), display: String(target), raw: String(target),
        offset: Math.max(0, index), length: String(target).length,
        ...lineAndColumn(content, Math.max(0, index))
      });
    });
  }
  if (classification.format === 'html') {
    links.push(...addMatches(content, /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi, match => ({
      kind: 'html', target: match[1], display: match[1], raw: match[0],
      offset: match.index + match[0].indexOf(match[1]), length: match[1].length,
      ...lineAndColumn(content, match.index)
    })));
  }
  const lines = content.split(/\r?\n/);
  const structured = {};
  if (classification.format === 'jsonl') {
    structured.recordCount = lines.filter(line => line.trim()).length;
    structured.invalidRecords = lines.filter(line => {
      if (!line.trim()) return false;
      try { return typeof JSON.parse(line) !== 'object'; } catch (_) { return true; }
    }).length;
  } else if (classification.format === 'csv' || classification.format === 'tsv') {
    structured.headers = (lines[0] || '').split(classification.format === 'tsv' ? '\t' : ',').map(value => value.trim());
    structured.recordCount = Math.max(0, lines.filter(line => line.trim()).length - 1);
  }
  return {
    title: String(frontmatter.values.title || headings[0]?.text || '').trim() || null,
    metadata: { ...frontmatter.values },
    tags: [...tags].filter(Boolean).sort(),
    citations,
    definedCitations,
    headings,
    links,
    structured
  };
}

function globToRegExp(pattern) {
  const escaped = String(pattern || '').replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function publicEntry(entry, options = {}) {
  const result = {
    id: entry.id,
    path: entry.path,
    root: entry.root,
    relativePath: entry.relativePath,
    name: entry.name,
    stem: entry.stem,
    extension: entry.extension,
    kind: entry.kind,
    format: entry.format,
    searchable: entry.searchable,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    title: entry.title,
    metadata: { ...entry.metadata },
    tags: [...entry.tags],
    citations: [...entry.citations],
    definedCitations: [...entry.definedCitations],
    headings: entry.headings.map(heading => ({ ...heading })),
    structured: { ...entry.structured },
    linkCount: entry.links.length,
    unresolvedLinkCount: entry.links.filter(link => !link.external && !link.targetId).length
  };
  if (options.includeLinks) result.links = entry.links.map(link => ({ ...link }));
  return result;
}

class WorkspaceIndex {
  constructor(options = {}) {
    this.fs = options.fs || fs;
    this.path = options.path || path;
    this.now = options.now || (() => Date.now());
    this.yieldControl = options.yieldControl || (() => new Promise(resolve => setImmediate(resolve)));
    this.maxContentBytes = options.maxContentBytes || DEFAULT_MAX_CONTENT_BYTES;
    this.maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
    this.yieldEvery = options.yieldEvery || DEFAULT_YIELD_EVERY;
    this.ignoredDirectories = new Set(options.ignoredDirectories || IGNORED_DIRECTORIES);
    this.roots = [];
    this.entries = new Map();
    this.dirty = true;
    this.dirtyReason = 'initial';
    this.activeGeneration = 0;
    this.cancelledGeneration = 0;
    this.refreshPromise = null;
    this.lastStatus = {
      state: 'idle', rootCount: 0, discovered: 0, processed: 0, indexed: 0,
      reused: 0, parsed: 0, skippedLarge: 0, ignored: 0, bytesRead: 0,
      durationMs: 0, lastCompletedAt: null, dirty: true,
      budget: this.getBudget()
    };
  }

  getBudget() {
    return {
      maxFiles: this.maxFiles,
      maxContentBytes: this.maxContentBytes,
      yieldEvery: this.yieldEvery
    };
  }

  setRoots(roots = []) {
    const normalized = unique(roots.map(root => this.path.resolve(String(root || ''))))
      .sort((left, right) => left.length - right.length || left.localeCompare(right))
      .filter((root, index, all) => !all.slice(0, index).some(parent => isInside(parent, root)));
    if (JSON.stringify(normalized) !== JSON.stringify(this.roots)) {
      this.roots = normalized;
      this.invalidate('roots-changed');
    }
    return [...this.roots];
  }

  invalidate(reason = 'filesystem-change') {
    this.dirty = true;
    this.dirtyReason = reason;
    this.lastStatus = { ...this.lastStatus, dirty: true, dirtyReason: reason };
  }

  cancel() {
    if (!this.refreshPromise) return false;
    this.cancelledGeneration = this.activeGeneration;
    return true;
  }

  getStatus() {
    return { ...this.lastStatus, budget: { ...this.lastStatus.budget } };
  }

  isIgnoredDirectory(name) {
    return this.ignoredDirectories.has(name) || (name.startsWith('.') && name !== '.nightowl');
  }

  async discoverFiles(onProgress, generation) {
    const discovered = [];
    let ignored = 0;
    const visit = async (root, directory) => {
      if (generation === this.cancelledGeneration) return;
      let children;
      try {
        children = await this.fs.readdir(directory, { withFileTypes: true });
      } catch (_) {
        ignored += 1;
        return;
      }
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        if (generation === this.cancelledGeneration || discovered.length >= this.maxFiles) return;
        const filePath = this.path.join(directory, child.name);
        if (child.isDirectory()) {
          if (this.isIgnoredDirectory(child.name)) ignored += 1;
          else await visit(root, filePath);
        } else if (child.isFile()) {
          const classification = classifyFile(filePath);
          if (classification.supported) discovered.push({ root, filePath, classification });
        }
      }
      onProgress?.({ phase: 'discovering', discovered: discovered.length, ignored });
    };
    for (const root of this.roots) await visit(root, root);
    return { discovered, ignored };
  }

  async refresh(options = {}) {
    if (this.refreshPromise) return this.refreshPromise;
    const generation = ++this.activeGeneration;
    const start = this.now();
    const onProgress = options.onProgress;
    this.lastStatus = {
      ...this.lastStatus,
      state: 'building',
      rootCount: this.roots.length,
      processed: 0,
      dirty: true,
      dirtyReason: this.dirtyReason,
      budget: this.getBudget()
    };
    this.refreshPromise = (async () => {
      const discovery = await this.discoverFiles(onProgress, generation);
      if (generation === this.cancelledGeneration) {
        const cancelled = this.finishCancelled(start, discovery.discovered.length);
        onProgress?.({ phase: 'cancelled', ...cancelled.status });
        return cancelled;
      }
      const nextEntries = new Map();
      const metrics = {
        discovered: discovery.discovered.length,
        processed: 0,
        indexed: 0,
        reused: 0,
        parsed: 0,
        skippedLarge: 0,
        ignored: discovery.ignored,
        bytesRead: 0
      };
      for (const candidate of discovery.discovered) {
        if (generation === this.cancelledGeneration) {
          const cancelled = this.finishCancelled(start, metrics.discovered, metrics);
          onProgress?.({ phase: 'cancelled', ...cancelled.status });
          return cancelled;
        }
        try {
          const stat = await this.fs.stat(candidate.filePath);
          const old = this.entries.get(candidate.filePath);
          if (old && old.mtimeMs === stat.mtimeMs && old.size === stat.size && old.extractionVersion === EXTRACTION_VERSION) {
            nextEntries.set(candidate.filePath, old);
            metrics.reused += 1;
          } else {
            const entry = await this.buildEntry(candidate, stat, metrics);
            nextEntries.set(candidate.filePath, entry);
            metrics.parsed += entry.searchable && !entry.skippedContent ? 1 : 0;
          }
          metrics.indexed += 1;
        } catch (_) {
          metrics.ignored += 1;
        }
        metrics.processed += 1;
        if (metrics.processed % this.yieldEvery === 0) {
          onProgress?.({ phase: 'extracting', ...metrics });
          await this.yieldControl();
        }
      }
      this.resolveLinks(nextEntries);
      this.entries = nextEntries;
      this.dirty = false;
      this.dirtyReason = null;
      this.lastStatus = {
        state: 'ready', rootCount: this.roots.length, ...metrics,
        durationMs: Math.max(0, this.now() - start),
        lastCompletedAt: new Date(this.now()).toISOString(),
        dirty: false,
        truncated: discovery.discovered.length >= this.maxFiles,
        budget: this.getBudget()
      };
      onProgress?.({ phase: 'complete', ...this.lastStatus });
      return { success: true, cancelled: false, status: this.getStatus() };
    })().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  finishCancelled(start, discovered, metrics = {}) {
    this.dirty = true;
    this.lastStatus = {
      ...this.lastStatus,
      ...metrics,
      state: 'cancelled',
      discovered,
      durationMs: Math.max(0, this.now() - start),
      dirty: true,
      budget: this.getBudget()
    };
    return { success: false, cancelled: true, status: this.getStatus() };
  }

  async buildEntry(candidate, stat, metrics) {
    const relativePath = normalizeSlashes(this.path.relative(candidate.root, candidate.filePath));
    const parsedPath = this.path.parse(candidate.filePath);
    let content = '';
    let metadata = { title: null, metadata: {}, tags: [], citations: [], definedCitations: [], headings: [], links: [], structured: {} };
    let skippedContent = false;
    if (candidate.classification.searchable) {
      if (stat.size > this.maxContentBytes) {
        metrics.skippedLarge += 1;
        skippedContent = true;
      } else {
        content = await this.fs.readFile(candidate.filePath, 'utf8');
        metrics.bytesRead += Buffer.byteLength(content);
        metadata = extractTextMetadata(content, candidate.classification);
      }
    }
    const entry = {
      id: candidate.filePath,
      path: candidate.filePath,
      root: candidate.root,
      relativePath,
      name: parsedPath.base,
      stem: parsedPath.name,
      extension: candidate.classification.extension,
      kind: candidate.classification.kind,
      format: candidate.classification.format,
      searchable: candidate.classification.searchable,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      skippedContent,
      extractionVersion: EXTRACTION_VERSION,
      ...metadata
    };
    Object.defineProperty(entry, '_content', { value: content, writable: false, enumerable: false });
    return entry;
  }

  aliasesFor(entry) {
    const relative = normalizeSlashes(entry.relativePath);
    const withoutExtension = relative.slice(0, relative.length - entry.extension.length);
    return unique([
      normalizeSlashes(entry.path), relative, entry.name, entry.stem,
      withoutExtension,
      entry.format === 'markdown' ? withoutExtension.replace(/\.(?:md|markdown)$/i, '') : null
    ]).map(alias => alias.toLowerCase());
  }

  resolveLinks(entries = this.entries) {
    const aliases = new Map();
    for (const entry of entries.values()) {
      for (const alias of this.aliasesFor(entry)) {
        if (!aliases.has(alias)) aliases.set(alias, new Set());
        aliases.get(alias).add(entry.path);
      }
    }
    for (const entry of entries.values()) {
      entry.links = entry.links.map(link => ({ ...link, ...this.resolveTarget(entry, link.target, entries, aliases) }));
    }
  }

  resolveTarget(sourceEntry, rawTarget, entries = this.entries, aliases = null) {
    const target = String(rawTarget || '').trim();
    if (!target || target.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) {
      return { external: true, targetId: null, resolvedPath: null, fragment: target.startsWith('#') ? target.slice(1) : null };
    }
    let decoded = target;
    try { decoded = decodeURIComponent(target); } catch (_) { /* retain raw target */ }
    const fragmentIndex = decoded.indexOf('#');
    const fragment = fragmentIndex >= 0 ? decoded.slice(fragmentIndex + 1) : null;
    const fileTarget = (fragmentIndex >= 0 ? decoded.slice(0, fragmentIndex) : decoded).split('?')[0];
    const candidates = new Set();
    const addIfPresent = candidate => {
      const resolved = this.path.resolve(candidate);
      if (entries.has(resolved)) candidates.add(resolved);
    };
    if (this.path.isAbsolute(fileTarget)) addIfPresent(fileTarget);
    else {
      const sourceRelative = this.path.resolve(this.path.dirname(sourceEntry.path), fileTarget);
      addIfPresent(sourceRelative);
      if (!extensionFor(sourceRelative)) INTERNAL_LINK_EXTENSIONS.forEach(extension => addIfPresent(`${sourceRelative}${extension}`));
      for (const root of this.roots) {
        const rooted = this.path.resolve(root, fileTarget);
        addIfPresent(rooted);
        if (!extensionFor(rooted)) INTERNAL_LINK_EXTENSIONS.forEach(extension => addIfPresent(`${rooted}${extension}`));
      }
    }
    const aliasIndex = aliases || (() => {
      const result = new Map();
      for (const entry of entries.values()) {
        for (const alias of this.aliasesFor(entry)) {
          if (!result.has(alias)) result.set(alias, new Set());
          result.get(alias).add(entry.path);
        }
      }
      return result;
    })();
    const aliasKeys = unique([
      normalizeSlashes(fileTarget),
      normalizeSlashes(fileTarget).replace(/\.(?:md|markdown)$/i, ''),
      this.path.basename(fileTarget),
      this.path.basename(fileTarget, extensionFor(fileTarget))
    ]).map(value => value.toLowerCase());
    aliasKeys.forEach(alias => aliasIndex.get(alias)?.forEach(candidate => candidates.add(candidate)));
    if (candidates.size === 1) {
      const resolvedPath = [...candidates][0];
      return { external: false, targetId: resolvedPath, resolvedPath, fragment, ambiguous: false };
    }
    return {
      external: false,
      targetId: null,
      resolvedPath: null,
      fragment,
      ambiguous: candidates.size > 1,
      candidates: candidates.size > 1 ? [...candidates].sort() : []
    };
  }

  async ensureFresh(options = {}) {
    if (this.dirty || options.force) await this.refresh(options);
    return this.getStatus();
  }

  async list(options = {}) {
    await this.ensureFresh(options);
    const query = String(options.query || '').trim().toLowerCase();
    const extensions = options.extensions?.length ? new Set(options.extensions.map(value => String(value).toLowerCase())) : null;
    const formats = options.formats?.length ? new Set(options.formats.map(String)) : null;
    const limit = Math.max(1, Math.min(Number(options.limit) || 5000, 50000));
    const files = [...this.entries.values()]
      .filter(entry => !extensions || extensions.has(entry.extension))
      .filter(entry => !formats || formats.has(entry.format))
      .filter(entry => !query || `${entry.name}\n${entry.relativePath}\n${entry.title || ''}`.toLowerCase().includes(query))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
      .slice(0, limit)
      .map(entry => publicEntry(entry));
    return { success: true, files, total: this.entries.size, status: this.getStatus() };
  }

  async search(query, options = {}) {
    await this.ensureFresh(options);
    const text = String(query || '');
    if (!text) return { success: false, error: 'Search query is required', results: [] };
    const flags = options.caseSensitive ? 'gm' : 'gim';
    let expression;
    try {
      const source = options.useRegex
        ? text
        : `${options.wholeWord ? '\\b' : ''}${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${options.wholeWord ? '\\b' : ''}`;
      expression = new RegExp(source, flags);
    } catch (error) {
      return { success: false, error: `Invalid regex pattern: ${error.message}`, results: [] };
    }
    const maxResults = Math.max(1, Math.min(Number(options.maxResults) || 500, 5000));
    const filePattern = options.filePattern && options.filePattern !== '*.{md,markdown,txt}'
      ? globToRegExp(options.filePattern)
      : null;
    const paths = options.paths?.length ? new Set(options.paths.map(item => this.path.resolve(item))) : null;
    const results = [];
    for (const entry of this.entries.values()) {
      if (!entry.searchable || entry.skippedContent || (paths && !paths.has(entry.path))) continue;
      if (filePattern && !filePattern.test(entry.name) && !filePattern.test(entry.relativePath)) continue;
      const lines = entry._content.split('\n');
      for (let lineIndex = 0; lineIndex < lines.length && results.length < maxResults; lineIndex += 1) {
        expression.lastIndex = 0;
        for (const match of lines[lineIndex].matchAll(expression)) {
          results.push({
            file: entry.path,
            fileName: entry.name,
            relativePath: entry.relativePath,
            sourceFolder: entry.root,
            line: lineIndex + 1,
            column: match.index + 1,
            text: lines[lineIndex].trim(),
            match: match[0],
            preview: lines.slice(Math.max(0, lineIndex - 2), lineIndex + 3).map((line, index) => ({
              line: Math.max(0, lineIndex - 2) + index + 1,
              text: line,
              isMatch: Math.max(0, lineIndex - 2) + index === lineIndex
            }))
          });
          if (results.length >= maxResults) break;
        }
      }
      if (results.length >= maxResults) break;
    }
    return { success: true, results, status: this.getStatus() };
  }

  async getLinks(options = {}) {
    await this.ensureFresh(options);
    const filePath = options.filePath ? this.path.resolve(options.filePath) : null;
    const entry = filePath ? this.entries.get(filePath) : null;
    if (filePath && !entry) return { success: false, error: 'File is not indexed' };
    const outgoing = entry ? entry.links.map(link => ({ ...link })) : [];
    const backlinks = [];
    const unresolved = [];
    for (const source of this.entries.values()) {
      source.links.forEach(link => {
        if (filePath && link.resolvedPath === filePath) {
          backlinks.push({ sourceId: source.id, sourcePath: source.path, sourceRelativePath: source.relativePath, ...link });
        }
        if (!link.external && !link.targetId) {
          unresolved.push({ sourceId: source.id, sourcePath: source.path, sourceRelativePath: source.relativePath, ...link });
        }
      });
    }
    return { success: true, file: entry ? publicEntry(entry) : null, outgoing, backlinks, unresolved };
  }

  async resolveLink(sourcePath, target, options = {}) {
    await this.ensureFresh(options);
    const source = sourcePath ? this.entries.get(this.path.resolve(sourcePath)) : null;
    const fallback = source || [...this.entries.values()][0];
    if (!fallback) return { success: false, error: 'Workspace index is empty' };
    const resolution = this.resolveTarget(fallback, target);
    return { success: Boolean(resolution.resolvedPath), target, ...resolution };
  }

  async planRename(filePath, newPath, options = {}) {
    await this.ensureFresh(options);
    const oldResolved = this.path.resolve(filePath);
    const newResolved = this.path.resolve(newPath);
    if (!this.entries.has(oldResolved)) return { success: false, error: 'File is not indexed', references: [] };
    const references = [];
    for (const source of this.entries.values()) {
      for (const link of source.links) {
        if (link.resolvedPath !== oldResolved) continue;
        let replacement = normalizeSlashes(this.path.relative(this.path.dirname(source.path), newResolved));
        if (!replacement.startsWith('.')) replacement = `./${replacement}`;
        const oldFileTarget = link.target.split('#')[0];
        if (!extensionFor(oldFileTarget) && ['.md', '.markdown'].includes(extensionFor(newResolved))) {
          replacement = replacement.replace(/\.(?:md|markdown)$/i, '');
        }
        if (link.fragment) replacement += `#${link.fragment}`;
        references.push({
          sourceId: source.id,
          sourcePath: source.path,
          sourceRelativePath: source.relativePath,
          kind: link.kind,
          line: link.line,
          column: link.column,
          originalTarget: link.target,
          replacement,
          offset: link.offset,
          length: link.length
        });
      }
    }
    references.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath) || left.line - right.line);
    return {
      success: true,
      oldPath: oldResolved,
      newPath: newResolved,
      affectedFiles: new Set(references.map(reference => reference.sourcePath)).size,
      referenceCount: references.length,
      references
    };
  }

  async graph(options = {}) {
    await this.ensureFresh(options);
    const included = options.paths?.length
      ? new Set(options.paths.map(item => this.path.resolve(item)))
      : new Set(this.entries.keys());
    const nodes = [];
    const edges = [];
    const nodeIds = new Set();
    const addNode = node => {
      if (nodeIds.has(node.id)) return;
      nodeIds.add(node.id);
      nodes.push(node);
    };
    for (const entry of this.entries.values()) {
      if (!included.has(entry.path)) continue;
      const fileId = `file:${entry.id}`;
      addNode({ id: fileId, identity: entry.id, name: entry.title || entry.stem, type: 'file', filePath: entry.path, format: entry.format });
      entry.headings.forEach(heading => {
        const id = `heading:${entry.id}:${heading.slug}`;
        addNode({ id, identity: `${entry.id}#${heading.slug}`, name: heading.text, type: 'heading', level: heading.level, filePath: entry.path });
        edges.push({ source: fileId, target: id, type: 'contains' });
      });
      entry.tags.forEach(tag => {
        const id = `tag:${tag}`;
        addNode({ id, identity: id, name: `#${tag}`, type: 'tag' });
        edges.push({ source: fileId, target: id, type: 'tag' });
      });
      entry.citations.forEach(key => {
        const id = `citation:${key}`;
        addNode({ id, identity: id, name: `@${key}`, type: 'citation' });
        edges.push({ source: fileId, target: id, type: 'citation' });
      });
      entry.definedCitations.forEach(key => {
        const id = `citation:${key}`;
        addNode({ id, identity: id, name: `@${key}`, type: 'citation' });
        edges.push({ source: fileId, target: id, type: 'defines-citation' });
      });
      entry.links.forEach(link => {
        if (link.resolvedPath && included.has(link.resolvedPath)) {
          edges.push({ source: fileId, target: `file:${link.resolvedPath}`, type: 'reference' });
        }
      });
    }
    return {
      success: true,
      nodes,
      edges,
      unresolved: (await this.getLinks()).unresolved.filter(link => included.has(link.sourcePath)),
      status: this.getStatus()
    };
  }
}

module.exports = {
  BINARY_FORMATS,
  DEFAULT_MAX_CONTENT_BYTES,
  DEFAULT_MAX_FILES,
  IGNORED_DIRECTORIES,
  TEXT_FORMATS,
  WorkspaceIndex,
  classifyFile,
  extractFrontmatter,
  extractTextMetadata,
  globToRegExp,
  isInside,
  normalizeSlashes,
  publicEntry,
  slugify
};
