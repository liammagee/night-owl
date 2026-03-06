/**
 * Unit tests for citation click handler functionality.
 * Tests that inline citations are rendered with clickable links
 * and that the citation-key-click event is dispatched correctly.
 */

// Minimal citation renderer recreation for testing
function createTestCitationRenderer() {
  let bibEntries = [];

  function getEntry(key) {
    return bibEntries.find(e => e.key === key || e.id === key);
  }

  function formatAuthorsInline(authorStr) {
    if (!authorStr) return 'Unknown';
    const authors = authorStr.split(/\s+and\s+/i).map(part => {
      part = part.trim();
      if (part.includes(',')) {
        return { last: part.split(',')[0].trim() };
      }
      const words = part.split(/\s+/);
      return { last: words[words.length - 1] };
    });
    if (authors.length === 1) return authors[0].last;
    if (authors.length === 2) return `${authors[0].last} & ${authors[1].last}`;
    return `${authors[0].last} et al.`;
  }

  function processCitations(html) {
    const citedKeys = new Set();
    const citationPattern = /\[((?:[^@\]]*)?@[\w\-]+(?:,\s*[^\]]*)?(?:\s*;\s*(?:[^@\]]*)?@[\w\-]+(?:,\s*[^\]]*)?)*)\]/g;

    const processedHtml = html.replace(citationPattern, (match, content) => {
      const refs = content.split(/\s*;\s*|\s*,\s*(?=@)/);
      const citations = [];

      for (const ref of refs) {
        const atIndex = ref.indexOf('@');
        const afterAt = ref.substring(atIndex + 1);
        const authorOnly = afterAt.startsWith('-');
        const citationRef = authorOnly ? afterAt.substring(1) : afterAt;
        const commaIndex = citationRef.indexOf(',');
        const key = commaIndex > 0 ? citationRef.substring(0, commaIndex).trim() : citationRef.trim();

        const entry = getEntry(key);

        if (entry) {
          citedKeys.add(key);
          const authors = formatAuthorsInline(entry.author);
          citations.push(
            `<span class="citation-key-link" data-citation-key="${key}" title="Click to view in Citation Manager">${authors}, ${entry.year || 'n.d.'}</span>`
          );
        } else {
          citations.push(
            `<span class="citation-unknown citation-key-link" data-citation-key="${key}" title="Citation not found: ${key}">@${key}</span>`
          );
        }
      }

      return `<span class="citation">(${citations.join('; ')})</span>`;
    });

    return { html: processedHtml, citedKeys: Array.from(citedKeys) };
  }

  function bindCitationClickHandlers(container) {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const link = e.target.closest('.citation-key-link');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      const key = link.dataset.citationKey;
      if (!key) return;
      const event = new CustomEvent('citation-key-click', {
        detail: { key },
        bubbles: true
      });
      document.dispatchEvent(event);
    });
  }

  return {
    setBibEntries: (entries) => { bibEntries = entries; },
    processCitations,
    bindCitationClickHandlers
  };
}

describe('Citation Click Handlers', () => {
  let renderer;

  beforeEach(() => {
    renderer = createTestCitationRenderer();
    renderer.setBibEntries([
      { key: 'smith2023', author: 'Smith, John', year: '2023', title: 'Test' },
      { key: 'jones2024', author: 'Jones, Jane and Lee, Bob', year: '2024', title: 'Collab' }
    ]);
  });

  describe('processCitations with clickable links', () => {
    test('wraps known citation in citation-key-link span', () => {
      const { html } = renderer.processCitations('Some text [@smith2023] here.');
      expect(html).toContain('class="citation-key-link"');
      expect(html).toContain('data-citation-key="smith2023"');
    });

    test('wraps unknown citation in citation-unknown + citation-key-link', () => {
      const { html } = renderer.processCitations('Text [@nonexistent] here.');
      expect(html).toContain('citation-unknown');
      expect(html).toContain('citation-key-link');
      expect(html).toContain('data-citation-key="nonexistent"');
    });

    test('renders multiple citations each with click links', () => {
      const { html } = renderer.processCitations('[@smith2023; @jones2024]');
      expect(html).toContain('data-citation-key="smith2023"');
      expect(html).toContain('data-citation-key="jones2024"');
    });
  });

  describe('bindCitationClickHandlers', () => {
    test('dispatches citation-key-click event on click', () => {
      const container = document.createElement('div');
      container.innerHTML = '<span class="citation-key-link" data-citation-key="smith2023">Smith, 2023</span>';
      document.body.appendChild(container);

      renderer.bindCitationClickHandlers(container);

      const eventPromise = new Promise(resolve => {
        document.addEventListener('citation-key-click', (e) => {
          resolve(e.detail);
        }, { once: true });
      });

      container.querySelector('.citation-key-link').click();

      return eventPromise.then(detail => {
        expect(detail.key).toBe('smith2023');
        document.body.removeChild(container);
      });
    });

    test('does not dispatch when clicking non-link elements', () => {
      const container = document.createElement('div');
      container.innerHTML = '<span class="not-a-link">random text</span>';
      document.body.appendChild(container);

      renderer.bindCitationClickHandlers(container);

      let eventFired = false;
      const handler = () => { eventFired = true; };
      document.addEventListener('citation-key-click', handler);

      container.querySelector('.not-a-link').click();

      expect(eventFired).toBe(false);
      document.removeEventListener('citation-key-click', handler);
      document.body.removeChild(container);
    });

    test('handles null container gracefully', () => {
      expect(() => renderer.bindCitationClickHandlers(null)).not.toThrow();
    });
  });
});
