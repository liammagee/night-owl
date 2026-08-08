// Mode Switching Functions
// Handles switching between editor, presentation, network, circle, and library modes

// Application mode is owned by the shared UI state store. CommonJS tests load
// a fresh store; the packaged renderer receives the instance from index.html.
const uiStateStore = (typeof module !== 'undefined' && module.exports)
  ? require('../orchestrator/modules/ui-state-store').store
  : window.NightOwlUIState;

function getCurrentMode() {
  return uiStateStore?.getState?.().mode || 'editor';
}

let presentationEditorContent = '';
let presentationLoadNonce = 0;
let presentationLoadController = null;
const presentationReactRoots = new WeakMap();

const PRESENTATION_DIAGNOSTICS = {
  feature: 'NO-PRES-FEATURE',
  runtime: 'NO-PRES-RUNTIME',
  render: 'NO-PRES-RENDER',
  content: 'NO-PRES-CONTENT'
};

function recordPresentationFailure(diagnosticId, correlationId, error, context = {}) {
  if (window.NightOwlDiagnostics?.logger) {
    return window.NightOwlDiagnostics.logger('presentation').error(
      diagnosticId,
      error,
      context,
      { correlationId, state: 'failed' }
    );
  }
  console.error(`[Mode Switching] ${diagnosticId} [${correlationId}]:`, error);
  return {
    id: correlationId,
    correlationId,
    code: diagnosticId,
    state: 'failed',
    message: error?.message || String(error || 'Presentation failed')
  };
}

function logPresentationWarning(code, error, context = {}) {
  if (window.NightOwlDiagnostics?.logger) {
    return window.NightOwlDiagnostics.logger('presentation').warn(code, error, context, { state: 'degraded' });
  }
  console.warn(`[Mode Switching] ${code}:`, error);
  return null;
}

function getPresentationReactRuntime() {
  const react = window.React;
  const reactDOM = window.ReactDOM;
  const canCreateElement = typeof react?.createElement === 'function';
  const canCreateRoot = typeof reactDOM?.createRoot === 'function';
  const canLegacyRender = typeof reactDOM?.render === 'function';

  if (!canCreateElement || (!canCreateRoot && !canLegacyRender)) {
    return null;
  }

  return {
    react,
    reactDOM,
    canCreateRoot,
    canLegacyRender
  };
}

function createPresentationErrorBoundary(runtime, onError) {
  if (typeof runtime.react.Component !== 'function') return null;

  return class PresentationErrorBoundary extends runtime.react.Component {
    constructor(props) {
      super(props);
      this.state = { failed: false };
    }

    static getDerivedStateFromError() {
      return { failed: true };
    }

    componentDidCatch(error) {
      onError(error, PRESENTATION_DIAGNOSTICS.render);
    }

    render() {
      return this.state.failed ? null : this.props.children;
    }
  };
}

function renderPresentationComponent(container, options = {}) {
  const runtime = getPresentationReactRuntime();
  if (!runtime || !window.MarkdownPreziApp) {
    return false;
  }

  const onError = typeof options.onError === 'function' ? options.onError : () => {};
  const presentationElement = runtime.react.createElement(window.MarkdownPreziApp, {
    markdown: options.content || '',
    onPresentationError: (error) => onError(error, PRESENTATION_DIAGNOSTICS.content)
  });
  const ErrorBoundary = createPresentationErrorBoundary(runtime, onError);
  const element = ErrorBoundary
    ? runtime.react.createElement(ErrorBoundary, null, presentationElement)
    : presentationElement;

  if (runtime.canCreateRoot) {
    let root = presentationReactRoots.get(container);
    if (!root) {
      root = runtime.reactDOM.createRoot(container);
      presentationReactRoots.set(container, root);
    }
    root.render(element);
    return true;
  }

  runtime.reactDOM.render(element, container);
  return true;
}

