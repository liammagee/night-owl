(function initializeSpeakerNotesWindow(root, factory) {
  const api = factory(root);
  if (root) {
    root.NightOwlSpeakerNotesWindow = api;
    if (root.document?.readyState === 'loading') {
      root.addEventListener('DOMContentLoaded', api.initialize, { once: true });
    } else {
      api.initialize();
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createSpeakerNotesWindow(root) {
  'use strict';

  const ALLOWED_TAGS = new Set([
    'a', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt',
    'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'kbd', 'li', 'mark',
    'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
    'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
  ]);
  const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form']);

  function safeLink(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch {
      return '';
    }
  }

  function copySafeNode(node, documentRef) {
    if (node.nodeType === 3) return documentRef.createTextNode(node.textContent || '');
    if (node.nodeType !== 1) return documentRef.createDocumentFragment();

    const tagName = node.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tagName)) return documentRef.createDocumentFragment();
    if (!ALLOWED_TAGS.has(tagName)) {
      const fragment = documentRef.createDocumentFragment();
      Array.from(node.childNodes).forEach(child => fragment.appendChild(copySafeNode(child, documentRef)));
      return fragment;
    }

    const element = documentRef.createElement(tagName);
    const title = node.getAttribute('title');
    if (title) element.setAttribute('title', title);
    if (tagName === 'a') {
      const href = safeLink(node.getAttribute('href'));
      if (href) {
        element.setAttribute('href', href);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (['td', 'th'].includes(tagName)) {
      for (const attribute of ['colspan', 'rowspan']) {
        const value = Number.parseInt(node.getAttribute(attribute), 10);
        if (Number.isInteger(value) && value > 0 && value <= 100) {
          element.setAttribute(attribute, String(value));
        }
      }
    }
    Array.from(node.childNodes).forEach(child => element.appendChild(copySafeNode(child, documentRef)));
    return element;
  }

  function sanitizeNotesHTML(html, documentRef = root?.document) {
    if (!documentRef) return '';
    const source = documentRef.createElement('template');
    source.innerHTML = String(html || '');
    const safe = documentRef.createElement('template');
    Array.from(source.content.childNodes).forEach(node => {
      safe.content.appendChild(copySafeNode(node, documentRef));
    });
    return safe.innerHTML;
  }

  function renderEmptyState(contentElement) {
    contentElement.replaceChildren();
    const empty = contentElement.ownerDocument.createElement('em');
    empty.textContent = 'No speaker notes for this slide.';
    contentElement.appendChild(empty);
    contentElement.dataset.renderFormat = 'empty';
  }

  function renderNotes(contentElement, html) {
    if (!contentElement || !html) {
      if (contentElement) renderEmptyState(contentElement);
      return '';
    }
    const sanitized = sanitizeNotesHTML(html, contentElement.ownerDocument);
    const template = contentElement.ownerDocument.createElement('template');
    template.innerHTML = sanitized;
    contentElement.replaceChildren(template.content.cloneNode(true));
    if (!contentElement.childNodes.length) {
      renderEmptyState(contentElement);
      return '';
    }
    contentElement.dataset.renderFormat = 'html';
    return sanitized;
  }

  let initialized = false;
  function initialize() {
    if (initialized || !root?.speakerNotesAPI?.onUpdateSpeakerNotes) return false;
    const contentElement = root.document.getElementById('notes-content');
    const slideNumber = root.document.getElementById('slide-number');
    if (!contentElement || !slideNumber) return false;
    initialized = true;
    root.speakerNotesAPI.onUpdateSpeakerNotes((data = {}) => {
      renderNotes(contentElement, data.html ?? data.notes);
      if (data.slideNumber !== undefined) slideNumber.textContent = String(data.slideNumber);
    });
    return true;
  }

  return { initialize, renderNotes, sanitizeNotesHTML };
});
