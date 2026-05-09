const fs = require('fs');
const path = require('path');

function findDuplicateTopLevelFunctions(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const seen = new Map();
  const duplicates = [];

  source.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (!match) return;

    const name = match[1];
    const lineNumber = index + 1;
    if (seen.has(name)) {
      duplicates.push({
        name,
        firstLine: seen.get(name),
        duplicateLine: lineNumber
      });
      return;
    }
    seen.set(name, lineNumber);
  });

  return duplicates;
}

describe('Code quality guardrails', () => {
  test('renderer has no duplicate top-level function declarations', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const duplicates = findDuplicateTopLevelFunctions(rendererPath);

    expect(duplicates).toEqual([]);
  });

  test('file tree rendering batches DOM writes and hydrates tags off the initial paint', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const source = fs.readFileSync(rendererPath, 'utf8');

    expect(source).toContain('function renderFileTreeNodes');
    expect(source).toContain('document.createDocumentFragment');
    expect(source).toContain('fileTreeView.replaceChildren(fragment)');
    expect(source).toContain('scheduleFileTreeTagHydration(fileTree)');
    expect(source).not.toContain('await preProcessMarkdownTags(fileTree)');
  });

  test('preview render path does not synchronously wait for bibliography refresh', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const source = fs.readFileSync(rendererPath, 'utf8');

    expect(source).toContain('scheduleBibliographyRefresh(window.currentFilePath, markdownContent)');
    expect(source).not.toContain('await refreshBibliographyFromContent(window.currentFilePath, markdownContent)');
  });

  test('HTML preview iframe is script-disabled and assigned through srcdoc property', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const source = fs.readFileSync(rendererPath, 'utf8');

    expect(source).toContain("iframe.setAttribute('sandbox', 'allow-same-origin')");
    expect(source).toContain('iframe.srcdoc = fixedHtmlContent');
    expect(source).not.toContain('sandbox="allow-scripts allow-same-origin"');
    expect(source).not.toContain('<iframe srcdoc="${');
  });

  test('quality scripts guard generated directories and local audits', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
    const qualityScriptPath = path.join(__dirname, '../../../scripts/quality-static-checks.js');
    const qualityScript = fs.readFileSync(qualityScriptPath, 'utf8');

    expect(packageJson.scripts.quality).toContain('quality:static');
    expect(packageJson.scripts['quality:static']).toBe('node scripts/quality-static-checks.js');
    expect(qualityScript).toContain('GENERATED_DIRS');
    expect(qualityScript).toContain('assertNoTrackedGeneratedDirs');
    expect(qualityScript).toContain('--exclude-standard');
  });

  test('trace comparison tooling is documented and scriptable', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
    const traceScript = fs.readFileSync(path.join(__dirname, '../../../scripts/compare-chromium-traces.js'), 'utf8');
    const runbook = fs.readFileSync(path.join(__dirname, '../../../docs/performance-trace-runbook.md'), 'utf8');

    expect(packageJson.scripts['quality:trace']).toBe('node scripts/compare-chromium-traces.js');
    expect(traceScript).toContain('summarizeTrace');
    expect(traceScript).toContain('traceEvents');
    expect(runbook).toContain('Large-file editing');
    expect(runbook).toContain('Markdown preview');
    expect(runbook).toContain('Graph view');
    expect(runbook).toContain('Presentation view');
  });

  test('noisy git and search success logs are debug-gated', () => {
    const gitSource = fs.readFileSync(path.join(__dirname, '../../../ipc/gitHandlers.js'), 'utf8');
    const searchSource = fs.readFileSync(path.join(__dirname, '../../../ipc/searchHandlers.js'), 'utf8');
    const loggingSource = fs.readFileSync(path.join(__dirname, '../../../ipc/logging.js'), 'utf8');

    expect(loggingSource).toContain('NIGHTOWL_DEBUG_LOGS');
    expect(gitSource).toContain("createDebugLogger('GitHandlers')");
    expect(searchSource).toContain("createDebugLogger('SearchHandlers')");
    expect(gitSource).not.toContain('console.log(`[GitHandlers] No git repo found');
    expect(searchSource).not.toContain('console.log(`[SearchHandlers] Global search');
  });

  test('file pane toolbar remains compact inside the activity sidebar', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');

    expect(indexSource).toContain('#left-sidebar-workspace');
    expect(indexSource).toContain('width: 312px;');
    expect(indexSource).toContain('flex: 0 0 312px;');
    expect(indexSource).toContain('min-width: 0;');
    expect(indexSource).toContain('container-type: inline-size;');
    expect(indexSource).toContain('@container (max-width: 220px)');
    expect(indexSource).toContain('class="btn pane-action-btn"');
    expect(indexSource).toContain('<span class="pane-action-label">Root</span>');
    expect(indexSource).toContain('<span class="pane-action-label">Main</span>');
    expect(indexSource).toContain('<span class="pane-action-label">Folder</span>');
    expect(indexSource).not.toContain('>Add Root</button>');
    expect(indexSource).not.toContain('>Primary</button>');
    expect(indexSource).not.toContain('>New Folder</button>');
  });
});
