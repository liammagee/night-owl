'use strict';

const crypto = require('crypto');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');
const cheerio = require('cheerio');

const RENDER_CONTRACT = 'nightowl-trusted-markdown-v1';
const MANIFEST_FILE = 'nightowl-publication.json';
const MAX_PAGES = 2000;
const FORBIDDEN_TAGS = 'script,style,object,embed,link,meta,base,form,input,button,textarea,select,option,audio,video,source,track';
const SAFE_IFRAME_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com'
]);

function posix(value) {
  return String(value || '').replace(/\\/g, '/');
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeSlug(value, fallback = 'page') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || fallback;
}

function routeForSource(sourceRelative) {
  const parsed = path.posix.parse(posix(sourceRelative));
  const directory = parsed.dir
    .split('/')
    .filter(Boolean)
    .map(segment => safeSlug(segment, 'section'))
    .join('/');
  const base = /^index$/i.test(parsed.name) ? 'index' : safeSlug(parsed.name);
  return [directory, `${base}.html`].filter(Boolean).join('/');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeDecode(value) {
  try { return decodeURIComponent(String(value || '')); } catch (_error) { return String(value || ''); }
}

function splitTarget(value) {
  const raw = safeDecode(value).trim();
  const hashAt = raw.indexOf('#');
  return {
    target: (hashAt >= 0 ? raw.slice(0, hashAt) : raw).split('?')[0],
    fragment: hashAt >= 0 ? raw.slice(hashAt + 1) : ''
  };
}

function relativeUrl(fromOutput, targetOutput) {
  const result = path.posix.relative(path.posix.dirname(fromOutput), targetOutput);
  return result || path.posix.basename(targetOutput);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object' || !profile.id) return null;
  const repository = profile.contentRepository && typeof profile.contentRepository === 'object'
    ? profile.contentRepository
    : null;
  return {
    id: String(profile.id).slice(0, 120),
    title: String(profile.title || profile.id).slice(0, 240),
    contentRepository: repository ? {
      remote: repository.remote ? String(repository.remote).slice(0, 500) : null,
      revision: repository.revision ? String(repository.revision).slice(0, 128) : null
    } : null
  };
}

function isExternalUrl(value) {
  return /^(?:https?:|mailto:)/i.test(String(value || '').trim());
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(String(value));
    return ['https:', 'http:', 'mailto:'].includes(url.protocol.toLowerCase());
  } catch (_error) {
    return false;
  }
}

function isSafeIframeUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return SAFE_IFRAME_HOSTS.has(host) || host === 'zoom.us' || host.endsWith('.zoom.us');
  } catch (_error) {
    return false;
  }
}

function pageTitle($, fallback) {
  const title = $('h1').first().text().trim();
  return title || fallback;
}

function buildStylesheet() {
  return `*{box-sizing:border-box}html{color-scheme:light}body{margin:0;color:#1f2937;background:#f8fafc;font:16px/1.65 Georgia,'Times New Roman',serif}nav{position:sticky;top:0;z-index:2;display:flex;gap:20px;align-items:center;padding:12px 22px;color:#fff;background:#172033}nav a{color:#dbeafe;text-decoration:none}nav a[aria-current="page"]{color:#fff;text-decoration:underline;text-underline-offset:4px}.site-title{font-weight:700}.nav-links{display:flex;flex-wrap:wrap;gap:12px;font:13px/1.4 system-ui,sans-serif}main{max-width:880px;margin:36px auto;padding:0 22px}article{padding:34px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 2px 8px rgba(15,23,42,.06)}h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.25em 0 .55em}h1{border-bottom:1px solid #e5e7eb;padding-bottom:8px}a{color:#1d4ed8}img{max-width:100%;height:auto}figure{margin:20px 0;text-align:center}figcaption{color:#64748b;font:13px/1.4 system-ui,sans-serif}pre{overflow:auto;padding:16px;border-radius:7px;background:#f1f5f9}code{font-family:'SFMono-Regular',Consolas,monospace;font-size:.9em}blockquote{margin:18px 0;padding:8px 18px;border-left:4px solid #94a3b8;color:#475569;background:#f8fafc}table{width:100%;border-collapse:collapse}th,td{padding:7px 9px;border:1px solid #d1d5db;text-align:left}.page-list{padding:0;list-style:none}.page-list li{padding:9px 0;border-bottom:1px solid #e5e7eb}footer{padding:24px;text-align:center;color:#64748b;font:12px/1.4 system-ui,sans-serif}`;
}

