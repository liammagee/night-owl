(function (root, factory) {
  const api = factory(root);
  if (root) root.NightOwlContentSecurity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createContentSecurity(root) {
  'use strict';

  const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
  const LINK_PROTOCOLS = new Set([...EXTERNAL_PROTOCOLS, 'file:']);
  const IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);
  const IFRAME_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'www.youtube-nocookie.com',
    'player.vimeo.com'
  ]);
  const FORBIDDEN_TAGS = [
    'script',
    'style',
    'object',
    'embed',
    'link',
    'meta',
    'base',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'option',
    'audio',
    'video',
    'source',
    'track'
  ];
  const IFRAME_SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups';
  const YOUTUBE_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  const ZOOM_ALLOW = 'microphone; camera; fullscreen';
  let purifier = null;

  function normalizeInput(value) {
    return String(value == null ? '' : value).trim();
  }

  function parseAbsoluteUrl(value) {
    const raw = normalizeInput(value);
    if (!raw) return null;
    try {
      return new URL(raw);
    } catch {
      return null;
    }
  }

  function hasExplicitScheme(value) {
    const raw = normalizeInput(value);
    if (/^[a-z]:[\\/]/i.test(raw) || raw.startsWith('\\\\')) return false;
    return /^[a-z][a-z\d+.-]*:/i.test(raw);
  }

  function isSafeRelativeUrl(value) {
    const raw = normalizeInput(value);
    if (!raw || raw.startsWith('//') || raw.startsWith('\\\\')) return false;
    return !hasExplicitScheme(raw);
  }

  function isAllowedExternalUrl(value) {
    const parsed = parseAbsoluteUrl(value);
    return Boolean(parsed && EXTERNAL_PROTOCOLS.has(parsed.protocol.toLowerCase()));
  }

  function isAllowedLinkUrl(value) {
    const raw = normalizeInput(value);
    if (!raw) return true;
    if (isSafeRelativeUrl(raw)) return true;
    const parsed = parseAbsoluteUrl(raw);
    return Boolean(parsed && LINK_PROTOCOLS.has(parsed.protocol.toLowerCase()));
  }

  function isAllowedDataImage(value) {
    return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z\d+/=\s]+$/i.test(normalizeInput(value));
  }

  function isAllowedImageUrl(value) {
    const raw = normalizeInput(value);
    if (!raw) return true;
    if (isAllowedDataImage(raw)) return true;
    if (isSafeRelativeUrl(raw)) return true;
    const parsed = parseAbsoluteUrl(raw);
    return Boolean(parsed && IMAGE_PROTOCOLS.has(parsed.protocol.toLowerCase()));
  }

  function isZoomHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return host === 'zoom.us' || host.endsWith('.zoom.us');
  }

  function getIframePolicy(value) {
    const parsed = parseAbsoluteUrl(value);
    if (!parsed || parsed.protocol.toLowerCase() !== 'https:') return null;
    const hostname = parsed.hostname.toLowerCase();
    if (IFRAME_HOSTS.has(hostname)) return { kind: 'media', allow: YOUTUBE_ALLOW };
    if (isZoomHost(hostname)) return { kind: 'meeting', allow: ZOOM_ALLOW };
    return null;
  }

  function isAllowedIframeUrl(value) {
    return Boolean(getIframePolicy(value));
  }

  function sanitizeStyle(element) {
    const style = element.getAttribute('style');
    if (!style) return;
    if (/(?:url\s*\(|expression\s*\(|javascript:|vbscript:|@import|-moz-binding|behavior\s*:)/i.test(style)) {
      element.removeAttribute('style');
    }
  }

  function getPurifier() {
    if (purifier?.sanitize) return purifier;
    if (root?.DOMPurify?.sanitize) {
      purifier = root.DOMPurify;
      return purifier;
    }
    if (root?.document && typeof module !== 'undefined' && module.exports) {
      try {
        const imported = require('dompurify');
        const candidate = imported.default || imported;
        purifier = candidate.sanitize ? candidate : candidate(root);
      } catch {
        purifier = null;
      }
    }
    return purifier;
  }

  function escapeHtml(value) {
    return normalizeInput(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeRenderedHTML(html, options = {}) {
    const raw = String(html == null ? '' : html);
    const activePurifier = getPurifier();
    const documentRef = root?.document;
    if (!activePurifier || !documentRef) return escapeHtml(raw);

    const purified = activePurifier.sanitize(raw, {
      USE_PROFILES: { html: true },
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'referrerpolicy', 'sandbox', 'target', 'rel'],
      FORBID_TAGS: FORBIDDEN_TAGS,
      FORBID_ATTR: ['srcdoc', 'srcset'],
      ALLOW_UNKNOWN_PROTOCOLS: true
    });
    const template = documentRef.createElement('template');
    template.innerHTML = purified;

    for (const element of Array.from(template.content.querySelectorAll('*'))) {
      const tagName = element.tagName.toLowerCase();

      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc' || name === 'srcset') {
          element.removeAttribute(attribute.name);
        }
      }
      sanitizeStyle(element);

      if (element.hasAttribute('href')) {
        if (tagName !== 'a' || !isAllowedLinkUrl(element.getAttribute('href'))) {
          element.removeAttribute('href');
        }
      }
      if (element.hasAttribute('src')) {
        if (tagName === 'img') {
          const originalSource = element.getAttribute('src');
          const resolvedSource = options.baseDir
            ? resolveImageUrl(originalSource, options.baseDir)
            : originalSource;
          if (!resolvedSource || !isAllowedImageUrl(resolvedSource)) {
            element.removeAttribute('src');
          } else if (resolvedSource !== originalSource) {
            element.setAttribute('src', resolvedSource);
          }
        } else if (tagName !== 'iframe') {
          element.removeAttribute('src');
        }
      }

      if (tagName === 'iframe') {
        const policy = getIframePolicy(element.getAttribute('src'));
        if (!policy) {
          element.remove();
          continue;
        }
        element.setAttribute('sandbox', IFRAME_SANDBOX);
        element.setAttribute('referrerpolicy', 'no-referrer');
        element.setAttribute('allow', policy.allow);
      }

      if (tagName === 'a') {
        const href = element.getAttribute('href') || '';
        if (isAllowedExternalUrl(href)) {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer');
        } else {
          element.removeAttribute('target');
          element.removeAttribute('rel');
        }
      }
    }

    return template.innerHTML;
  }

  function setSanitizedHTML(element, html, options = {}) {
    if (!element) return '';
    const sanitized = sanitizeRenderedHTML(html, options);
    const documentRef = element.ownerDocument || root?.document;
    const template = documentRef.createElement('template');
    template.innerHTML = sanitized;
    element.replaceChildren(template.content.cloneNode(true));
    return sanitized;
  }

  function resolveImageUrl(value, baseDir) {
    const raw = normalizeInput(value);
    if (!raw) return null;
    let resolved = raw;
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      resolved = `file://${raw}`;
    } else if (isSafeRelativeUrl(raw) && !raw.startsWith('#')) {
      const base = normalizeInput(baseDir).replace(/\/+$/, '');
      if (base) resolved = `file://${base}/${raw.replace(/^\.\//, '')}`;
    }
    return isAllowedImageUrl(resolved) ? resolved : null;
  }

  function isTrustedAppNavigation(value, appEntryUrl) {
    const parsed = parseAbsoluteUrl(value);
    const appEntry = parseAbsoluteUrl(appEntryUrl);
    if (!parsed || !appEntry || parsed.protocol !== 'file:' || appEntry.protocol !== 'file:') return false;
    return parsed.origin === appEntry.origin && parsed.pathname === appEntry.pathname;
  }

  function installNavigationGuards(webContents, options = {}) {
    const openExternal = options.openExternal;
    const appEntryUrl = options.appEntryUrl;
    const onError = typeof options.onError === 'function' ? options.onError : () => {};

    const openIfAllowed = (url) => {
      if (!isAllowedExternalUrl(url) || typeof openExternal !== 'function') return false;
      Promise.resolve(openExternal(url)).catch(onError);
      return true;
    };

    webContents.setWindowOpenHandler(({ url }) => {
      openIfAllowed(url);
      return { action: 'deny' };
    });
    webContents.on('will-navigate', (event, url) => {
      if (isTrustedAppNavigation(url, appEntryUrl)) return;
      event.preventDefault();
      openIfAllowed(url);
    });
  }

  return {
    EXTERNAL_PROTOCOLS,
    IFRAME_SANDBOX,
    hasExplicitScheme,
    isAllowedExternalUrl,
    isAllowedLinkUrl,
    isAllowedImageUrl,
    isAllowedIframeUrl,
    isTrustedAppNavigation,
    resolveImageUrl,
    sanitizeRenderedHTML,
    setSanitizedHTML,
    installNavigationGuards
  };
});