function unmountPresentationComponent(container) {
  const runtime = getPresentationReactRuntime();
  const root = presentationReactRoots.get(container);
  if (root) {
    try {
      root.unmount();
    } catch (error) {
      logPresentationWarning('NO-PRES-UNMOUNT', error);
    }
    presentationReactRoots.delete(container);
    return;
  }

  if (runtime?.canLegacyRender) {
    try {
      runtime.reactDOM.unmountComponentAtNode?.(container);
    } catch (error) {
      logPresentationWarning('NO-PRES-LEGACY-UNMOUNT', error);
    }
  }
}

function renderPresentationLoadState(container, state, options = {}) {
  container.dataset.presentationLoadState = state;
  container.dataset.viewState = state;
  if (options.incident?.correlationId) {
    container.dataset.correlationId = options.incident.correlationId;
  } else {
    delete container.dataset.correlationId;
  }
  container.replaceChildren();

  if (state === 'cancelled' || state === 'ready') return;

  const panel = document.createElement('div');
  panel.className = `presentation-load-state presentation-load-${state}`;
  panel.setAttribute('role', state === 'failed' ? 'alert' : 'status');
  panel.style.padding = '24px';
  panel.style.maxWidth = '560px';

  const title = document.createElement('strong');
  title.textContent = state === 'loading'
    ? 'Loading presentation…'
    : 'Presentation could not be loaded';
  panel.appendChild(title);

  if (state === 'failed') {
    const detail = document.createElement('p');
    detail.textContent = options.message || 'The presentation renderer stopped unexpectedly.';
    panel.appendChild(detail);

    const diagnostic = document.createElement('code');
    diagnostic.className = 'presentation-load-diagnostic';
    diagnostic.textContent = [
      `Diagnostic: ${options.diagnosticId || PRESENTATION_DIAGNOSTICS.render}`,
      `Incident: ${options.incident?.correlationId || 'unavailable'}`
    ].join(' · ');
    panel.appendChild(diagnostic);

    const actions = document.createElement('div');
    actions.className = 'view-error-actions';
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.marginTop = '16px';

    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'presentation-load-retry';
    retryButton.textContent = 'Retry';
    retryButton.addEventListener('click', () => options.onRetry?.());
    actions.appendChild(retryButton);

    const returnButton = document.createElement('button');
    returnButton.type = 'button';
    returnButton.className = 'presentation-load-return';
    returnButton.textContent = 'Return to Editor';
    returnButton.addEventListener('click', () => options.onReturn?.());
    actions.appendChild(returnButton);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'presentation-load-reset';
    resetButton.textContent = 'Reset View';
    resetButton.addEventListener('click', () => options.onReset?.());
    actions.appendChild(resetButton);

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'presentation-load-copy';
    copyButton.textContent = 'Copy diagnostics';
    copyButton.addEventListener('click', async () => {
      try {
        const result = await window.NightOwlDiagnostics?.copyReport?.({ incidentId: options.incident?.id });
        copyButton.textContent = result?.success ? 'Copied' : 'Copy unavailable';
      } catch (_error) {
        copyButton.textContent = 'Copy failed';
      }
    });
    actions.appendChild(copyButton);

    const detailsButton = document.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'presentation-load-details';
    detailsButton.textContent = 'View diagnostics';
    detailsButton.addEventListener('click', () => {
      window.NightOwlDiagnostics?.open?.({ incidentId: options.incident?.id });
    });
    actions.appendChild(detailsButton);
    panel.appendChild(actions);
  }

  container.appendChild(panel);
}

function cancelPresentationLoad(options = {}) {
  presentationLoadNonce += 1;
  presentationLoadController?.abort();
  presentationLoadController = null;

  const container = options.container || document.getElementById('presentation-root');
  if (options.markCancelled !== false && container?.dataset.presentationLoadState === 'loading') {
    renderPresentationLoadState(container, 'cancelled');
  }
}

