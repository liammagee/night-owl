(function () {
  'use strict';

  const MIN_TEXT_SIZE_PX = 18;
  const NORMAL_TEXT_CONTRAST = 4.5;
  const LARGE_TEXT_CONTRAST = 3;

  function hash(value) {
    let result = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function warning(code, slide, options = {}) {
    const subject = String(options.subject || options.message || 'slide');
    const sourceLine = Number(options.sourceLine) || slide.startLine;
    return {
      id: `${code}:${slide.index}:${sourceLine}:${hash(subject)}`,
      code,
      severity: options.severity || 'warning',
      slideIndex: slide.index,
      slideNumber: slide.index + 1,
      sourceLine,
      message: options.message || code,
      detail: options.detail || '',
      subject,
      suppressible: options.suppressible !== false
    };
  }

  function splitSlides(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const slides = [];
    let frontMatterEnd = -1;

    if ((lines[0] || '').replace(/^\uFEFF/, '').trim() === '---') {
      for (let index = 1; index < lines.length; index += 1) {
        if (!/^(?:---|\.\.\.)[ \t]*$/.test(lines[index])) continue;
        const metadata = lines.slice(1, index);
        if (metadata.some(line => /^[A-Za-z0-9_-]+[ \t]*:/.test(line))) {
          frontMatterEnd = index;
        }
        break;
      }
    }

    let start = frontMatterEnd >= 0 ? frontMatterEnd + 1 : 0;
    let fence = null;

    function append(endExclusive) {
      let first = start;
      let last = endExclusive;
      while (first < last && !lines[first].trim()) first += 1;
      while (last > first && !lines[last - 1].trim()) last -= 1;
      if (first >= last) return;
      const source = lines.slice(first, last).join('\n');
      const heading = source.match(/^\s{0,3}#{1,6}\s+(.+)$/m);
      slides.push({
        index: slides.length,
        startLine: first + 1,
        endLine: last,
        markdown: source,
        title: heading ? heading[1].replace(/\s+#+\s*$/, '').trim() : `Slide ${slides.length + 1}`
      });
    }

    for (let index = start; index < lines.length; index += 1) {
      const line = lines[index];
      const fenceMarker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fence) {
        if (
          fenceMarker &&
          fenceMarker[1][0] === fence.character &&
          fenceMarker[1].length >= fence.length &&
          new RegExp(`^ {0,3}${fence.character === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(line)
        ) {
          fence = null;
        }
        continue;
      }
      if (fenceMarker) {
        fence = { character: fenceMarker[1][0], length: fenceMarker[1].length };
        continue;
      }

      const thematicBreak = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(line);
      if (thematicBreak) {
        append(index);
        start = index + 1;
      }
    }
    append(lines.length);
    return slides;
  }

  function lineForOffset(slide, offset) {
    return slide.startLine + slide.markdown.slice(0, Math.max(0, offset)).split('\n').length - 1;
  }

  function cleanAssetTarget(value) {
    const target = String(value || '').trim().replace(/^<|>$/g, '');
    if (!target) return '';
    const quotedTitle = target.match(/^(.*?)(?:\s+["'][^"']*["'])$/);
    return (quotedTitle ? quotedTitle[1] : target).trim();
  }

  function extractAssets(slide) {
    const assets = [];
    const seen = new Set();
    const add = (target, offset, kind) => {
      const cleaned = cleanAssetTarget(target);
      const key = `${kind}:${cleaned}:${offset}`;
      if (!cleaned || seen.has(key)) return;
      seen.add(key);
      assets.push({ target: cleaned, kind, sourceLine: lineForOffset(slide, offset) });
    };

    let match;
    const markdownImage = /!\[([^\]]*)\]\(([^)]+)\)/g;
    while ((match = markdownImage.exec(slide.markdown))) add(match[2], match.index, 'image');
    const htmlImage = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((match = htmlImage.exec(slide.markdown))) add(match[1], match.index, 'image');
    const background = /<!--\s*bg:\s*(.+?)\s*-->/gi;
    while ((match = background.exec(slide.markdown))) add(match[1], match.index, 'background');
    return assets;
  }

  function analyzeMarkdownSlides(slides) {
    const warnings = [];
    for (const slide of slides) {
      if (!/^\s{0,3}#{1,6}\s+\S/m.test(slide.markdown)) {
        warnings.push(warning('missing-heading', slide, {
          message: 'Slide has no heading',
          detail: 'Add a concise Markdown heading so the slide has a navigable, accessible title.'
        }));
      }

      let match;
      const markdownImage = /!\[([^\]]*)\]\(([^)]+)\)/g;
      while ((match = markdownImage.exec(slide.markdown))) {
        if (!match[1].trim()) {
          const target = cleanAssetTarget(match[2]);
          warnings.push(warning('image-alt', slide, {
            sourceLine: lineForOffset(slide, match.index),
            subject: target,
            message: 'Image is missing alternative text',
            detail: `Describe the purpose of ${target || 'this image'} inside the Markdown brackets.`
          }));
        }
      }
      const htmlImage = /<img\b([^>]*)>/gi;
      while ((match = htmlImage.exec(slide.markdown))) {
        const attributes = match[1];
        if (!/\balt\s*=\s*["'][^"']+?["']/i.test(attributes)) {
          const source = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || 'HTML image';
          warnings.push(warning('image-alt', slide, {
            sourceLine: lineForOffset(slide, match.index),
            subject: source,
            message: 'Image is missing alternative text',
            detail: `Add a meaningful alt attribute to ${source}.`
          }));
        }
      }
    }
    return warnings;
  }

  function parseColor(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text || text === 'transparent') return null;
    if (/^#[0-9a-f]{3,8}$/i.test(text)) {
      const digits = text.slice(1);
      const expanded = digits.length <= 4 ? digits.split('').map(part => part + part).join('') : digits;
      const alpha = expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1;
      return {
        r: parseInt(expanded.slice(0, 2), 16),
        g: parseInt(expanded.slice(2, 4), 16),
        b: parseInt(expanded.slice(4, 6), 16),
        a: alpha
      };
    }
    const parts = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (!parts) return null;
    const alpha = parts[4]?.endsWith('%') ? parseFloat(parts[4]) / 100 : Number(parts[4] ?? 1);
    return { r: Number(parts[1]), g: Number(parts[2]), b: Number(parts[3]), a: alpha };
  }

  function luminance(color) {
    const channel = value => {
      const normalized = Math.max(0, Math.min(255, value)) / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  }

  function contrastRatio(foreground, background) {
    const first = luminance(foreground);
    const second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }

  function resolvedBackground(element, boundary, getStyle) {
    let current = element;
    while (current) {
      const color = parseColor(getStyle(current).backgroundColor);
      if (color && color.a > 0.01) return color;
      if (current === boundary) break;
      current = current.parentElement;
    }
    return parseColor('#ffffff');
  }

  function analyzeRenderedSlides(root, slides, options = {}) {
    if (!root?.querySelectorAll) return [];
    const getStyle = options.getComputedStyle || globalThis.getComputedStyle;
    if (typeof getStyle !== 'function') return [];
    const warnings = [];
    const slideElements = Array.from(root.querySelectorAll('.slide[data-slide-index]'));
    for (const element of slideElements) {
      const slideIndex = Number(element.dataset.slideIndex);
      const slide = slides[slideIndex];
      if (!slide) continue;
      const scale = Number(element.querySelector('[data-content-scale]')?.dataset.contentScale || 1);
      if (element.dataset.contentOverflow === 'true' || (Number.isFinite(scale) && scale < 0.999)) {
        warnings.push(warning('overflow', slide, {
          severity: 'error',
          message: 'Slide content exceeds the 16:9 frame',
          detail: `Shorten the slide or split it. Delivery currently scales this content to ${Math.round(scale * 100)}%.`
        }));
      }

      const content = element.querySelector('.slide-content') || element;
      const candidates = Array.from(content.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,td,th,pre,code,figcaption,span'))
        .filter(candidate => candidate.textContent?.trim());
      let smallTextReported = false;
      let contrastReported = false;
      for (const candidate of candidates) {
        const style = getStyle(candidate);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const fontSize = parseFloat(style.fontSize);
        if (!smallTextReported && Number.isFinite(fontSize) && fontSize > 0 && fontSize < (options.minimumTextSize || MIN_TEXT_SIZE_PX)) {
          warnings.push(warning('minimum-text-size', slide, {
            subject: candidate.textContent.trim().slice(0, 80),
            message: `Text may be too small at ${fontSize.toFixed(1)} px`,
            detail: `Use at least ${options.minimumTextSize || MIN_TEXT_SIZE_PX} px for projected body text.`
          }));
          smallTextReported = true;
        }
        if (!contrastReported) {
          const foreground = parseColor(style.color);
          const background = resolvedBackground(candidate, element, getStyle);
          if (foreground && foreground.a > 0.01 && background) {
            const ratio = contrastRatio(foreground, background);
            const weight = Number(style.fontWeight) || (/bold/i.test(style.fontWeight) ? 700 : 400);
            const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
            const minimum = large ? LARGE_TEXT_CONTRAST : NORMAL_TEXT_CONTRAST;
            if (ratio < minimum) {
              warnings.push(warning('contrast', slide, {
                subject: candidate.textContent.trim().slice(0, 80),
                message: `Text contrast is ${ratio.toFixed(2)}:1`,
                detail: `Adjust foreground or background colors to reach at least ${minimum}:1.`
              }));
              contrastReported = true;
            }
          }
        }
        if (smallTextReported && contrastReported) break;
      }
    }
    return warnings;
  }

  function resolveLocalAsset(target, baseDir) {
    const value = String(target || '').trim().split('#')[0].split('?')[0];
    if (!value || /^(?:https?:|data:|blob:|mailto:|tel:|#|\/\/)/i.test(value)) return null;
    if (/^file:/i.test(value)) {
      try {
        const url = new URL(value);
        const pathname = decodeURIComponent(url.pathname);
        return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
      } catch (_) {
        return null;
      }
    }
    if (/^(?:[A-Za-z]:[\\/]|\/)/.test(value)) return decodeURIComponent(value);
    if (!baseDir) return null;
    try {
      const normalized = String(baseDir).replace(/\\/g, '/').replace(/\/+$/, '');
      const baseUrl = /^[A-Za-z]:\//.test(normalized)
        ? `file:///${normalized}/`
        : `file://${normalized}/`;
      const pathname = decodeURIComponent(new URL(value, baseUrl).pathname);
      return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
    } catch (_) {
      return `${String(baseDir).replace(/[\\/]+$/, '')}/${value}`;
    }
  }

  function dedupeWarnings(warnings) {
    const byId = new Map();
    warnings.forEach(item => {
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
    return [...byId.values()].sort((left, right) => (
      left.slideIndex - right.slideIndex ||
      (left.sourceLine || 0) - (right.sourceLine || 0) ||
      left.code.localeCompare(right.code)
    ));
  }

  async function run(options = {}) {
    const slides = splitSlides(options.markdown);
    const warnings = [
      ...analyzeMarkdownSlides(slides),
      ...analyzeRenderedSlides(options.root, slides, options)
    ];
    const assetExists = options.assetExists;
    if (typeof assetExists === 'function') {
      for (const slide of slides) {
        for (const asset of extractAssets(slide)) {
          const filePath = resolveLocalAsset(asset.target, options.baseDir);
          if (!filePath) continue;
          let exists = false;
          try {
            const result = await assetExists(filePath);
            exists = typeof result === 'object' ? result?.exists === true : Boolean(result);
          } catch (_) {
            exists = false;
          }
          if (!exists) {
            warnings.push(warning('missing-asset', slide, {
              severity: 'error',
              sourceLine: asset.sourceLine,
              subject: asset.target,
              message: `Local ${asset.kind} cannot be resolved`,
              detail: `${asset.target} does not exist at ${filePath}.`
            }));
          }
        }
      }
    }

    const allWarnings = dedupeWarnings(warnings);
    const suppressions = new Set(Array.isArray(options.suppressions) ? options.suppressions : []);
    const visible = allWarnings.filter(item => !suppressions.has(item.id));
    const bySeverity = visible.reduce((result, item) => {
      result[item.severity] = (result[item.severity] || 0) + 1;
      return result;
    }, {});
    return {
      success: true,
      generatedAt: new Date().toISOString(),
      slideCount: slides.length,
      slides,
      warnings: visible,
      allWarnings,
      warningCount: visible.length,
      suppressedCount: allWarnings.length - visible.length,
      bySeverity
    };
  }

  const api = {
    LARGE_TEXT_CONTRAST,
    MIN_TEXT_SIZE_PX,
    NORMAL_TEXT_CONTRAST,
    analyzeMarkdownSlides,
    analyzeRenderedSlides,
    contrastRatio,
    extractAssets,
    parseColor,
    resolveLocalAsset,
    run,
    splitSlides
  };

  if (typeof window !== 'undefined') window.NightOwlPresentationPreflight = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
