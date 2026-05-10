describe('published URL resolver', () => {
  const modulePath = '../../../orchestrator/modules/published-url.js';

  beforeEach(() => {
    jest.resetModules();
    delete window.NightOwlPublishedUrls;
  });

  test('maps Markdown files through a configured URL template', () => {
    const { resolvePublishedUrl } = require(modulePath);

    const url = resolvePublishedUrl(
      '/workspace/content/articles/ai-tutor/machinagogy-v2.md',
      {
        settings: {
          publishing: {
            urlMappings: [
              {
                localRoot: '/workspace/content',
                urlTemplate: 'https://machinespirits.org/{htmlPathNoExt}'
              }
            ]
          }
        }
      }
    );

    expect(url).toBe('https://machinespirits.org/articles/ai-tutor/machinagogy-v2');
  });

  test('supports content IDs for machinespirits-style hash routes', () => {
    const { resolvePublishedUrl } = require(modulePath);
    const settings = {
      publishing: {
        urlMappings: [
          {
            localRoot: '/workspace/content',
            urlTemplate: 'https://machinespirits.org/#/{contentId}'
          }
        ]
      }
    };

    expect(resolvePublishedUrl('/workspace/content/articles/ai-tutor/machinagogy-v2.md', { settings }))
      .toBe('https://machinespirits.org/#/ai-tutor-machinagogy-v2');
    expect(resolvePublishedUrl('/workspace/content/courses/479/lecture-1.md', { settings }))
      .toBe('https://machinespirits.org/#/479-lecture-1');
  });

  test('uses the longest matching root when folders overlap', () => {
    const { resolvePublishedUrl } = require(modulePath);

    const url = resolvePublishedUrl('/workspace/content/articles/a.md', {
      settings: {
        publishing: {
          urlMappings: [
            { localRoot: '/workspace', urlTemplate: 'https://root.example/{htmlPath}' },
            { localRoot: '/workspace/content', urlTemplate: 'https://content.example/{htmlPath}' }
          ]
        }
      }
    });

    expect(url).toBe('https://content.example/articles/a.html');
  });

  test('expands tilde roots against the clicked file path', () => {
    const { resolvePublishedUrl } = require(modulePath);

    const url = resolvePublishedUrl(
      '/Users/lmagee/Dev/machinespirits/machinespirits-content-philosophy/articles/ai-tutor/machinagogy-v2.md',
      {
        settings: {
          publishing: {
            urlMappings: [
              {
                localRoot: '~/Dev/machinespirits/machinespirits-content-philosophy',
                urlTemplate: 'https://machinespirits.org/content/{contentId}'
              }
            ]
          }
        }
      }
    );

    expect(url).toBe('https://machinespirits.org/content/ai-tutor-machinagogy-v2');
  });

  test('parses and serializes line based mappings', () => {
    const { parseMappingLines, serializeMappings } = require(modulePath);

    const mappings = parseMappingLines(`
      # comment
      /workspace/content => https://example.org/#/{contentId}
      /workspace/docs => https://docs.example/{htmlPathNoExt}
    `);

    expect(mappings).toEqual([
      { localRoot: '/workspace/content', urlTemplate: 'https://example.org/#/{contentId}' },
      { localRoot: '/workspace/docs', urlTemplate: 'https://docs.example/{htmlPathNoExt}' }
    ]);
    expect(serializeMappings(mappings)).toContain('/workspace/content => https://example.org/#/{contentId}');
  });

  test('returns null when the path is outside configured roots', () => {
    const { resolvePublishedUrl } = require(modulePath);

    const url = resolvePublishedUrl('/workspace/notes/a.md', {
      settings: {
        publishing: {
          urlMappings: [
            { localRoot: '/workspace/content', urlTemplate: 'https://example.org/{htmlPath}' }
          ]
        }
      }
    });

    expect(url).toBeNull();
  });
});