function ensurePresentationsReady(timeoutMs = 8000, options = {}) {
  const isReady = () =>
    Boolean(window.MarkdownPreziApp) &&
    typeof window.showSpeakerNotesPanel === 'function' &&
    typeof window.hideSpeakerNotesPanel === 'function';

  if (options.signal?.aborted) return Promise.resolve(false);
  if (isReady()) return Promise.resolve(true);

  const startFeaturesBestEffort = async () => {
    if (!window.NightOwlFeatures?.start) return;
    try {
      await window.NightOwlFeatures.start({
        appId: 'nightowl',
        enabled: window.appSettings?.features || null,
        settings: window.appSettings?.features || null
      });
    } catch (error) {
      logPresentationWarning('NO-PRES-FEATURE-START', error);
    }
  };

  return new Promise((resolve) => {
    let finished = false;
    let unsubscribe = null;
    let intervalId = null;
    let timeoutId = null;

    const onAbort = () => finish(false);

    const finish = (ok) => {
      if (finished) return;
      finished = true;
      if (unsubscribe) unsubscribe();
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onAbort);
      resolve(ok);
    };

    const check = () => {
      if (isReady()) finish(true);
    };

    if (window.NightOwlFeatures?.on) {
      unsubscribe = window.NightOwlFeatures.on('presentations:ready', () => check());
    }

    options.signal?.addEventListener('abort', onAbort, { once: true });
    intervalId = setInterval(check, 50);
    timeoutId = setTimeout(() => finish(isReady()), timeoutMs);

    startFeaturesBestEffort();
    check();
  });
}

function getPresentationSourceContent() {
  let content = '';

  if (typeof getCurrentEditorContent === 'function') {
    try {
      content = getCurrentEditorContent();
    } catch (error) {
      logPresentationWarning('NO-PRES-EDITOR-CONTENT', error);
    }
  }

  if (!content && typeof window.editor?.getValue === 'function') {
    try {
      content = window.editor.getValue();
    } catch (error) {
      logPresentationWarning('NO-PRES-EDITOR-VALUE', error);
    }
  }

  return content || window.pendingPresentationContent || presentationEditorContent || '';
}

