const http = require('http');
const {
  parseQueryPayload,
  parseBodyPayload,
  normalizeCapturePayload,
  createCitationCaptureServer
} = require('../../../services/citationCaptureBridge');

function requestJson({ method = 'GET', url, headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request({
      method,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      headers
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk.toString('utf8'); });
      res.on('end', () => {
        const payload = text ? JSON.parse(text) : {};
        resolve({ statusCode: res.statusCode, payload });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('Citation Capture Bridge', () => {
  test('parses query payload fields', () => {
    const url = new URL('http://127.0.0.1/capture?text=hello&title=Paper&url=https%3A%2F%2Fexample.com&source=bookmarklet');
    const parsed = parseQueryPayload(url);

    expect(parsed.text).toBe('hello');
    expect(parsed.title).toBe('Paper');
    expect(parsed.url).toBe('https://example.com');
    expect(parsed.source).toBe('bookmarklet');
  });

  test('parses JSON and form-encoded request bodies', () => {
    const jsonParsed = parseBodyPayload('{"text":"@article{a}","source":"extension"}');
    expect(jsonParsed.text).toBe('@article{a}');
    expect(jsonParsed.source).toBe('extension');

    const formParsed = parseBodyPayload('text=10.1000%2Fabc&title=DOI%20Test');
    expect(formParsed.text).toBe('10.1000/abc');
    expect(formParsed.title).toBe('DOI Test');
  });

  test('normalizes capture payload into raw citation text', () => {
    const normalized = normalizeCapturePayload({
      text: '',
      selection: '',
      title: 'Dialectics and Models',
      url: 'www.example.com/article',
      source: 'bookmarklet'
    });

    expect(normalized.rawText).toContain('Dialectics and Models');
    expect(normalized.rawText).toContain('https://www.example.com/article');
    expect(normalized.pageUrl).toBe('https://www.example.com/article');
    expect(normalized.source).toBe('bookmarklet');
  });

  test('capture server accepts GET and POST capture requests', async () => {
    const captures = [];
    const server = createCitationCaptureServer({
      host: '127.0.0.1',
      port: 0,
      onCapture: (payload) => captures.push(payload),
      logger: console
    });

    const address = await server.start();
    const baseUrl = `http://${address.host}:${address.port}`;

    const health = await requestJson({ url: `${baseUrl}/health` });
    expect(health.statusCode).toBe(200);
    expect(health.payload.success).toBe(true);

    const getCapture = await requestJson({
      url: `${baseUrl}/capture?text=10.1000%2Fabc123&source=bookmarklet`
    });
    expect(getCapture.statusCode).toBe(200);
    expect(getCapture.payload.success).toBe(true);

    const postCapture = await requestJson({
      method: 'POST',
      url: `${baseUrl}/capture`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '@article{test2026,title={Test}}',
        title: 'Test',
        url: 'https://example.org/paper',
        source: 'extension'
      })
    });
    expect(postCapture.statusCode).toBe(200);
    expect(postCapture.payload.success).toBe(true);

    expect(captures).toHaveLength(2);
    expect(captures[0].rawText).toContain('10.1000/abc123');
    expect(captures[1].rawText).toContain('@article{test2026');
    expect(captures[1].source).toBe('extension');

    await server.stop();
  });
});
