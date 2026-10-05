'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { resolvePathWithinRoots } = require('../ipc/pathGuards');

const SCHEMA_VERSION = 1;
const MAX_RECORDS = 10000;

function requirePdfPath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('PDF file path is required');
  }
  const resolved = path.resolve(filePath);
  if (path.extname(resolved).toLowerCase() !== '.pdf') {
    throw new TypeError('PDF research operations require a .pdf file');
  }
  return resolved;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedText(value, maximum = 200000) {
  return String(value == null ? '' : value).slice(0, maximum);
}

function pageNumber(value) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

function stableRecordId(kind, value, index = 0) {
  const digest = crypto.createHash('sha256')
    .update(`${kind}:${index}:${JSON.stringify(value)}`)
    .digest('hex')
    .slice(0, 20);
  return `${kind}-${digest}`;
}

function normalizeBounds(bounds = {}) {
  const left = finiteNumber(bounds.left);
  const top = finiteNumber(bounds.top);
  return {
    left,
    top,
    right: finiteNumber(bounds.right, left),
    bottom: finiteNumber(bounds.bottom, top)
  };
}

function normalizeHighlight(value = {}, index = 0) {
  return {
    id: boundedText(value.id || stableRecordId('highlight', value, index), 120),
    pageNumber: pageNumber(value.pageNumber || value.page),
    bounds: normalizeBounds(value.bounds),
    text: boundedText(value.text),
    type: value.type === 'annotation' ? 'annotation' : 'highlight',
    annotationId: value.annotationId ? boundedText(value.annotationId, 120) : null,
    timestamp: boundedText(value.timestamp || new Date().toISOString(), 80)
  };
}

function normalizeCitation(value) {
  if (!value || typeof value !== 'object') return null;
  const id = Number.isInteger(value.id) ? value.id : null;
  const key = boundedText(value.citation_key || value.citationKey, 240).trim();
  const title = boundedText(value.title || value.citationTitle, 2000).trim();
  if (id == null && !key && !title) return null;
  return { id, key: key || null, title: title || null };
}

function normalizeAnnotation(value = {}, index = 0) {
  const citation = normalizeCitation(value.citation || {
    id: value.citationId,
    citationKey: value.citationKey,
    citationTitle: value.citationTitle
  });
  return {
    id: boundedText(value.id || stableRecordId('annotation', value, index), 120),
    pageNumber: pageNumber(value.pageNumber || value.page),
    text: boundedText(value.text || value.selectedText),
    annotation: boundedText(value.annotation, 200000),
    timestamp: boundedText(value.timestamp || new Date().toISOString(), 80),
    x: finiteNumber(value.x ?? value.bounds?.left),
    y: finiteNumber(value.y ?? value.bounds?.top),
    width: finiteNumber(value.width, finiteNumber(value.bounds?.right) - finiteNumber(value.bounds?.left)),
    height: finiteNumber(value.height, finiteNumber(value.bounds?.bottom) - finiteNumber(value.bounds?.top)),
    citationId: citation?.id ?? null,
    citationKey: citation?.key ?? null,
    citationTitle: citation?.title ?? null,
    notePath: value.notePath ? boundedText(value.notePath, 32768) : null
  };
}

function normalizeRecords(values, normalizer, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  if (values.length > MAX_RECORDS) throw new RangeError(`${label} exceeds ${MAX_RECORDS} records`);
  return values.map((value, index) => normalizer(value, index));
}

function groupByPage(highlights, annotations) {
  const pages = {};
  const ensurePage = (number) => {
    const key = String(number);
    if (!pages[key]) pages[key] = { highlights: [], annotations: [] };
    return pages[key];
  };
  highlights.forEach((highlight) => ensurePage(highlight.pageNumber).highlights.push(highlight));
  annotations.forEach((annotation) => ensurePage(annotation.pageNumber).annotations.push(annotation));
  return pages;
}

function flattenPages(pages = {}) {
  const highlights = [];
  const annotations = [];
  Object.keys(pages)
    .sort((left, right) => Number(left) - Number(right))
    .forEach((key) => {
      const page = pages[key] || {};
      if (Array.isArray(page.highlights)) highlights.push(...page.highlights);
      if (Array.isArray(page.annotations)) annotations.push(...page.annotations);
    });
  return { highlights, annotations };
}

function hashFile(filePath, createReadStream = fs.createReadStream) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function yamlString(value) {
  return JSON.stringify(String(value == null ? '' : value));
}

function markdownQuote(value) {
  return boundedText(value).split(/\r?\n/).map(line => `> ${line}`).join('\n');
}

function slugify(value) {
  return String(value || 'pdf')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'pdf';
}

function buildResearchNote({ document, annotation, citation }) {
  const page = pageNumber(annotation.pageNumber);
  const citationKey = citation?.key || annotation.citationKey || '';
  const citationId = citation?.id ?? annotation.citationId ?? '';
  const citationTitle = citation?.title || annotation.citationTitle || '';
  const sourceUrl = `${pathToFileURL(document.filePath).href}#page=${page}`;
  const citationLine = citationKey
    ? `Citation: [@${citationKey}]`
    : (citationTitle ? `Citation: ${citationTitle}` : 'Citation: Not linked');

  return `---
type: pdf-research-note
source_document: ${yamlString(path.basename(document.filePath))}
source_path: ${yamlString(document.filePath)}
source_document_id: ${yamlString(document.documentId)}
source_page: ${page}
annotation_id: ${yamlString(annotation.id)}
citation_id: ${yamlString(citationId)}
citation_key: ${yamlString(citationKey)}
created: ${yamlString(annotation.timestamp)}
---

# ${path.basename(document.filePath, path.extname(document.filePath))}, page ${page}

## Quotation

${markdownQuote(annotation.text)}

## Research note

${annotation.annotation || '_No annotation text._'}

## Provenance

- Source: [${path.basename(document.filePath)}, page ${page}](<${sourceUrl}>)
- Document identity: \`${document.documentId}\`
- ${citationLine}
`;
}