function startPresentationLoad(container, options = {}) {
  if (!container) return Promise.resolve('failed');

  cancelPresentationLoad({ container, markCancelled: false });
  unmountPresentationComponent(container);
  const controller = new AbortController();
  presentationLoadController = controller;
  const nonce = presentationLoadNonce;
  const correlationId = String(
    options.correlationId ||
    window.NightOwlDiagnostics?.createCorrelationId?.('presentation') ||
    `NO-PRESENTATION-${Date.now().toString(36).toUpperCase()}-${nonce}`
  );
  const content = options.content ?? getPresentationSourceContent();
  renderPresentationLoadState(container, 'loading');
  let failureHandled = false;

  const isCurrent = () =>
    !controller.signal.aborted &&
    nonce === presentationLoadNonce &&
    getCurrentMode() === 'presentation';

  const fail = (diagnosticId, error, message) => {
    if (!isCurrent()) return 'cancelled';
    if (failureHandled) return 'failed';
    failureHandled = true;
    presentationLoadController = null;
    const incident = recordPresentationFailure(diagnosticId, correlationId, error, {
      diagnosticId,
      loadNonce: nonce,
      timeoutMs: options.timeoutMs ?? 8000
    });
    unmountPresentationComponent(container);
    renderPresentationLoadState(container, 'failed', {
      diagnosticId,
      incident,
      message,
      onRetry: () => startPresentationLoad(container, {
        content: getPresentationSourceContent(),
        timeoutMs: options.timeoutMs
      }),
      onReturn: () => switchToMode('editor'),
      onReset: () => {
        cancelPresentationLoad({ container, markCancelled: false });
        unmountPresentationComponent(container);
        delete window.targetPresentationSlide;
        renderPresentationLoadState(container, 'cancelled');
        switchToMode('editor');
      }
    });
    return 'failed';
  };

  const reportAsyncFailure = (error, diagnosticId) => {
    Promise.resolve().then(() => {
      fail(
        diagnosticId,
        error,
        diagnosticId === PRESENTATION_DIAGNOSTICS.content
          ? 'The slide content could not be parsed. Fix the source or retry after editing.'
          : 'The presentation renderer stopped unexpectedly. Retry to remount it.'
      );
    });
  };

  return (async () => {
    const ready = await ensurePresentationsReady(options.timeoutMs ?? 8000, {
      signal: controller.signal
    });

    if (!isCurrent()) {
      if (container.dataset.presentationLoadState === 'loading') {
        renderPresentationLoadState(container, 'cancelled');
      }
      return 'cancelled';
    }

    if (!ready) {
      return fail(
        PRESENTATION_DIAGNOSTICS.feature,
        new Error('Presentation feature readiness timed out'),
        'The presentation feature did not finish loading. Check the feature settings and retry.'
      );
    }

    if (!getPresentationReactRuntime() || !window.MarkdownPreziApp) {
      return fail(
        PRESENTATION_DIAGNOSTICS.runtime,
        new Error('React presentation globals are unavailable'),
        'The presentation runtime is unavailable. Retry to reload its assets.'
      );
    }

    try {
      const rendered = renderPresentationComponent(container, {
        content,
        onError: reportAsyncFailure
      });
      if (!rendered) {
        return fail(
          PRESENTATION_DIAGNOSTICS.runtime,
          new Error('Presentation component was not mounted'),
          'The presentation runtime is unavailable. Retry to reload its assets.'
        );
      }
    } catch (error) {
      return fail(
        PRESENTATION_DIAGNOSTICS.render,
        error,
        'The presentation renderer stopped unexpectedly. Retry to remount it.'
      );
    }

    if (!isCurrent()) return 'cancelled';
    container.dataset.presentationLoadState = 'ready';
    container.dataset.viewState = 'ready';
    delete container.dataset.correlationId;
    presentationLoadController = null;
    window.showSpeakerNotesPanel?.(content);
    return 'ready';
  })();
}

function jumpToSlideInEditor(slideIndex) {
  console.log('[Mode Switching] Jumping to slide', slideIndex, 'in editor');
  
  if (!window.editor || !window.goToLine) {
    console.warn('[Mode Switching] Editor or goToLine function not available');
    return;
  }
  
  try {
    // Get the current editor content
    const content = window.editor.getValue();
    if (!content) {
      console.warn('[Mode Switching] No content available in editor');
      return;
    }
    
    // Split content by slide separators (--- on standalone lines)
    // Match --- that is either at start/end of string or surrounded by newlines
    // but NOT part of a table (which would have | characters on the same line)
    const slideSeparatorRegex = /(?:^|\n)---(?:\n|$)/;
    const slides = content.split(slideSeparatorRegex).filter(s => s.trim());
    
    if (slideIndex >= slides.length) {
      console.warn('[Mode Switching] Slide index', slideIndex, 'exceeds available slides', slides.length);
      return;
    }
    
    // Calculate line number by counting lines before the target slide
    let lineNumber = 1;
    for (let i = 0; i < slideIndex; i++) {
      // Count lines in this slide plus the separator line
      const slideLines = slides[i].split('\n').length;
      lineNumber += slideLines;
      if (i > 0) lineNumber += 1; // Add separator line (--- takes 1 line)
    }
    
    // Add a few lines to account for any extra whitespace after separators
    if (slideIndex > 0) {
      lineNumber += 1;
    }
    
    console.log('[Mode Switching] Calculated line number:', lineNumber, 'for slide', slideIndex);
    
    // Jump to the calculated line
    window.goToLine(lineNumber);
    
  } catch (error) {
    console.error('[Mode Switching] Error jumping to slide in editor:', error);
  }
}

