// Isolated UI harness for core-interface layout regressions: production markup and
// styles, real Monaco, and the app-native notification, editor-layout and
// preview-markdown modules. No Electron profile, file writes, or background jobs.
const fs = require('fs');
const path = require('path');
const http = require('http');
const root = path.resolve(__dirname, '../..');

async function startInterfaceLayoutHarness() {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace('</body>', `
    <script src="/orchestrator/modules/notifications.js"></script>
    <script src="/orchestrator/modules/editor-layout.js"></script>
    <script src="/orchestrator/modules/preview-markdown.js"></script>
    <script src="/vs/loader.js"></script>
    <script>
      window.appSettings = { notifications: { enabled: true } };
      const longLine = 'word '.repeat(120).trim();
      document.getElementById('preview-source').textContent = longLine + '\\nshort line';
      require.config({ paths: { vs: '/vs' } });
      require(['vs/editor/editor.main'], () => {
        window.editor = monaco.editor.create(document.getElementById('editor-container'), {
          value: longLine + '\\nshort line',
          language: 'markdown', automaticLayout: true, minimap: { enabled: false },
          ...window.NightOwlEditorLayout.editorOptionsForWordWrap('on')
        });
      });
    </script>
  </body>`);
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
      return;
    }
    const filename = path.resolve(root, '.' + decodeURIComponent(pathname));
    if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
    res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
    fs.createReadStream(filename).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

module.exports = { startInterfaceLayoutHarness };
