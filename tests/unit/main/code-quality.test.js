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

function collectJavaScriptFiles(rootPath, options = {}) {
  const ignoredNames = new Set(options.ignoredNames || ['node_modules']);
  const files = [];

  function visit(currentPath) {
    const stat = fs.statSync(currentPath);
    if (stat.isDirectory()) {
      if (ignoredNames.has(path.basename(currentPath))) return;
      for (const entry of fs.readdirSync(currentPath)) {
        visit(path.join(currentPath, entry));
      }
      return;
    }

    if (/\.(js|jsx|mjs|cjs)$/.test(currentPath)) {
      files.push(currentPath);
    }
  }

  visit(rootPath);
  return files;
}

describe('Code quality guardrails', () => {
  test('renderer has no duplicate top-level function declarations', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const duplicates = findDuplicateTopLevelFunctions(rendererPath);

    expect(duplicates).toEqual([]);
  });

  test('actions use the shared registry without legacy command arrays or duplicate file palettes', () => {
    const appRoots = [
      path.join(__dirname, '../../../orchestrator'),
      path.join(__dirname, '../../../plugins')
    ];
    const appSources = appRoots
      .flatMap(rootPath => collectJavaScriptFiles(rootPath))
      .map(filePath => fs.readFileSync(filePath, 'utf8'));
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const paletteSource = fs.readFileSync(
      path.join(__dirname, '../../../orchestrator/modules/commandPalette.js'),
      'utf8'
    );

    expect(indexSource).toContain('orchestrator/modules/action-registry.js');
    expect(indexSource).not.toContain('id="command-palette-overlay"');
    expect(rendererSource).not.toContain('Command Palette (VS Code-style Cmd+P) Implementation');
    expect(appSources.some(source => source.includes('window.commandPaletteCommands'))).toBe(false);
    expect(paletteSource).not.toContain('function registerCommand(');
    expect(paletteSource).toContain('const registerCommand = registerCoreAction;');
    expect(mainSource).toContain("getElectronAccelerator('file.quickOpen')");
    expect(mainSource).toContain("getElectronAccelerator('view.togglePreview')");
    expect(mainSource).toContain("webContents.send('show-keyboard-shortcuts')");
    expect(mainSource).not.toContain('• Cmd/Ctrl+P: Toggle presentation mode');
    expect(mainSource).not.toMatch(/accelerator:\s*['\"]CmdOrCtrl/);
  });

  test('publishing profiles use fixed IPC capabilities and direct command vectors', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const serviceSource = fs.readFileSync(path.join(__dirname, '../../../services/publishingProfiles.js'), 'utf8');

    expect(indexSource).toContain('orchestrator/modules/publishing-workflows.js');
    expect(indexSource).toContain('orchestrator/modules/publishing-workflows.css');
    expect(mainSource).toContain("webContents.send('open-publishing-workflows')");
    expect(serviceSource).toContain('execFile(executable, args');
    expect(serviceSource).not.toContain('execSync(');
    expect(serviceSource).not.toMatch(/shell:\s*true/);
  });

  test('file tree rendering batches DOM writes and hydrates tags off the initial paint', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const source = fs.readFileSync(rendererPath, 'utf8');

    expect(source).toContain('function renderFileTreeNodes');
    expect(source).toContain('document.createDocumentFragment');
    expect(source).toContain('fileTreeView.replaceChildren(fragment)');
    expect(source).toContain('scheduleFileTreeTagHydration(displayTree)');
    expect(source).not.toContain('await preProcessMarkdownTags(displayTree)');
  });

  test('file tree multi-selection can be moved through drag/drop and paste', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const dragdropSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/dragdrop.js'), 'utf8');

    expect(rendererSource).toContain("action: 'cut-files'");
    expect(rendererSource).toContain('getFileClipboardPaths()');
    expect(rendererSource).toContain('filePaths: selectedPaths');
    expect(rendererSource).toContain('window.syncMovedPathWithOpenTabs = syncMovedPathWithOpenTabs');
    expect(dragdropSource).toContain('createDraggedItemFromElement');
    expect(dragdropSource).toContain('moveDraggedItemsToFolder');
    expect(dragdropSource).toContain('item.isMulti');
  });

  test('file tree active-folder and clipboard state live outside renderer', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const stateSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/file-tree-state.js'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');

    expect(indexSource).toContain('orchestrator/modules/file-tree-state.js');
    expect(rendererSource).toContain('align by depth');
    expect(stateSource).toContain('window.NightOwlFileTreeState');
    expect(stateSource).toContain('function setActiveTreeFolder');
    expect(stateSource).toContain('function setClipboard');
    expect(rendererSource).toContain('const fileTreeState = window.NightOwlFileTreeState');
    expect(rendererSource).not.toContain('let fileClipboard = {');
    expect(rendererSource).not.toContain('function setActiveTreeFolder');
  });

  test('app code uses app-native confirmation instead of raw browser confirm', () => {
    const appRoots = [
      path.join(__dirname, '../../../orchestrator'),
      path.join(__dirname, '../../../plugins')
    ];
    const offenders = appRoots
      .flatMap(rootPath => collectJavaScriptFiles(rootPath))
      .filter(filePath => /\b(?:window\.)?confirm\s*\(/.test(fs.readFileSync(filePath, 'utf8')))
      .map(filePath => path.relative(path.join(__dirname, '../../..'), filePath));

    expect(offenders).toEqual([]);
  });

  test('preview render path does not synchronously wait for bibliography refresh', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const source = fs.readFileSync(rendererPath, 'utf8');

    expect(source).toContain('scheduleBibliographyRefresh(options.currentFilePath, markdownContent)');
    expect(source).not.toContain('await refreshBibliographyFromContent(window.currentFilePath, markdownContent)');
  });

  test('fallback preview markdown helpers live outside renderer', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const previewModule = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/preview-markdown.js'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');

    expect(indexSource).toContain('orchestrator/modules/preview-markdown.js');
    expect(rendererSource).toContain('window.NightOwlPreviewMarkdown');
    expect(rendererSource).not.toContain('function setupFallbackMarkdownRenderer');
    expect(rendererSource).not.toContain('function renderFrontmatterHeaderFallback');
    expect(rendererSource).not.toContain('function fixHeaderlessTables');
    expect(rendererSource).not.toContain('function processMarkdownContent');
    expect(previewModule).toContain('window.NightOwlPreviewMarkdown');
    expect(previewModule).toContain('function processMarkdownContent');
  });

  test('markdown preview writes pass through the sanitizer boundary', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const previewModule = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/preview-markdown.js'), 'utf8');
    const techneRenderer = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-markdown-renderer/techne-markdown-renderer.js'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');

    expect(previewModule).toContain('function sanitizePreviewHTML');
    expect(previewModule).toContain('function setSanitizedHTML');
    expect(indexSource).toContain('frame-src');
    expect(indexSource).toContain('https://www.youtube.com');
    expect(indexSource).toContain('https://www.youtube-nocookie.com');
    expect(indexSource).toContain('https://player.vimeo.com');
    expect(indexSource).toContain('https://*.zoom.us');
    expect(rendererSource).toContain('previewMarkdown.setSanitizedHTML(targetElement, headerHtml + htmlContent)');
    expect(rendererSource).toContain('previewContent.replaceChildren(...Array.from(staging.childNodes))');
    expect(rendererSource).toContain('pre.textContent = markdownContent');
    expect(rendererSource).not.toContain("previewContent.innerHTML = '<pre>' + markdownContent + '</pre>'");
    expect(rendererSource).not.toContain('previewContent.innerHTML = headerHtml + htmlContent');
    expect(techneRenderer).toContain('window.NightOwlPreviewMarkdown?.setSanitizedHTML');
  });

  test('preload bridge exposes fixed capability methods with guarded main-process senders', () => {
    const rootPreload = fs.readFileSync(path.join(__dirname, '../../../preload.js'), 'utf8');
    const orchestratorPreload = fs.readFileSync(path.join(__dirname, '../../../orchestrator/preload.js'), 'utf8');
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const guardSource = fs.readFileSync(path.join(__dirname, '../../../preload-ipc-guard.js'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));

    const ipcSecuritySource = fs.readFileSync(path.join(__dirname, '../../../services/ipcSecurity.js'), 'utf8');

    expect(rootPreload).toContain('createCapabilityApi');
    expect(orchestratorPreload).toContain('createCapabilityApi');
    expect(mainSource).toContain('sandbox: false');
    expect(packageJson.build.files).toContain('preload-ipc-guard.js');
    expect(guardSource).toContain('ALLOWED_INVOKE_CHANNELS');
    expect(guardSource).toContain('CAPABILITY_CHANNELS');
    expect(guardSource).toContain('ARGUMENT_VALIDATORS');
    expect(ipcSecuritySource).toContain('event.senderFrame !== sender.mainFrame');
    expect(mainSource).toContain('installIpcMainGuard(ipcMain');
    expect(rootPreload).not.toMatch(/\binvoke\s*:/);
    expect(orchestratorPreload).not.toMatch(/\binvoke\s*:/);
    expect(rootPreload).not.toMatch(/\bon\s*:/);
    expect(rootPreload).not.toMatch(/\bsend\s*:/);
    expect(packageJson.dependencies?.['@electron/remote']).toBeUndefined();
    expect(mainSource).not.toContain('@electron/remote');

    const rendererFiles = ['js', 'orchestrator', 'plugins']
      .flatMap(directory => collectJavaScriptFiles(path.join(__dirname, '../../..', directory)));
    const genericDispatchers = rendererFiles.filter(file => (
      /electronAPI(?:\?\.|\.)(?:invoke|on|send)\b/.test(fs.readFileSync(file, 'utf8'))
    ));
    expect(genericDispatchers).toEqual([]);

    const bridgeMutations = rendererFiles.filter(file => (
      /electronAPI(?:\?\.|\.)[A-Za-z_$][\w$]*\s*=(?!=)/.test(fs.readFileSync(file, 'utf8'))
    ));
    expect(bridgeMutations).toEqual([]);
  });

  test('dynamic resources have explicit owners and app shutdown cleanup', () => {
    const lifecycleSource = fs.readFileSync(path.join(__dirname, '../../../services/resourceLifecycle.js'), 'utf8');
    const featureLoaderSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/feature-loader.js'), 'utf8');
    const feedSource = fs.readFileSync(path.join(__dirname, '../../../ipc/feedHandlers.js'), 'utf8');
    const ipcSource = fs.readFileSync(path.join(__dirname, '../../../ipc/index.js'), 'utf8');
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');

    expect(indexSource).toContain('services/resourceLifecycle.js');
    expect(lifecycleSource).toContain('function createRegistry');
    expect(featureLoaderSource).toContain('disposeFeatureLifecycle');
    expect(featureLoaderSource).toContain('disposeAllFeatures');
    expect(feedSource).toContain("name: 'main:research-feed'");
    expect(feedSource).toContain('pollLifecycle.interval');
    expect(feedSource).toContain('pollLifecycle.timeout');
    expect(ipcSource).toContain('fileHandlers.cleanup()');
    expect(ipcSource).toContain('terminalHandlers.cleanup()');
    expect(mainSource).toContain('ipcHandlers.cleanupHandlers()');
  });

  test('transition failures use structured redacted diagnostics and local recovery actions', () => {
    const diagnosticsSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/diagnostics.js'), 'utf8');
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const modeSource = fs.readFileSync(path.join(__dirname, '../../../js/mode-switcher.js'), 'utf8');
    const transitionSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/file-transition-coordinator.js'), 'utf8');
    const previewSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/preview-router.js'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');

    expect(indexSource).toContain('orchestrator/modules/diagnostics.js');
    expect(indexSource).toContain('css/diagnostics.css');
    expect(diagnosticsSource).toContain('SENSITIVE_KEY_RE');
    expect(diagnosticsSource).toContain('PATH_KEY_RE');
    expect(diagnosticsSource).toContain('Copy redacted diagnostics');
    expect(transitionSource).toContain('correlationId');
    expect(previewSource).not.toContain('onError({ filePath, content,');
    expect(rendererSource).toContain("recordViewFailure('file', 'NO-FILE-OPEN'");
    expect(rendererSource).toContain("recordViewFailure('preview', 'NO-PREVIEW-RENDER'");
    expect(rendererSource).toContain("'Reset View'");
    expect(modeSource).toContain('recordPresentationFailure');
    expect(modeSource).toContain('presentation-load-reset');
    expect(mainSource).toContain("label: 'Diagnostics...'");
    expect(mainSource).toContain("send('open-diagnostics')");
  });

  test('NightOwl command-line installer is reachable from the app menu and packaged build', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const cliSource = fs.readFileSync(path.join(__dirname, '../../../bin/nightowl'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));

    expect(mainSource).toContain('installNightOwlShellCommand');
    expect(mainSource).toContain("Install 'nightowl' Shell Command");
    expect(mainSource).toContain('installNightOwlCli(getCliInstallerOptions())');
    expect(packageJson.bin.nightowl).toBe('bin/nightowl');
    expect(packageJson.build.files).toContain('bin/**/*');
    expect(packageJson.build.files).toContain('services/**/*');
    expect(cliSource).toContain('function resolveMacAppPath');
    expect(cliSource).toContain('appendWorkspaceProfileArgs');
    expect(cliSource).toContain('resolveWorkspaceUserDataPath');
    expect(cliSource).toContain("path.join(appRoot, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'NightOwl.app')");
    expect(cliSource).not.toContain('path to application "NightOwl"');
    expect(mainSource).toContain('extractWorkspaceUserDataDir');
    expect(mainSource).toContain('WORKSPACE_PROFILE_ENV');
    expect(mainSource).toContain("app.setPath('userData', workspaceUserDataDir)");
    expect(cliSource).toContain("process.env.NIGHTOWL_CLI_DEV === '1'");
    expect(cliSource).toContain('directAppArgs');
    expect(cliSource).toContain('`--user-data-dir=${workspaceUserDataPath}`');
  });

  test('direct write handlers resolve targets through workspace path guards', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const fileHandlersSource = fs.readFileSync(path.join(__dirname, '../../../ipc/fileHandlers.js'), 'utf8');

    expect(mainSource).toContain('resolveMainWorkspaceWritePath(filePath,');
    expect(fileHandlersSource).toContain('function resolveWorkspaceWritePath');
    expect(fileHandlersSource).toContain("resolveWorkspaceWritePath(payload.filePath, 'File path')");
    expect(fileHandlersSource).toContain("resolveWorkspaceWritePath(filePath, 'Save path')");
    expect(fileHandlersSource).toContain("validatePathSegment(fileName, 'File name')");
    expect(fileHandlersSource).toContain("validatePathSegment(folderName, 'Folder name')");
    expect(fileHandlersSource).toContain("resolveWorkspaceWritePath(destination, 'Destination path')");
  });

  test('Monaco workers use the AMD worker bootstrap instead of direct language worker files', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const monacoEnvironmentSource = fs.readFileSync(
      path.join(__dirname, '../../../orchestrator/modules/monaco-environment.js'),
      'utf8'
    );

    expect(indexSource).toContain('orchestrator/modules/monaco-environment.js');
    expect(indexSource).toContain('./vs/loader.js');
    expect(monacoEnvironmentSource).toContain('base/worker/workerMain.js');
    expect(monacoEnvironmentSource).toContain('URL.createObjectURL');
    expect(monacoEnvironmentSource).toContain('importScripts');
    expect(rendererSource).not.toMatch(/language\/(?:json|css|html|typescript)\/(?:json|css|html|ts)Worker\.js/);
    expect(indexSource).not.toContain('getWorker: function');
    expect(indexSource).not.toContain('return undefined; // Disable web workers');
  });

  test('HTML preview iframe supports scripts inside an isolated sandbox', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const source = fs.readFileSync(rendererPath, 'utf8');

    expect(source).toContain("iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals')");
    expect(source).toContain('iframe.srcdoc = fixedHtmlContent');
    expect(source).not.toContain("iframe.setAttribute('sandbox', 'allow-same-origin')");
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

  test('quality hardening backlog file is retired after completion', () => {
    const backlogPath = path.join(__dirname, '../../../docs/quality-hardening-todo.md');
    const rootTodoPath = path.join(__dirname, '../../../TODO.md');

    expect(fs.existsSync(backlogPath)).toBe(false);
    expect(fs.existsSync(rootTodoPath)).toBe(false);
  });

  test('trace comparison tooling is documented and scriptable', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
    const traceScript = fs.readFileSync(path.join(__dirname, '../../../scripts/compare-chromium-traces.js'), 'utf8');
    const runbook = fs.readFileSync(path.join(__dirname, '../../../docs/performance-trace-runbook.md'), 'utf8');
    const performanceE2E = fs.readFileSync(path.join(__dirname, '../../../tests/e2e/performance.e2e.js'), 'utf8');

    expect(packageJson.scripts['quality:trace']).toBe('node scripts/compare-chromium-traces.js');
    expect(packageJson.scripts['benchmark:performance']).toContain('playwright.performance.config.js');
    expect(traceScript).toContain('summarizeTrace');
    expect(traceScript).toContain('traceEvents');
    expect(runbook).toContain('Large-file editing');
    expect(runbook).toContain('Markdown preview');
    expect(runbook).toContain('Graph view');
    expect(runbook).toContain('Presentation view');
    expect(performanceE2E).toContain('waitForNightOwlReady');
    expect(performanceE2E).toContain('collectAppDiagnostics');
    expect(performanceE2E).toContain('getReadinessRecords');
    expect(performanceE2E).toContain('summarizeSamples');
    expect(performanceE2E).not.toContain('Date.now()');
    expect(performanceE2E).not.toContain('waitForTimeout');
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

  test('routine file, export, and citation logs are debug-gated', () => {
    const files = [
      '../../../ipc/fileHandlers.js',
      '../../../ipc/exportHandlers.js',
      '../../../ipc/citationHandlers.js',
      '../../../services/citationService.js'
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(source).toContain('createDebugLogger');
      expect(source).not.toMatch(/console\.log\s*\(/);
    }
  });

  test('routine launch and research-feed logs are debug-gated', () => {
    const files = [
      '../../../main.js',
      '../../../ipc/index.js',
      '../../../ipc/feedHandlers.js',
      '../../../ipc/aiHandlers.js',
      '../../../ipc/settingsHandlers.js',
      '../../../ipc/ttsHandlers.js',
      '../../../ipc/videoHandlers.js',
      '../../../preload.js',
      '../../../services/feedStore.js',
      '../../../services/feedSources/reddit.js',
      '../../../services/feedSources/mastodon.js',
      '../../../services/imageService.js',
      '../../../plugins/techne-research-feed/feed-panel.js'
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(source).not.toMatch(/console\.log\s*\(/);
    }
  });

  test('current file path writes go through the current-file state helper', () => {
    const files = [
      '../../../orchestrator/renderer.js',
      '../../../orchestrator/modules/editor-tabs.js',
      '../../../orchestrator/modules/current-file-state.js'
    ];

    const assignmentSites = files
      .filter((file) => {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        return /window\.currentFilePath\s*=(?!=)/.test(source);
      })
      .map((file) => file.replace('../../../', ''));

    expect(assignmentSites).toEqual(['orchestrator/modules/current-file-state.js']);
  });

  test('editable file opens sync current path after model swap', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const modelFallbackIndex = rendererSource.indexOf("currentModel.setValue(content)");
    const deferredSyncIndex = rendererSource.indexOf("await setCurrentFilePathState(filePath, { syncMain: true });", modelFallbackIndex);
    const previewIndex = rendererSource.indexOf("const previewResult = await updatePreviewAndStructure(content, {", deferredSyncIndex);

    expect(rendererSource).toContain('const shouldDeferCurrentFileSync = !options.isInternalLinkPreview && !isPDF && !isImageFile');
    expect(rendererSource).toContain('syncCurrentFileAfterModel: shouldDeferCurrentFileSync');
    expect(modelFallbackIndex).toBeGreaterThan(-1);
    expect(deferredSyncIndex).toBeGreaterThan(modelFallbackIndex);
    expect(previewIndex).toBeGreaterThan(deferredSyncIndex);
  });

  test('file opens use a latest-wins transition before asynchronous reads', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const coordinatorSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/file-transition-coordinator.js'), 'utf8');
    const fileOpenSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/file-open-controller.js'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const beginIndex = fileOpenSource.indexOf("const transition = begin(filePath");
    const readIndex = fileOpenSource.indexOf('const result = await readPath(filePath, requestOptions)');

    expect(indexSource.indexOf('orchestrator/modules/file-transition-coordinator.js'))
      .toBeLessThan(indexSource.indexOf('orchestrator/modules/file-open-controller.js'));
    expect(indexSource.indexOf('orchestrator/modules/file-open-controller.js'))
      .toBeLessThan(indexSource.indexOf('orchestrator/renderer.js'));
    expect(beginIndex).toBeGreaterThan(-1);
    expect(readIndex).toBeGreaterThan(beginIndex);
    expect(coordinatorSource).toContain("supersede(channel, reason = 'newer-transition')");
    expect(coordinatorSource).toContain('commit(callback)');
    expect(fileOpenSource).toContain('refreshExistingTabContent: requestOptions.refreshExistingTabContent !== false');
    expect(rendererSource).toContain('fileOpenController.openPath(filePath, options)');
    expect(rendererSource).toContain('fileOpenController.openContent(filePath, content, options)');
    expect(rendererSource).toContain("if (!tab?.isDirty && tab?.model && typeof tab.model.setValue === 'function')");
    expect(rendererSource).toContain('tab.model.setValue(content);');
    expect(rendererSource).toContain('tab.lastSavedContent = content;');
    expect(rendererSource).toContain('window.openFilePathInEditor = openFilePathInEditor;');
    expect(rendererSource).not.toContain('const _queuedOpenFileRequests = new Map();');
    expect(rendererSource).not.toContain('if (_openingFilePath === filePath) return;');
  });

  test('renderer orchestration delegates to injected workflow controllers', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const controllerPaths = [
      'orchestrator/modules/file-open-controller.js',
      'orchestrator/modules/preview-router.js',
      'orchestrator/modules/file-tree-controller.js',
      'orchestrator/modules/pane-controller.js'
    ];

    for (const controllerPath of controllerPaths) {
      expect(indexSource.indexOf(controllerPath)).toBeGreaterThan(-1);
      expect(indexSource.indexOf(controllerPath)).toBeLessThan(indexSource.indexOf('orchestrator/renderer.js'));
    }
    expect(rendererSource).toContain('const outcome = await previewRouter.render(markdownContent, options);');
    expect(rendererSource).toContain('return fileTreeController.render();');
    expect(rendererSource).toContain("return paneController.show(paneType);");
    expect(rendererSource).not.toContain('let fileTreeSignaturePollTimer');
    expect(rendererSource).not.toContain('let _restoringPaneVisibility');
    expect(rendererSource).not.toContain('function beginFileOpenTransition');
  });

  test('Mermaid fullscreen controls clean up transient listeners', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');

    expect(rendererSource).toContain('let mermaidWheelHandler = null;');
    expect(rendererSource).toContain('const detachWheelZoom = () =>');
    expect(rendererSource).toContain("diagramDiv.removeEventListener('wheel', mermaidWheelHandler)");
    expect(rendererSource).toContain('const removeFullscreenListeners = () =>');
    expect(rendererSource).toContain("document.removeEventListener('keydown', overlayEscapeHandler)");
    expect(rendererSource).toContain("overlayElement.removeEventListener('click', overlayClickHandler)");
    expect(rendererSource).not.toContain("wrapper.classList.contains('mermaid-expanded')");
  });

  test('file tree artifact decluttering is explicit and off by default', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const settingsSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/settings.js'), 'utf8');
    const fileHandlersSource = fs.readFileSync(path.join(__dirname, '../../../ipc/fileHandlers.js'), 'utf8');

    expect(mainSource).toContain('hideGeneratedArtifacts: false');
    expect(settingsSource).toContain('declutter-file-tree-artifacts');
    expect(settingsSource).toContain('navigation.hideGeneratedArtifacts');
    expect(fileHandlersSource).toContain('GENERATED_ARTIFACT_EXTENSIONS');
    expect(fileHandlersSource).toContain("appSettings.navigation?.hideGeneratedArtifacts === true");
  });

  test('internal link click handling has no always-on inline debug script', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const internalLinksSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/internalLinks.js'), 'utf8');

    expect(indexSource).not.toContain('[Internal Link] *** GLOBAL SCRIPT LOADED ***');
    expect(indexSource).not.toContain('*** CLICK DETECTED ***');
    expect(internalLinksSource).toContain('window.handleInternalLinkClick = handleInternalLinkClick');
  });

  test('secondary module lazy loading waits for the editor or fallback timeout', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');

    expect(indexSource).toContain('var editorReady = !!(window.editor');
    expect(indexSource).toContain('var fallbackReady = Date.now() - lazyLoadStartedAt > 5000');
    expect(indexSource).not.toContain("window.editor || document.getElementById('editor-container')");
  });

  test('TODO gamification routine logs are debug-gated', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/todo-gamification.js'), 'utf8');

    expect(source).toContain('function logTodoGamification');
    expect(source).toContain("nightowl.debugTodoGamification");
    expect(source).not.toMatch(/console\.log\s*\(/);
  });

  test('presentation service implementations are not duplicated between app and plugin paths', () => {
    const appTts = fs.readFileSync(path.join(__dirname, '../../../services/ttsService.js'), 'utf8');
    const pluginTts = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/ttsService.js'), 'utf8');
    const appVideo = fs.readFileSync(path.join(__dirname, '../../../services/videoRecordingService.js'), 'utf8');
    const pluginVideo = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/videoRecordingService.js'), 'utf8');

    expect(appTts).toContain("../plugins/techne-presentations/ttsService.js");
    expect(appTts).not.toContain('class TTSService');
    expect(pluginTts).toContain('class TTSService');
    expect(appVideo).toContain("../plugins/techne-presentations/videoRecordingService.js");
    expect(appVideo).not.toContain('class VideoRecordingService');
    expect(pluginVideo).toContain('class VideoRecordingService');
  });

  test('presentation runtime handles React 18 and later root APIs consistently', () => {
    const modeSwitcher = fs.readFileSync(path.join(__dirname, '../../../js/mode-switcher.js'), 'utf8');
    const renderer = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const presentationPlugin = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/plugin.js'), 'utf8');
    const presentationPackage = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/package.json'), 'utf8'));

    expect(modeSwitcher).toContain('function getPresentationReactRuntime');
    expect(modeSwitcher).toContain('function renderPresentationComponent');
    expect(modeSwitcher).toContain('runtime.reactDOM.createRoot(container)');
    expect(modeSwitcher).toContain('class PresentationErrorBoundary');
    expect(modeSwitcher).toContain('NO-PRES-CONTENT');
    expect(modeSwitcher).not.toContain('window.ReactDOM.render(window.React.createElement(window.MarkdownPreziApp), presentationRoot)');
    expect(renderer).toContain('window.updateSpeakerNotesDisplay?.();');
    expect(renderer).not.toMatch(/\n\s+updateSpeakerNotesDisplay\(\);/);
    expect(presentationPlugin).toContain('const getReactRuntime = () =>');
    expect(presentationPlugin).toContain('runtime.reactDOM.createRoot(container)');
    expect(presentationPlugin).toContain('runtime.reactDOM.render(element, container)');
    expect(presentationPackage.peerDependencies.react).toBe('>=18 <20');
    expect(presentationPackage.peerDependencies['react-dom']).toBe('>=18 <20');
  });

  test('presentation delivery runtime fits one complete slide without canvas leakage', () => {
    const presentationPlugin = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/plugin.js'), 'utf8');
    const presentationSource = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/src/MarkdownPreziApp.jsx'), 'utf8');
    const presentationRuntime = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/MarkdownPreziApp.js'), 'utf8');
    const presentationCss = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/preview-presentation.css'), 'utf8');

    expect(presentationPlugin).toContain('`${BASE}/presentation-viewport.js`');
    expect(presentationPlugin.indexOf('`${BASE}/presentation-viewport.js`'))
      .toBeLessThan(presentationPlugin.indexOf('`${BASE}/touch-gestures.js`'));

    for (const componentSource of [presentationSource, presentationRuntime]) {
      expect(componentSource).toContain('NightOwlPresentationViewport');
      expect(componentSource).toContain('presentation-current-slide');
      expect(componentSource).toContain('presentation-stage');
      expect(componentSource).toContain('slide-content-frame');
      expect(componentSource).toContain('slide-content-delivery');
      const navigationStart = componentSource.indexOf('goToSlide = useCallback');
      const deliveryGate = componentSource.indexOf('if (!isPresenting)', navigationStart);
      const canvasGate = componentSource.indexOf('if (!canvas)', navigationStart);
      expect(navigationStart).toBeGreaterThan(-1);
      expect(deliveryGate).toBeGreaterThan(navigationStart);
      expect(canvasGate).toBeGreaterThan(deliveryGate);
    }

    expect(presentationSource).toContain('if (isPresenting && !isCurrent) return null');
    expect(presentationSource).toContain('{!isPresenting && (');
    expect(presentationSource).toContain("data-fit-mode={isPresenting ? 'contain' : 'canvas'}");
    expect(presentationSource).toContain('Math.min(frame.clientWidth, element.clientWidth)');
    expect(presentationSource).toContain("transformOrigin: 'top left'");
    expect(presentationSource).not.toContain('presentation-shell w-full h-screen');
    expect(presentationCss).toContain('body.is-presenting #presentation-root .presentation-canvas');
    expect(presentationCss).toContain('body.is-presenting #presentation-root .presentation-stage .presentation-current-slide');
    expect(presentationCss).toContain('body.is-presenting #presentation-root .slide-content-delivery');
  });

  test('presentation and feature assets have one canonical owner', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const presentationPlugin = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/plugin.js'), 'utf8');
    const presentationCss = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-presentations/preview-presentation.css'), 'utf8');

    expect(indexSource).toContain(
      'id="nightowl-presentations-preview-css" rel="stylesheet" href="plugins/techne-presentations/preview-presentation.css"'
    );
    expect(presentationPlugin).toContain("id: `${FEATURE_ID}-preview-css`");
    expect(indexSource).not.toContain('href="css/preview-presentation.css"');
    expect(indexSource).not.toContain('href="css/babel-maze.css"');
    expect(indexSource).not.toContain('orchestrator/modules/unifiedNetwork.js');
    expect(fs.existsSync(path.join(__dirname, '../../../css/preview-presentation.css'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../css/speaker-notes.css'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../css/babel-maze.css'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../orchestrator/modules/unifiedNetwork.js'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../plugins/techne-maze/babel-maze.css'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../../../plugins/techne-network-diagram/unified-network.js'))).toBe(true);
    expect(presentationCss).toContain('#presentation-root .slide-content');
    expect(presentationCss).toContain('#presentation-root .presentation-stage');
    expect(presentationCss).not.toMatch(/^\s*\.slide(?:\s|:|\{|\.|\[)/m);
  });

  test('file pane toolbar remains compact inside the activity sidebar', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');

    expect(indexSource).toContain('#left-sidebar-workspace');
    expect(indexSource).toContain('<div id="left-sidebar-activity" aria-label="Navigation views">');
    expect(indexSource).not.toContain('<aside id="left-sidebar-activity"');
    expect(indexSource).toContain('width: 312px;');
    expect(indexSource).toContain('flex: 0 0 312px;');
    expect(indexSource).toContain('flex: 0 0 48px;');
    expect(indexSource).toContain('min-width: 0;');
    expect(indexSource).toContain('container-type: inline-size;');
    expect(indexSource).toContain('class="btn pane-action-btn"');
    expect(indexSource).toContain('width: 26px !important;');
    expect(indexSource).toContain('border: 1px solid transparent !important;');
    expect(indexSource).toContain('aria-label="Add existing folder to workspace"');
    expect(indexSource).toContain('aria-label="Change the primary working directory"');
    expect(indexSource).toContain('aria-label="Create a new subfolder inside selected folder"');
    expect(indexSource).not.toContain('pane-action-label');
    expect(indexSource).not.toContain('>Add Root</button>');
    expect(indexSource).not.toContain('>Primary</button>');
    expect(indexSource).not.toContain('>New Folder</button>');
  });

  test('right pane assistant surface is terminal-first, not bespoke AI chat', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const assistantTerminalSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/assistant-terminal.js'), 'utf8');
    const terminalHandlersSource = fs.readFileSync(path.join(__dirname, '../../../ipc/terminalHandlers.js'), 'utf8');

    expect(indexSource).toContain('id="assistant-terminal-output"');
    expect(indexSource).toContain('id="assistant-launch-codex"');
    expect(indexSource).toContain('id="assistant-launch-claude"');
    expect(indexSource).toContain('id="assistant-launch-gemini"');
    expect(indexSource).toContain('orchestrator/modules/assistant-terminal.js');
    expect(indexSource).not.toContain('id="chat-input"');
    expect(indexSource).not.toContain('id="chat-messages"');
    expect(indexSource).not.toContain('id="attach-image-btn"');
    expect(indexSource).not.toContain('Ask Dr Chen anything');
    expect(rendererSource).toContain('Assistant terminal is lazy-loaded');
    expect(rendererSource).not.toContain('window.initializeChatFunctionality');
    expect(assistantTerminalSource).toContain("const SESSION_ID = 'assistant'");
    expect(assistantTerminalSource).toContain('launchAssistant');
    expect(assistantTerminalSource).toContain("const XTERM_SCRIPT = 'node_modules/@xterm/xterm/lib/xterm.js'");
    expect(assistantTerminalSource).toContain("const FIT_SCRIPT = 'node_modules/@xterm/addon-fit/lib/addon-fit.js'");
    expect(assistantTerminalSource).toContain('disableAmdForUmdScript');
    expect(assistantTerminalSource).toContain('window.define = undefined');
    expect(assistantTerminalSource).toContain('defineFn.amd = undefined');
    expect(assistantTerminalSource).toContain('getTerminalConstructor');
    expect(assistantTerminalSource).toContain('flushQueuedTerminalOutput');
    expect(assistantTerminalSource).toContain('scheduleTerminalPreload');
    expect(assistantTerminalSource).toContain('scheduleTerminalFit');
    expect(assistantTerminalSource).toContain('observeThemeChanges');
    expect(assistantTerminalSource).toContain('restartShellForTerminalInput');
    expect(assistantTerminalSource).toContain("codex: { command: 'codex'");
    expect(assistantTerminalSource).toContain("claude: { command: 'claude'");
    expect(assistantTerminalSource).toContain("gemini: { command: 'gemini'");
    expect(terminalHandlersSource).toContain('function normalizeSessionId');
    expect(terminalHandlersSource).toContain('function getShellSpawnConfig');
    expect(terminalHandlersSource).toContain('terminal-resize');
    expect(terminalHandlersSource).toContain('NIGHTOWL_TERMINAL');
  });

  test('external Techne plugin sync workflow is retired', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
    const packageLock = fs.readFileSync(path.join(__dirname, '../../../package-lock.json'), 'utf8');
    const claudeNotes = fs.readFileSync(path.join(__dirname, '../../../CLAUDE.md'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const featureLoaderSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/feature-loader.js'), 'utf8');
    const modeSwitcherSource = fs.readFileSync(path.join(__dirname, '../../../js/mode-switcher.js'), 'utf8');

    expect(packageJson.scripts['sync-plugins']).toBeUndefined();
    expect(packageJson.scripts.postinstall).toBeUndefined();
    expect(packageJson.devDependencies['@machinespirits/techne-plugins']).toBeUndefined();
    expect(packageLock).not.toContain('@machinespirits/techne-plugins');
    expect(packageLock).not.toContain('sync-techne-plugins');
    expect(claudeNotes).toContain('source-of-truth workflow has been retired');
    expect(indexSource).toContain('orchestrator/modules/feature-loader.js');
    expect(indexSource).not.toContain('techne-plugin-system.js');
    expect(indexSource).not.toContain('plugins/manifest.js');
    expect(featureLoaderSource).toContain('window.NightOwlFeatures');
    expect(featureLoaderSource).not.toContain('window.TechnePlugins');
    expect(modeSwitcherSource).toContain('window.NightOwlFeatures');
    expect(modeSwitcherSource).not.toContain('window.TechnePlugins');
    expect(fs.existsSync(path.join(__dirname, '../../../plugins/techne-plugin-system.js'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../plugins/manifest.js'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../docs/PLUGINS.md'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../plugins/techne-presentations/sync.sh'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../docs/refactoring/assistant-terminal-and-feature-migration.md'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../docs/refactoring/AI_COMPANION_REFACTORING_SUMMARY.md'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../docs/samples/sample-todo.md'))).toBe(false);
    expect(featureLoaderSource).toContain("'nightowl-presentations'");
    expect(featureLoaderSource).toContain("'techne-presentations': 'nightowl-presentations'");
    expect(modeSwitcherSource).toContain("'nightowl-maze'");
  });

  test('mac distribution build has hardened-runtime preflight checks', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
    const distCheckSource = fs.readFileSync(path.join(__dirname, '../../../scripts/check-distribution-readiness.js'), 'utf8');

    expect(packageJson.scripts['dist:check']).toContain('npm run presentation:check');
    expect(packageJson.scripts['dist:check']).toContain('node scripts/check-distribution-readiness.js');
    expect(packageJson.scripts.predist).toBe('npm run dist:check');
    expect(packageJson.build.mac.hardenedRuntime).toBe(true);
    expect(packageJson.build.mac.gatekeeperAssess).toBe(false);
    expect(packageJson.build.mac.entitlements).toBe('build/entitlements.mac.plist');
    expect(packageJson.build.mac.entitlementsInherit).toBe('build/entitlements.mac.plist');
    expect(fs.existsSync(path.join(__dirname, '../../../build/entitlements.mac.plist'))).toBe(true);
    expect(distCheckSource).toContain('NIGHTOWL_REQUIRE_SIGNING_IDENTITY');
    expect(distCheckSource).toContain('NIGHTOWL_REQUIRE_NOTARIZATION_CREDS');
  });

  test('assistant terminal has a real PTY backend with pipe fallback', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
    const assistantTerminalSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/assistant-terminal.js'), 'utf8');
    const terminalHandlersSource = fs.readFileSync(path.join(__dirname, '../../../ipc/terminalHandlers.js'), 'utf8');

    expect(packageJson.dependencies['@xterm/xterm']).toBeDefined();
    expect(packageJson.dependencies['@xterm/addon-fit']).toBeDefined();
    expect(packageJson.dependencies['node-pty']).toBeDefined();
    expect(packageJson.scripts['native:rebuild']).toContain('node-pty');
    expect(assistantTerminalSource).toContain('new TerminalCtor');
    expect(assistantTerminalSource).toContain('resizeActiveTerminal');
    expect(terminalHandlersSource).toContain("require('node-pty')");
    expect(terminalHandlersSource).toContain('createPtySession');
    expect(terminalHandlersSource).toContain('createPipeSession');
    expect(terminalHandlersSource).toContain("backend: 'pty'");
    expect(terminalHandlersSource).toContain("backend: 'pipe'");
  });

  test('file tree has lightweight disk polling before expensive refreshes', () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const controllerSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/file-tree-controller.js'), 'utf8');
    const fileHandlersSource = fs.readFileSync(path.join(__dirname, '../../../ipc/fileHandlers.js'), 'utf8');
    const preloadGuardSource = fs.readFileSync(path.join(__dirname, '../../../preload-ipc-guard.js'), 'utf8');

    expect(controllerSource).toContain('const pollMs = options.pollMs || 4000');
    expect(controllerSource).toContain('async function pollOnce()');
    expect(controllerSource).toContain('requestSignature()');
    expect(controllerSource).toContain('onSignatureChanged');
    expect(rendererSource).toContain('pollFileTreeSignatureOnce');
    expect(rendererSource).toContain("window.currentStructureView === 'file'");
    expect(rendererSource).toContain("document.visibilityState === 'hidden'");
    expect(fileHandlersSource).toContain("ipcMain.handle('get-file-tree-signature'");
    expect(fileHandlersSource).toContain('getWorkspaceTreeSignature');
    expect(preloadGuardSource).toContain("'get-file-tree-signature'");
  });

  test('startup chrome keeps basic accessibility affordances', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const accessibilityCss = fs.readFileSync(path.join(__dirname, '../../../css/accessibility.css'), 'utf8');
    const presentationSource = fs.readFileSync(
      path.join(__dirname, '../../../plugins/techne-presentations/src/MarkdownPreziApp.jsx'),
      'utf8'
    );
    const presentationCss = fs.readFileSync(
      path.join(__dirname, '../../../plugins/techne-presentations/preview-presentation.css'),
      'utf8'
    );

    expect(indexSource).toContain('css/accessibility.css');
    expect(indexSource).toContain("el.setAttribute('aria-label', title)");
    expect(indexSource).toContain('role="group" aria-label="Application mode"');
    expect(indexSource).toContain('id="format-inline-math-btn"');
    expect(indexSource).toContain('aria-label="Inline Math"');
    expect(indexSource).toContain('id="format-display-math-btn"');
    expect(indexSource).toContain('aria-label="Display Math"');
    expect(indexSource).toContain('id="current-file-name"');
    expect(indexSource).toContain('role="separator" aria-label="Resize speaker notes"');
    expect(accessibilityCss).toContain(':focus-visible');
    expect(presentationSource).toContain('aria-roledescription="slide"');
    expect(presentationSource).toContain('aria-label="Slide navigation"');
    expect(presentationSource).toContain('className="presentation-connection-lines');
    expect(presentationCss).not.toMatch(/body\.is-presenting\s+svg\s*\{/);
    expect(presentationCss).not.toMatch(/\.cursor-grab\s+svg/);
    expect(indexSource).not.toContain('id="current-file-name" class="breadcrumb-segment" style="color: var(--text-muted, #999);"');
    expect(mainSource).toContain("process.env.NIGHTOWL_OPEN_DEVTOOLS === '1'");
    expect(mainSource).not.toContain("accelerator: 'CmdOrCtrl+K CmdOrCtrl");
  });

  test('managed Techne themes cover legacy NightOwl chrome', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '../../../index.html'), 'utf8');
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const adapterSource = fs.readFileSync(path.join(__dirname, '../../../css/techne-theme-adapter.css'), 'utf8');
    const featureLoaderSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/feature-loader.js'), 'utf8');

    expect(indexSource).toContain('css/techne-theme-adapter.css');
    expect(indexSource).toContain('plugins/techne-theme-manager/techne-tokens.css');
    expect(indexSource).toContain('plugins/techne-theme-manager/themes.js');
    expect(indexSource).toContain('plugins/techne-theme-manager/theme-manager.js');
    expect(rendererSource).toContain('function initializeNativeThemeManager');
    expect(rendererSource).toContain('window.techneThemeManager._init(host)');
    expect(featureLoaderSource).not.toContain('techne-theme-manager');
    expect(rendererSource).toContain('const MANAGED_THEME_FALLBACKS');
    expect(rendererSource).toContain("'solarized-light'");
    expect(rendererSource).toContain("body.setAttribute('data-techne-theme', preference)");
    expect(adapterSource).toContain('--primary-wcag: var(--techne-accent-active)');
    expect(adapterSource).toContain('--primary-500: var(--techne-accent)');
    expect(adapterSource).toContain('--neutral-0: var(--techne-bg)');
    expect(adapterSource).toContain('--activity-bar-bg: var(--techne-surface)');
    expect(adapterSource).toContain('--folder-icon-fill');
    expect(adapterSource).toContain('body[data-techne-theme] #left-sidebar-activity');
    expect(adapterSource).toContain('body[data-techne-theme] #left-sidebar-activity .pane-toggle-button.active');
    expect(adapterSource).toContain('body[data-techne-theme] #editor-status-bar');
    expect(adapterSource).toContain('body[data-techne-theme] .toolbar-separator');
    expect(adapterSource).toContain('body[data-techne-theme] #statistics-pane');
    expect(adapterSource).toContain('body[data-techne-theme] .statistics-card');
    expect(adapterSource).toContain('body[data-techne-theme] .stats-scope-btn.active');
    expect(adapterSource).toContain('body[data-techne-theme] #chat-pane');
    expect(adapterSource).toContain('body[data-techne-theme] #assistant-terminal-output.xterm-host');
    expect(adapterSource).toContain('body[data-techne-theme] #integrated-terminal');
    expect(adapterSource).toContain('body[data-techne-theme] #terminal-panel-header');
    expect(adapterSource).toContain('body[data-techne-theme] #editor-mode-btn.active');
    expect(adapterSource).toContain('body[data-techne-theme] #show-preview-btn.active');
    expect(adapterSource).toContain('body[data-techne-theme] .mode-btn.active');
    expect(adapterSource).toContain('body[data-techne-theme] .pane-visibility-btn');
    expect(adapterSource).toContain('body[data-techne-theme] .file-tree-item.current-file');
    expect(adapterSource).toContain('body[data-techne-theme] #flow-indicator.flow-struggling');
    expect(adapterSource).toContain('body[data-techne-theme] .flow-indicator.flow-struggling');
    expect(adapterSource).toContain('body[data-techne-theme] .ai-flow-indicator.flow-struggling');
  });

  test('Techne blur and bloom effects are opt-in', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const rendererSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    const settingsSource = fs.readFileSync(path.join(__dirname, '../../../orchestrator/modules/settings.js'), 'utf8');
    const techneCss = fs.readFileSync(path.join(__dirname, '../../../css/techne-theme.css'), 'utf8');
    const backdropCss = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-backdrop/techne-backdrop-layers.css'), 'utf8');
    const backdropMarkup = fs.readFileSync(path.join(__dirname, '../../../plugins/techne-backdrop/techne-backdrop-markup.js'), 'utf8');

    expect(mainSource).toContain('blurBloom: false');
    expect(mainSource).toContain('const blurBloom = appSettings.techne.blurBloom === true');
    expect(rendererSource).toContain("'techne-bloom-on'");
    expect(rendererSource).toContain('const blurBloomOn = techne.blurBloom === true');
    expect(settingsSource).toContain('id="techne-blur-bloom-enabled"');
    expect(settingsSource).toContain('window.appSettings.techne.blurBloom = blurBloom');
    expect(techneCss).toContain('body.techne-theme.techne-bloom-on #mode-switcher');
    expect(techneCss).toContain('backdrop-filter: none;');
    expect(backdropCss).toContain('body.techne-theme.techne-bloom-on #techne-background .glass');
    expect(backdropCss).toContain('backdrop-filter: blur(var(--glass-blur-lg));');
    expect(backdropMarkup).not.toContain('id="mobileMenu"');
  });
});
