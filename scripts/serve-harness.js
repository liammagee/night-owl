const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8090);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webm', 'video/webm'],
  ['.mp3', 'audio/mpeg'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

const safeResolve = (urlPath) => {
  const raw = String(urlPath || '/');
  const withoutQuery = raw.split('?')[0].split('#')[0];
  const decoded = decodeURIComponent(withoutQuery);
  const cleaned = decoded.replace(/\\/g, '/');
  const normalized = path.posix.normalize(cleaned);
  const safePath = normalized.startsWith('..') ? '/' : normalized;
  const joined = path.join(rootDir, safePath);
  if (!joined.startsWith(rootDir)) return null;
  return joined;
};

const server = http.createServer((req, res) => {
  const resolved = safeResolve(req.url);
  if (!resolved) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  let filePath = resolved;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    // keep as-is; we'll 404 below
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = contentTypes.get(ext) || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`\nTechne harness server running: http://localhost:${port}/harness/`);
  console.log(`Presentations: http://localhost:${port}/harness/presentations.html\n`);
});