function calculateSlideFromCursor() {
  console.log('[Mode Switching] Calculating slide from cursor position');
  
  if (!window.editor) {
    console.warn('[Mode Switching] Editor not available');
    return 0;
  }
  
  try {
    // Get current cursor position
    const position = window.editor.getPosition();
    if (!position) {
      console.warn('[Mode Switching] Could not get cursor position');
      return 0;
    }
    
    const currentLine = position.lineNumber;
    console.log('[Mode Switching] Current cursor line:', currentLine);
    
    // Get the current editor content
    const content = window.editor.getValue();
    if (!content) {
      console.warn('[Mode Switching] No content available in editor');
      return 0;
    }
    
    // Split content by slide separators (--- on standalone lines)
    // Match --- that is either at start/end of string or surrounded by newlines
    // but NOT part of a table (which would have | characters on the same line)
    const slideSeparatorRegex = /(?:^|\n)---(?:\n|$)/;
    const slides = content.split(slideSeparatorRegex).filter(s => s.trim());
    console.log('[Mode Switching] Found', slides.length, 'slides');
    
    // Calculate which slide the cursor is in by counting lines
    let accumulatedLines = 0;
    
    for (let i = 0; i < slides.length; i++) {
      const slideLines = slides[i].split('\n').length;
      
      // Add separator line count (except for first slide)
      if (i > 0) {
        accumulatedLines += 1; // separator line
      }
      
      // Check if current line falls within this slide
      const slideStart = accumulatedLines + 1;
      const slideEnd = accumulatedLines + slideLines;
      
      console.log('[Mode Switching] Slide', i, 'lines:', slideStart, 'to', slideEnd);
      
      if (currentLine >= slideStart && currentLine <= slideEnd) {
        console.log('[Mode Switching] Cursor is in slide', i);
        return i;
      }
      
      accumulatedLines += slideLines;
    }
    
    // If we didn't find a match, assume last slide
    const lastSlide = Math.max(0, slides.length - 1);
    console.log('[Mode Switching] Cursor beyond all slides, using last slide:', lastSlide);
    return lastSlide;
    
  } catch (error) {
    console.error('[Mode Switching] Error calculating slide from cursor:', error);
    return 0;
  }
}

function restoreUIElementsAfterPresentation() {
  console.log('[Mode Switching] Restoring UI elements after presentation mode');
  uiStateStore?.render?.();
  uiStateStore?.afterTransition?.(() => {
    window.editor?.focus?.();
    console.log('[Mode Switching] UI restoration completed');
  });
}

