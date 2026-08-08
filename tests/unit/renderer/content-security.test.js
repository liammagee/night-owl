const path = require('path');

const modulePath = path.resolve(__dirname, '../../../services/contentSecurity.js');

describe('shared rendered-content security policy', () => {
  let security;

  beforeEach(() => {
    jest.resetModules();
    delete window.NightOwlContentSecurity;
    security = require(modulePath);
  });

  test('removes executable markup, event handlers, unsafe URLs, and active CSS', () => {
    const html = security.sanitizeRenderedHTML(`
      <script>window.compromised = true</script>
      <svg><a xlink:href="javascript:alert(1)">svg</a></svg>
      <p onclick="alert(1)" style="background:url(https://tracker.example/pixel)">Safe text</p>
      <a id="bad-link" href="javascript:alert(1)" target="_blank">bad</a>
      <img id="bad-image" src="data:text/html;base64,PHNjcmlwdD4=" onerror="alert(1)">
    `);
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('p').hasAttribute('onclick')).toBe(false);
    expect(container.querySelector('p').hasAttribute('style')).toBe(false);
    expect(container.querySelector('#bad-link').hasAttribute('href')).toBe(false);
    expect(container.querySelector('#bad-link').hasAttribute('target')).toBe(false);
    expect(container.querySelector('#bad-image').hasAttribute('src')).toBe(false);
    expect(container.querySelector('#bad-image').hasAttribute('onerror')).toBe(false);
  });

  test('keeps local images and supported embeds with enforced restrictions', () => {
    const html = security.sanitizeRenderedHTML(`
      <img id="relative" src="../figures/map.png">
      <img id="local" src="file:///workspace/map.png">
      <img id="data" src="data:image/png;base64,iVBORw0KGgo=">
      <iframe id="evil" src="https://example.com/embed"></iframe>
      <iframe id="youtube" src="https://www.youtube-nocookie.com/embed/abc" sandbox="allow-top-navigation"></iframe>
      <iframe id="zoom" src="https://research.zoom.us/rec/play/abc" allow="camera *"></iframe>
    `);
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('#relative').getAttribute('src')).toBe('../figures/map.png');
    expect(container.querySelector('#local').getAttribute('src')).toBe('file:///workspace/map.png');
    expect(container.querySelector('#data').getAttribute('src')).toContain('data:image/png;base64,');
    expect(container.querySelector('#evil')).toBeNull();
    expect(container.querySelector('#youtube').getAttribute('sandbox')).toBe(security.IFRAME_SANDBOX);
    expect(container.querySelector('#youtube').getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(container.querySelector('#youtube').getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(container.querySelector('#zoom').getAttribute('allow')).toBe('microphone; camera; fullscreen');
  });

  test('normalizes link behavior and rejects disguised or protocol-relative schemes', () => {
    const html = security.sanitizeRenderedHTML(`
      <a id="external" href="https://machinespirits.org">external</a>
      <a id="mail" href="mailto:hello@example.com">mail</a>
      <a id="relative" href="notes/today.md" target="_blank">relative</a>
      <a id="protocol-relative" href="//attacker.example/path">bad</a>
      <a id="data" href="data:text/html,unsafe">bad</a>
    `);
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('#external').getAttribute('target')).toBe('_blank');
    expect(container.querySelector('#external').getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.querySelector('#mail').getAttribute('target')).toBe('_blank');
    expect(container.querySelector('#relative').hasAttribute('target')).toBe(false);
    expect(container.querySelector('#protocol-relative').hasAttribute('href')).toBe(false);
    expect(container.querySelector('#data').hasAttribute('href')).toBe(false);
  });

  test('resolves supported presentation images and rejects active schemes', () => {
    expect(security.resolveImageUrl('./figure.png', '/workspace/slides'))
      .toBe('file:///workspace/slides/figure.png');
    expect(security.resolveImageUrl('/workspace/figure.png', '/unused'))
      .toBe('file:///workspace/figure.png');
    expect(security.resolveImageUrl('https://images.example/figure.png', '/unused'))
      .toBe('https://images.example/figure.png');
    expect(security.resolveImageUrl('javascript:alert(1)', '/workspace')).toBeNull();
    expect(security.resolveImageUrl('//attacker.example/figure.png', '/workspace')).toBeNull();
  });
});