function createPdfResearchService(options = {}) {
  const userDataPath = path.resolve(options.userDataPath || process.cwd());
  const fsPromises = options.fsPromises || fs.promises;
  const createReadStream = options.createReadStream || fs.createReadStream;
  const storageDirectory = path.join(userDataPath, 'pdf-research', 'documents');
  const identityCache = new Map();

  async function identifyDocument(inputPath) {
    const filePath = requirePdfPath(inputPath);
    const stat = await fsPromises.stat(filePath);
    if (!stat.isFile()) throw new TypeError('PDF research source must be a file');
    const cached = identityCache.get(filePath);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      return { ...cached, filePath };
    }
    const digest = await hashFile(filePath, createReadStream);
    const document = {
      documentId: `sha256:${digest}`,
      digest,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      filePath
    };
    identityCache.set(filePath, document);
    return document;
  }

  function recordPath(document) {
    return path.join(storageDirectory, `${document.digest}.json`);
  }

  async function readRecord(document) {
    try {
      const content = await fsPromises.readFile(recordPath(document), 'utf8');
      const parsed = JSON.parse(content);
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || parsed.documentId !== document.documentId) {
        throw new Error('Stored PDF annotation record has an unsupported schema or identity');
      }
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function writeRecord(document, record) {
    await fsPromises.mkdir(storageDirectory, { recursive: true });
    const destination = recordPath(document);
    const temporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      await fsPromises.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      await fsPromises.rename(temporary, destination);
    } catch (error) {
      await fsPromises.unlink(temporary).catch(() => {});
      throw error;
    }
  }

  function recordSource(document, existing = null) {
    const aliases = new Set(existing?.source?.aliases || []);
    aliases.add(document.filePath);
    return {
      fileName: path.basename(document.filePath),
      lastKnownPath: document.filePath,
      aliases: [...aliases].sort()
    };
  }

  async function loadAnnotations(inputPath) {
    const document = await identifyDocument(inputPath);
    const record = await readRecord(document);
    if (!record) {
      return {
        success: true,
        found: false,
        documentId: document.documentId,
        filePath: document.filePath,
        highlights: [],
        annotations: []
      };
    }
    const source = recordSource(document, record);
    const existingAliases = Array.isArray(record.source?.aliases) ? record.source.aliases : [];
    const aliasesChanged = source.aliases.length !== existingAliases.length ||
      source.aliases.some(alias => !existingAliases.includes(alias));
    if (source.lastKnownPath !== record.source?.lastKnownPath || aliasesChanged) {
      record.source = source;
      record.updatedAt = new Date().toISOString();
      await writeRecord(document, record);
    }
    return {
      success: true,
      found: true,
      documentId: document.documentId,
      filePath: document.filePath,
      ...flattenPages(record.pages),
      source
    };
  }

  async function saveAnnotations(payload = {}) {
    const document = await identifyDocument(payload.filePath);
    const existing = await readRecord(document);
    const highlights = normalizeRecords(payload.highlights || [], normalizeHighlight, 'highlights');
    const annotations = normalizeRecords(payload.annotations || [], normalizeAnnotation, 'annotations');
    const now = new Date().toISOString();
    const record = {
      schemaVersion: SCHEMA_VERSION,
      documentId: document.documentId,
      source: recordSource(document, existing),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      pages: groupByPage(highlights, annotations)
    };
    await writeRecord(document, record);
    return {
      success: true,
      documentId: document.documentId,
      filePath: document.filePath,
      pageCount: Object.keys(record.pages).length,
      highlightCount: highlights.length,
      annotationCount: annotations.length
    };
  }

  async function createResearchNote(workspaceRoot, payload = {}) {
    const root = path.resolve(workspaceRoot || '');
    const document = await identifyDocument(payload.filePath);
    const annotation = normalizeAnnotation(payload.annotation || {});
    const citation = normalizeCitation(payload.citation || annotation);
    const annotationSlug = slugify(annotation.id).slice(-12) || stableRecordId('note', annotation).slice(-12);
    const sourceStem = path.basename(document.filePath, path.extname(document.filePath));
    const defaultName = `${slugify(sourceStem)}-p${annotation.pageNumber}-${annotationSlug}.md`;
    const requestedPath = payload.destinationPath || path.join('research-notes', defaultName);
    const resolved = resolvePathWithinRoots(requestedPath, [root], {
      label: 'Research note path',
      baseDirectory: root
    });
    if (!resolved.success) throw new Error(resolved.error);
    const content = buildResearchNote({ document, annotation, citation });
    await fsPromises.mkdir(path.dirname(resolved.path), { recursive: true });
    await fsPromises.writeFile(resolved.path, content, 'utf8');
    return {
      success: true,
      filePath: resolved.path,
      documentId: document.documentId,
      content
    };
  }

  return {
    createResearchNote,
    identifyDocument,
    loadAnnotations,
    saveAnnotations,
    storageDirectory
  };
}

module.exports = {
  MAX_RECORDS,
  SCHEMA_VERSION,
  buildResearchNote,
  createPdfResearchService,
  flattenPages,
  groupByPage,
  normalizeAnnotation,
  normalizeHighlight,
  requirePdfPath
};