function switchToMode(modeName) {
  console.log('[Mode Switching] Switching to:', modeName);

  const previousMode = getCurrentMode();
  const nextState = uiStateStore?.dispatch?.({ type: 'SET_MODE', mode: modeName });
  if (!nextState || nextState.mode !== modeName) {
    console.error('[Mode Switching] Ignoring unsupported mode:', modeName);
    return false;
  }

  // Cancel any in-flight presentation load when leaving presentation mode
  if (modeName !== 'presentation') {
    cancelPresentationLoad();
  }

  // Handle mode-specific logic
  if (modeName === 'presentation') {
    // Calculate which slide to jump to based on cursor position if coming from editor
    let targetSlide = 0;
    if (previousMode === 'editor') {
      targetSlide = calculateSlideFromCursor();
      console.log('[Mode Switching] Calculated target slide from cursor:', targetSlide);
      console.log('[Mode Switching] Current mode was:', previousMode, ', switching to presentation with target slide:', targetSlide);
    }
    
    // Store target slide for React component to pick up
    if (targetSlide > 0) {
      window.targetPresentationSlide = targetSlide;
      console.log('[Mode Switching] Set window.targetPresentationSlide to:', targetSlide);
    }
    
    const currentContent = getPresentationSourceContent();

    // Ensure React component is rendered. A fresh mount receives the Markdown as
    // a prop; an existing mount receives one update event. Keeping those paths
    // separate prevents the same document from being parsed twice on entry.
    const presentationRoot = document.getElementById('presentation-root');
    if (presentationRoot) {
      const alreadyMounted = presentationRoot.dataset.presentationLoadState === 'ready';
      if (alreadyMounted && window.MarkdownPreziApp) {
        console.log('[Mode Switching] Presentation component already mounted, reusing');
        if (currentContent) {
          window.syncContentToPresentationImmediate?.(currentContent);
        }
        window.showSpeakerNotesPanel?.(currentContent);
      } else {
        startPresentationLoad(presentationRoot, { content: currentContent });
      }
    }
  } else if (modeName === 'network') {
    window.hideSpeakerNotesPanel?.();
    
    // Initialize unified network visualization
    console.log('[Mode Switching] Initializing unified network visualization');
    if (window.UnifiedNetworkVisualization) {
      const networkContainer = document.getElementById('network-content');
      if (networkContainer && !window.unifiedNetworkInstance) {
        window.unifiedNetworkInstance = new window.UnifiedNetworkVisualization();
        window.unifiedNetworkInstance.initialize(networkContainer);
      } else if (window.unifiedNetworkInstance) {
        // Just refresh if already exists
        window.unifiedNetworkInstance.refresh();
      }
    }
  } else if (modeName === 'circle') {
    window.hideSpeakerNotesPanel?.();
    
    // Initialize circle visualization
    console.log('[Mode Switching] Initializing circle visualization');
    const circleContainer = document.getElementById('circle-visualization');
    if (circleContainer && window.initializeCircleVisualization) {
      window.initializeCircleVisualization();
    }
  } else if (modeName === 'library') {
    window.hideSpeakerNotesPanel?.();

    // Try to use the feature-provided maze mode first
    const mazeMode = window.__nightOwlAvailableModes?.['maze'] ||
      window.__nightOwlAvailableModes?.['library'] ||
      window.__techneAvailableModes?.['maze'] ||
      window.__techneAvailableModes?.['library'];
    const container = document.getElementById('library-mode-root');

    if (mazeMode && container) {
      // Use the feature's mount function
      if (!window._mazeViewInstance) {
        mazeMode.mount(container, {
          gamification: window.gamificationInstance || window.gamificationManager
        }).then(view => {
          window._mazeViewInstance = view;
          console.log('[Mode Switching] Maze feature mounted');
        }).catch(err => {
          console.warn('[Mode Switching] Failed to mount maze feature:', err);
        });
      }
    } else {
      // Fallback to gamification explorerView if the feature is not available
      const explorer =
        (window.gamificationInstance && window.gamificationInstance.explorerView) ||
        (window.gamificationManager && window.gamificationManager.explorerView) ||
        null;
      if (explorer && typeof explorer.ensureContainer === 'function') {
        const explorerContainer = explorer.ensureContainer();
        if (explorerContainer && typeof explorer.renderMaze === 'function') {
          try {
            const world =
              explorer.currentWorldState &&
              Object.keys(explorer.currentWorldState).length
                ? explorer.currentWorldState
                : explorer.gamification?.worldEngine?.getWorldState?.() || {};
            explorer.renderMaze(world);
          } catch (error) {
            console.warn('[Mode Switching] Failed to render maze on library mode switch:', error);
          }
        }
      }
    }
  } else {
    // Default case (editor mode)
    window.hideSpeakerNotesPanel?.();
    restoreUIElementsAfterPresentation();
    
    // Jump to current slide position in editor if coming from presentation
    if (previousMode === 'presentation' && typeof window.currentPresentationSlide === 'number') {
      jumpToSlideInEditor(window.currentPresentationSlide);
    }
  }

  console.log('[Mode Switching] Mode switched to:', getCurrentMode());
  return true;
}