function buildDocument({ title, siteTitle, content, output, pages, offline = false }) {
  const stylesheet = relativeUrl(output, 'style.css');
  const nav = pages.map(page => {
    const href = relativeUrl(output, page.output);
    const current = page.output === output ? ' aria-current="page"' : '';
    return `<a href="${escapeHtml(href)}"${current}>${escapeHtml(page.title)}</a>`;
  }).join('\n');
  const policy = offline
    ? "default-src 'none'; img-src data: file:; style-src 'unsafe-inline'"
    : "default-src 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-src https://youtube.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://*.zoom.us";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${policy}">
  <title>${escapeHtml(title)} - ${escapeHtml(siteTitle)}</title>
  ${offline ? `<style>${buildStylesheet()}</style>` : `<link rel="stylesheet" href="${escapeHtml(stylesheet)}">`}
</head>
<body>
  <nav aria-label="Site navigation"><a class="site-title" href="${escapeHtml(relativeUrl(output, 'index.html'))}">${escapeHtml(siteTitle)}</a><div class="nav-links">${nav}</div></nav>
  <main><article>${content}</article></main>
  <footer>Generated by NightOwl</footer>
</body>
</html>`;
}

function buildGeneratedIndex(siteTitle, pages, offline = false) {
  const list = pages.map(page => `<li><a href="${escapeHtml(page.output)}">${escapeHtml(page.title)}</a><br><small>${escapeHtml(page.source)}</small></li>`).join('\n');
  return buildDocument({
    title: siteTitle,
    siteTitle,
    content: `<h1>${escapeHtml(siteTitle)}</h1><ul class="page-list">${list}</ul>`,
    output: 'index.html',
    pages,
    offline
  });
}

function offlineContent(fragment, pageOutput, assets = []) {
  const $ = cheerio.load(fragment, null, false);
  const localAssets = new Map(assets.map(asset => [
    relativeUrl(pageOutput, asset.output),
    pathToFileURL(asset.sourcePath).href
  ]));
  $('img[src], a[href]').each((_index, element) => {
    const attribute = element.tagName === 'img' ? 'src' : 'href';
    const value = $(element).attr(attribute);
    if (localAssets.has(value)) $(element).attr(attribute, localAssets.get(value));
  });
  $('iframe').each((_index, element) => {
    const source = $(element).attr('src') || 'remote embed';
    $(element).replaceWith(`<p class="offline-embed">Remote embed omitted from offline preview: ${escapeHtml(source)}</p>`);
  });
  $('img').each((_index, element) => {
    const source = $(element).attr('src') || '';
    if (/^https?:/i.test(source)) {
      $(element).removeAttr('src').attr('data-offline-source', source);
    }
  });
  return $.root().html() || '';
}

function createStaticPublishingService(options = {}) {
  const fsImpl = options.fs || fs;
  const now = options.now || (() => new Date());

  async function exists(candidate) {
    try { await fsImpl.stat(candidate); return true; } catch (_error) { return false; }
  }

  async function buildPlan(workspaceRoot, request = {}) {
    const root = path.resolve(String(workspaceRoot || ''));
    let canonicalRoot = root;
    try { canonicalRoot = await fsImpl.realpath(root); } catch (_error) { /* report individual missing inputs below */ }
    const files = Array.isArray(request.files) ? request.files.slice(0, MAX_PAGES) : [];
    const siteTitle = String(request.options?.title || 'NightOwl publication').trim().slice(0, 240) || 'NightOwl publication';
    const profile = normalizeProfile(request.options?.profile);
    const issues = [];
    const issueKeys = new Set();
    const addIssue = (severity, code, message, source = null, target = null) => {
      const key = JSON.stringify([severity, code, source, target, message]);
      if (issueKeys.has(key)) return;
      issueKeys.add(key);
      issues.push({ severity, code, message, source, target });
    };

    if (!files.length) addIssue('error', 'no-pages', 'Select at least one Markdown page.');
    if (Array.isArray(request.files) && request.files.length > MAX_PAGES) {
      addIssue('error', 'page-limit', `A publication may contain at most ${MAX_PAGES} pages.`);
    }

    const pages = [];
    const outputs = new Map();
    for (const [index, file] of files.entries()) {
      const sourcePath = path.resolve(String(file?.sourcePath || ''));
      if (!isInside(root, sourcePath)) {
        addIssue('error', 'source-outside-workspace', 'Page source is outside the active workspace.', null, path.basename(sourcePath));
        continue;
      }
      const source = posix(path.relative(root, sourcePath));
      if (!/\.(?:md|markdown)$/i.test(source)) {
        addIssue('error', 'unsupported-page', 'Only Markdown files can become publication pages.', source);
        continue;
      }
      if (file.contract !== RENDER_CONTRACT) {
        addIssue('error', 'untrusted-render-contract', 'Page was not produced by the trusted NightOwl renderer.', source);
      }
      const output = routeForSource(source);
      if (outputs.has(output)) {
        addIssue('error', 'route-collision', `Two source pages resolve to ${output}.`, source, output);
      }
      outputs.set(output, source);
      const $ = cheerio.load(String(file.html || ''), null, false);
      const fallbackTitle = String(file.title || path.basename(source, path.extname(source))).slice(0, 240);
      pages.push({
        index,
        source,
        sourcePath,
        output,
        title: pageTitle($, fallbackTitle),
        $,
        anchors: new Set($('[id]').map((_i, element) => $(element).attr('id')).get().filter(Boolean)),
        internalLinks: [],
        externalLinks: []
      });
    }

    const bySource = new Map(pages.map(page => [page.source.toLowerCase(), page]));
    const byOutput = new Map(pages.map(page => [page.output.toLowerCase(), page]));
    const byBasename = new Map();
    pages.forEach(page => {
      const key = path.posix.basename(page.source).toLowerCase();
      if (!byBasename.has(key)) byBasename.set(key, []);
      byBasename.get(key).push(page);
    });

    function findPage(sourcePage, rawTarget, wiki = false) {
      const target = posix(rawTarget).replace(/^\.\//, '');
      if (!target) return sourcePage;
      let candidate;
      if (/^file:/i.test(target)) {
        try {
          const absolute = fileURLToPath(target);
          if (!isInside(root, absolute)) return null;
          candidate = posix(path.relative(root, absolute));
        } catch (_error) {
          return null;
        }
      } else if (target.startsWith('/')) {
        candidate = path.posix.normalize(target.replace(/^\/+/, ''));
      } else {
        candidate = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePage.source), target));
      }
      if (candidate.startsWith('../')) return null;
      const tries = [candidate];
      if (!path.posix.extname(candidate)) tries.push(`${candidate}.md`, `${candidate}.markdown`, `${candidate}/index.md`);
      if (/\.html?$/i.test(candidate)) tries.push(candidate.replace(/\.html?$/i, '.md'));
      for (const value of tries) {
        const found = bySource.get(value.toLowerCase()) || byOutput.get(value.toLowerCase());
        if (found) return found;
      }
      if (wiki) {
        const basename = path.posix.basename(candidate).toLowerCase();
        const key = /\.[a-z0-9]+$/i.test(basename) ? basename : `${basename}.md`;
        const matches = byBasename.get(key) || [];
        if (matches.length === 1) return matches[0];
      }
      return null;
    }

    const assetByPath = new Map();
    async function registerAsset(sourcePage, rawTarget, elementKind) {
      const split = splitTarget(rawTarget);
      const target = split.target;
      let absolute;
      if (/^file:/i.test(target)) {
        try { absolute = fileURLToPath(target); } catch (_error) { absolute = null; }
      } else if (target.startsWith('/')) {
        absolute = path.resolve(root, target.replace(/^\/+/, ''));
      } else {
        absolute = path.resolve(path.dirname(sourcePage.sourcePath), target);
      }
      if (!absolute || !isInside(root, absolute)) {
        addIssue('error', 'asset-outside-workspace', `${elementKind} points outside the active workspace.`, sourcePage.source, target);
        return null;
      }
      if (assetByPath.has(absolute)) return assetByPath.get(absolute);
      try {
        const canonicalAsset = await fsImpl.realpath(absolute);
        if (!isInside(canonicalRoot, canonicalAsset)) {
          addIssue('error', 'asset-symlink-outside-workspace', `${elementKind} resolves through a symlink outside the active workspace.`, sourcePage.source, target);
          return null;
        }
        if (assetByPath.has(canonicalAsset)) return assetByPath.get(canonicalAsset);
        const stat = await fsImpl.stat(canonicalAsset);
        if (!stat.isFile()) throw new Error('not a file');
        const bytes = await fsImpl.readFile(canonicalAsset);
        const digest = sha256(bytes);
        const filename = safeSlug(path.basename(absolute), 'asset');
        const output = `_assets/${digest.slice(0, 12)}-${filename}`;
        const asset = {
          source: posix(path.relative(root, absolute)),
          sourcePath: canonicalAsset,
          output,
          sha256: digest,
          bytes: stat.size
        };
        assetByPath.set(canonicalAsset, asset);
        return asset;
      } catch (_error) {
        addIssue('error', 'missing-asset', `${elementKind} target does not exist or is not a file.`, sourcePage.source, target);
        return null;
      }
    }

    function validateFragment(sourcePage, targetPage, rawFragment) {
      if (!rawFragment) return '';
      const fragment = safeDecode(rawFragment).replace(/^#/, '');
      if (targetPage.anchors.has(fragment)) return fragment;
      const headingFragment = `heading-${safeSlug(fragment, '')}`;
      if (headingFragment !== 'heading-' && targetPage.anchors.has(headingFragment)) return headingFragment;
      addIssue('error', 'broken-anchor', `Anchor #${fragment} does not exist in ${targetPage.source}.`, sourcePage.source, `${targetPage.source}#${fragment}`);
      return fragment;
    }

    for (const page of pages) {
      const $ = page.$;
      $(FORBIDDEN_TAGS).each((_index, element) => {
        addIssue('error', 'unsafe-markup', `Trusted output contains forbidden <${element.tagName}> markup.`, page.source);
      });
      $('*').each((_index, element) => {
        for (const attribute of Object.keys(element.attribs || {})) {
          if (/^on/i.test(attribute) || ['srcdoc', 'srcset'].includes(attribute.toLowerCase())) {
            addIssue('error', 'unsafe-attribute', `Trusted output contains forbidden ${attribute} markup.`, page.source);
          }
        }
      });

      const anchors = $('a').toArray();
      for (const element of anchors) {
        const anchor = $(element);
        const dataLink = anchor.attr('data-link');
        const href = anchor.attr('href') || '';
        const raw = dataLink ? safeDecode(dataLink) : href;
        if (!raw || (raw === '#' && !dataLink)) continue;
        if (isExternalUrl(raw)) {
          if (!isSafeExternalUrl(raw)) addIssue('error', 'unsafe-link', 'Link uses an unsafe external protocol.', page.source, raw);
          else page.externalLinks.push(raw);
          continue;
        }
        if (/^(?:javascript|data|vbscript):/i.test(raw)) {
          addIssue('error', 'unsafe-link', 'Link uses an unsafe protocol.', page.source, raw);
          continue;
        }
        if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^file:/i.test(raw)) {
          addIssue('error', 'unsafe-link', 'Link uses an unsupported protocol.', page.source, raw);
          continue;
        }
        const split = splitTarget(raw);
        const routeLike = !split.target || /\.(?:md|markdown|html?|htm)$/i.test(split.target) || !path.posix.extname(split.target);
        const targetPage = routeLike ? findPage(page, split.target, Boolean(dataLink)) : null;
        if (targetPage) {
          const fragment = validateFragment(page, targetPage, split.fragment);
          const rewritten = `${relativeUrl(page.output, targetPage.output)}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`;
          anchor.attr('href', rewritten).removeAttr('data-link').removeAttr('data-original-link').removeClass('internal-link');
          page.internalLinks.push({ target: targetPage.source, output: rewritten });
          continue;
        }
        if (routeLike) {
          addIssue('error', 'broken-route', 'Internal page link does not resolve to a selected Markdown page.', page.source, raw);
          continue;
        }
        const asset = await registerAsset(page, raw, 'Link');
        if (asset) anchor.attr('href', relativeUrl(page.output, asset.output));
      }

      const images = $('img').toArray();
      for (const element of images) {
        const image = $(element);
        const source = image.attr('src') || '';
        if (!source) {
          addIssue('error', 'missing-image-source', 'Image has no usable source.', page.source);
          continue;
        }
        if (/^data:image\//i.test(source)) continue;
        if (/^https?:/i.test(source)) {
          if (!isSafeExternalUrl(source)) addIssue('error', 'unsafe-image', 'Image uses an unsafe external URL.', page.source, source);
          else addIssue('warning', 'external-asset', 'Remote image remains an external publication dependency.', page.source, source);
          continue;
        }
        const asset = await registerAsset(page, source, 'Image');
        if (asset) image.attr('src', relativeUrl(page.output, asset.output));
      }

      $('iframe').each((_index, element) => {
        const source = $(element).attr('src') || '';
        if (!isSafeIframeUrl(source)) addIssue('error', 'unsafe-embed', 'Embedded content is not on the trusted HTTPS allowlist.', page.source, source);
        else addIssue('warning', 'external-embed', 'Remote embed remains an external publication dependency.', page.source, source);
      });
      page.content = $.root().html() || '';
      page.sha256 = sha256(page.content);
    }

    const assets = Array.from(assetByPath.values()).sort((a, b) => a.output.localeCompare(b.output));
    const publicPages = pages.map(page => ({
      source: page.source,
      output: page.output,
      title: page.title,
      sha256: page.sha256,
      internalLinks: page.internalLinks,
      externalLinks: page.externalLinks
    }));
    const errors = issues.filter(issue => issue.severity === 'error');
    const warnings = issues.filter(issue => issue.severity === 'warning');
    const generatedAt = now().toISOString();
    const manifestCore = {
      schemaVersion: 1,
      rendererContract: RENDER_CONTRACT,
      title: siteTitle,
      handoff: profile,
      pages: publicPages,
      assets: assets.map(({ source, output, sha256: digest, bytes }) => ({ source, output, sha256: digest, bytes }))
    };
    const manifest = {
      ...manifestCore,
      generatedAt,
      publicationDigest: sha256(JSON.stringify(manifestCore))
    };
    const hasIndexPage = pages.some(page => page.output === 'index.html');
    const documents = pages.map(page => ({
      source: page.source,
      output: page.output,
      title: page.title,
      html: buildDocument({ title: page.title, siteTitle, content: page.content, output: page.output, pages: publicPages }),
      previewHtml: buildDocument({ title: page.title, siteTitle, content: offlineContent(page.content, page.output, assets), output: page.output, pages: publicPages, offline: true })
    }));
    if (!hasIndexPage) {
      documents.unshift({
        source: null,
        output: 'index.html',
        title: siteTitle,
        html: buildGeneratedIndex(siteTitle, publicPages),
        previewHtml: buildGeneratedIndex(siteTitle, publicPages, true)
      });
    }

    return {
      success: errors.length === 0,
      ready: errors.length === 0,
      rendererContract: RENDER_CONTRACT,
      report: {
        ready: errors.length === 0,
        summary: {
          pages: pages.length,
          assets: assets.length,
          internalLinks: pages.reduce((sum, page) => sum + page.internalLinks.length, 0),
          externalLinks: pages.reduce((sum, page) => sum + page.externalLinks.length, 0),
          errors: errors.length,
          warnings: warnings.length
        },
        issues,
        mappings: {
          pages: publicPages.map(({ source, output, title }) => ({ source, output, title })),
          assets: assets.map(({ source, output }) => ({ source, output }))
        }
      },
      manifest,
      documents,
      assets
    };
  }

  async function publish(workspaceRoot, request, outputDirectory) {
    const plan = await buildPlan(workspaceRoot, request);
    if (!plan.ready) return { ...plan, success: false, error: 'Publication preflight failed.' };
    if (typeof outputDirectory !== 'string' || outputDirectory.trim() === '') {
      return { ...plan, success: false, error: 'Choose a specific output directory.' };
    }
    const destination = path.resolve(String(outputDirectory || ''));
    if (!destination || destination === path.parse(destination).root) {
      return { ...plan, success: false, error: 'Choose a specific output directory.' };
    }
    const parent = path.dirname(destination);
    await fsImpl.mkdir(parent, { recursive: true });
    if (await exists(destination)) {
      const stat = await fsImpl.stat(destination);
      if (!stat.isDirectory()) return { ...plan, success: false, error: 'The selected output path is not a directory.' };
      const entries = await fsImpl.readdir(destination);
      if (entries.length) return { ...plan, success: false, error: 'Choose a new or empty output directory; NightOwl will not overwrite existing files.' };
      await fsImpl.rmdir(destination);
    }

    const staging = await fsImpl.mkdtemp(path.join(parent, '.nightowl-publication-'));
    try {
      for (const document of plan.documents) {
        const target = path.join(staging, ...document.output.split('/'));
        await fsImpl.mkdir(path.dirname(target), { recursive: true });
        await fsImpl.writeFile(target, document.html, 'utf8');
      }
      await fsImpl.writeFile(path.join(staging, 'style.css'), buildStylesheet(), 'utf8');
      for (const asset of plan.assets) {
        const target = path.join(staging, ...asset.output.split('/'));
        await fsImpl.mkdir(path.dirname(target), { recursive: true });
        await fsImpl.copyFile(asset.sourcePath, target);
      }
      await fsImpl.writeFile(path.join(staging, MANIFEST_FILE), `${JSON.stringify(plan.manifest, null, 2)}\n`, 'utf8');
      await fsImpl.rename(staging, destination);
      return {
        success: true,
        ready: true,
        filePath: destination,
        pageCount: plan.documents.length,
        report: plan.report,
        manifest: plan.manifest,
        manifestFile: MANIFEST_FILE
      };
    } catch (error) {
      await fsImpl.rm(staging, { recursive: true, force: true }).catch(() => {});
      return { ...plan, success: false, error: error.message || String(error) };
    }
  }

  return Object.freeze({ buildPlan, preflight: buildPlan, publish });
}

module.exports = {
  MANIFEST_FILE,
  MAX_PAGES,
  RENDER_CONTRACT,
  buildDocument,
  createStaticPublishingService,
  isInside,
  routeForSource,
  safeSlug
};