function setupModeSwitching() {
  console.log('[Mode Switching] Setting up mode switching');
  
  // Mode switching buttons
  const editorModeBtn = document.getElementById('editor-mode-btn');
  const presentationModeBtn = document.getElementById('presentation-mode-btn');
  const networkModeBtn = document.getElementById('network-mode-btn');
  const libraryModeBtn = document.getElementById('library-mode-btn');
  
  if (editorModeBtn) {
    editorModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Editor mode button clicked');
      switchToMode('editor');
    });
  }

  if (presentationModeBtn) {
    presentationModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Presentation mode button clicked');
      switchToMode('presentation');
    });
  }

  if (networkModeBtn) {
    networkModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Network mode button clicked');
      switchToMode('network');
    });
  }

  const circleModeBtn = document.getElementById('circle-mode-btn');
  if (circleModeBtn) {
    circleModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Circle mode button clicked');
      switchToMode('circle');
    });
  }

  if (libraryModeBtn) {
    libraryModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Library mode button clicked');
      switchToMode('library');
    });
  }

  // Speaker notes panel toggle
  const toggleButton = document.getElementById('toggle-speaker-notes-panel');
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      const panel = document.getElementById('speaker-notes-panel');
      if (panel) {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        toggleButton.textContent = isVisible ? 'Show' : 'Hide';
        
        // Remember the user's preference
        if (!isVisible) {
          localStorage.removeItem('speakerNotesAutoHidden');
        } else {
          localStorage.setItem('speakerNotesAutoHidden', 'true');
        }
      }
    });
  }

  // Sync content to presentation when switching
  const presentationRoot = document.getElementById('presentation-root');
  if (presentationRoot) {
    // Trailing-edge debounce + visibility gate.
    // Why: dispatching `updatePresentationContent` triggers a React useEffect in
    // MarkdownPreziApp that re-parses the markdown and runs 5 setState calls,
    // which dominated the post-load lag (~300ms on a 28KB lecture file).
    // We always cache the latest content so entering presentation mode picks it up,
    // but only dispatch when the presentation UI is actually mounted/visible.
    let _syncDebounceTimer = null;
    const SYNC_DEBOUNCE_MS = 80;

    const _isPresentationVisible = () => {
      // Mode is presentation, OR the React app is mounted and the root is on-screen.
      if (getCurrentMode() === 'presentation') return true;
      const root = document.getElementById('presentation-root');
      if (!root) return false;
      const mounted = root.querySelector('.slide, [data-reactroot]');
      if (!mounted) return false;
      // offsetParent is null when the element or an ancestor has display:none
      return root.offsetParent !== null;
    };

    const _dispatchPresentationUpdate = (content) => {
      const contentUpdateEvent = new CustomEvent('updatePresentationContent', {
        detail: { content }
      });
      window.dispatchEvent(contentUpdateEvent);
    };

    // Function to sync current editor content to presentation
    window.syncContentToPresentation = (content) => {
      if (!content) return;

      // Always cache so a future mode switch into presentation has the latest content.
      window.pendingPresentationContent = content;

      // Skip the expensive React re-parse if presentation isn't visible.
      if (!_isPresentationVisible()) {
        return;
      }

      // Coalesce rapid calls (e.g. file-open + tab-activate firing back-to-back)
      // into a single trailing-edge dispatch.
      if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
      _syncDebounceTimer = setTimeout(() => {
        _syncDebounceTimer = null;
        _dispatchPresentationUpdate(content);
      }, SYNC_DEBOUNCE_MS);
    };

    // Expose an immediate (non-debounced, non-gated) variant for the mode
    // switcher itself, which needs the React component to receive content
    // synchronously when the user clicks into presentation mode.
    window.syncContentToPresentationImmediate = (content) => {
      if (!content) return;
      window.pendingPresentationContent = content;
      if (_syncDebounceTimer) {
        clearTimeout(_syncDebounceTimer);
        _syncDebounceTimer = null;
      }
      _dispatchPresentationUpdate(content);
    };
  }

  // Custom window controls removed - using native titlebar

  // Setup feature-aware mode button visibility
  setupFeatureModeButtons();

  console.log('[Mode Switching] Mode switching setup completed');
}

// Map bundled feature IDs to mode button IDs
const featureToModeButton = {
  'nightowl-presentations': 'presentation-mode-btn',
  'nightowl-network-diagram': 'network-mode-btn',
  'nightowl-maze': 'library-mode-btn',
  'nightowl-circle': 'circle-mode-btn'
};

// Update mode button visibility based on feature state
function updateModeButtonVisibility() {
  if (!window.NightOwlFeatures) {
    console.log('[Mode Switching] Feature loader not available yet');
    return;
  }

  const enabledFeatures = window.NightOwlFeatures.getEnabled?.() || [];
  console.log('[Mode Switching] Enabled features:', enabledFeatures);

  for (const [featureId, buttonId] of Object.entries(featureToModeButton)) {
    const button = document.getElementById(buttonId);
    const isEnabled = enabledFeatures.includes(featureId);
    console.log(`[Mode Switching] Feature ${featureId}: enabled=${isEnabled}, button=${buttonId}, found=${!!button}`);
    if (button) {
      button.style.display = isEnabled ? '' : 'none';
    }
  }
}

// Setup listeners for feature enable/disable events
function setupFeatureModeButtons() {
  // Initialize the available modes registry
  const availableModes = window.__nightOwlAvailableModes || window.__techneAvailableModes || {};
  window.__nightOwlAvailableModes = availableModes;
  window.__techneAvailableModes = availableModes;

  // Initial update after a short delay to ensure features are loaded
  setTimeout(updateModeButtonVisibility, 100);

  // Listen for feature enable/disable events
  if (window.NightOwlFeatures?.on) {
    // Listen for mode:available events from bundled features.
    window.NightOwlFeatures.on('mode:available', (mode) => {
      if (mode?.id) {
        console.log('[Mode Switching] Mode available:', mode.id, mode.title);
        window.__nightOwlAvailableModes[mode.id] = mode;
      }
    });

    window.NightOwlFeatures.on('feature:enabled', ({ id }) => {
      console.log('[Mode Switching] Feature enabled:', id);
      updateModeButtonVisibility();
    });

    window.NightOwlFeatures.on('feature:disabled', ({ id }) => {
      console.log('[Mode Switching] Feature disabled:', id);
      // If we're in the mode that was disabled, switch to editor
      const buttonId = featureToModeButton[id];
      if (buttonId) {
        const modeMap = {
          'presentation-mode-btn': 'presentation',
          'network-mode-btn': 'network',
          'library-mode-btn': 'library',
          'circle-mode-btn': 'circle'
        };
        const mode = modeMap[buttonId];
        if (getCurrentMode() === mode) {
          switchToMode('editor');
        }
      }
      updateModeButtonVisibility();
    });

    // Also listen for features:started to update initially
    window.NightOwlFeatures.on('features:started', () => {
      updateModeButtonVisibility();
    });
  }
}

// Wire up IPC events from menu keyboard shortcuts (Cmd+1/2/3)
if (window.electronAPI) {
  window.electronAPI.events?.switchToEditor?.(() => switchToMode('editor'));
  window.electronAPI.events?.switchToPresentation?.(() => switchToMode('presentation'));
  window.electronAPI.events?.switchToNetwork?.(() => switchToMode('network'));
}

// Export functions to global scope for backward compatibility
window.switchToMode = switchToMode;
window.setupModeSwitching = setupModeSwitching;
window.restoreUIElementsAfterPresentation = restoreUIElementsAfterPresentation;
window.updateModeButtonVisibility = updateModeButtonVisibility;
Object.defineProperty(window, 'currentMode', {
  configurable: true,
  enumerable: true,
  get: getCurrentMode,
  set: (mode) => switchToMode(mode)
});
window.presentationEditorContent = presentationEditorContent;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PRESENTATION_DIAGNOSTICS,
    ensurePresentationsReady,
    renderPresentationComponent,
    renderPresentationLoadState,
    startPresentationLoad,
    cancelPresentationLoad,
    switchToMode
  };
}
