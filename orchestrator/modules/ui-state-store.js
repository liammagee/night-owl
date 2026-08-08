(function (root, factory) {
  const api = factory(root);
  if (root) root.NightOwlUIState = api.store;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createUIStateModule(root) {
  'use strict';

  const VALID_MODES = new Set(['editor', 'presentation', 'network', 'circle', 'library']);
  const VALID_RIGHT_PANES = new Set(['preview', 'chat', 'speaker-notes', 'wholepart', 'recognition']);
  const LAYOUT_ACTIONS = new Set([
    'SET_MODE',
    'SHOW_RIGHT_PANE',
    'SET_PANE_VISIBILITY',
    'TOGGLE_PANE',
    'HYDRATE_PANES',
    'SET_PREVIEW_FULLSCREEN',
    'SET_SOURCE_VIEW',
    'SET_SOURCE_FILE',
    'SET_SOURCE_SYNC',
    'SET_STRUCTURED_RECORD',
    'SET_RECORD_SOURCE_VISIBLE',
    'SET_ZEN_MODE'
  ]);

  function createInitialState(overrides = {}) {
    return {
      mode: 'editor',
      previousMode: null,
      activeRightPane: 'preview',
      zenMode: false,
      revision: 0,
      ...overrides,
      panes: {
        sidebar: true,
        editor: true,
        right: true,
        ...(overrides.panes || {})
      },
      preview: {
        fullscreen: false,
        sourceView: false,
        sourceFilePath: null,
        sourceSync: true,
        ...(overrides.preview || {})
      },
      structuredRecord: {
        active: false,
        sourceVisible: false,
        ...(overrides.structuredRecord || {})
      }
    };
  }

  function withRevision(previous, next) {
    if (next === previous) return previous;
    return { ...next, revision: previous.revision + 1 };
  }

  function ensureWorkspacePane(state, pane, visible) {
    const panes = { ...state.panes, [pane]: Boolean(visible) };
    if (!panes.editor && !panes.right) {
      panes[pane === 'editor' ? 'right' : 'editor'] = true;
    }
    return { ...state, panes };
  }

  function uiStateReducer(state, action = {}) {
    switch (action.type) {
      case 'SET_MODE': {
        if (!VALID_MODES.has(action.mode) || action.mode === state.mode) return state;
        return withRevision(state, {
          ...state,
          previousMode: state.mode,
          mode: action.mode,
          zenMode: action.mode === 'editor' ? state.zenMode : false,
          preview: action.mode === 'editor'
            ? state.preview
            : { ...state.preview, fullscreen: false }
        });
      }
      case 'SHOW_RIGHT_PANE': {
        if (!VALID_RIGHT_PANES.has(action.pane)) return state;
        if (state.activeRightPane === action.pane && state.panes.right) return state;
        return withRevision(state, {
          ...state,
          activeRightPane: action.pane,
          panes: { ...state.panes, right: true },
          preview: action.pane === 'preview'
            ? state.preview
            : { ...state.preview, fullscreen: false }
        });
      }
      case 'SET_PANE_VISIBILITY': {
        if (!['sidebar', 'editor', 'right'].includes(action.pane)) return state;
        const next = action.pane === 'sidebar'
          ? { ...state, panes: { ...state.panes, sidebar: Boolean(action.visible) } }
          : ensureWorkspacePane(state, action.pane, action.visible);
        return withRevision(state, next);
      }
      case 'TOGGLE_PANE': {
        if (!['sidebar', 'editor', 'right'].includes(action.pane)) return state;
        return uiStateReducer(state, {
          type: 'SET_PANE_VISIBILITY',
          pane: action.pane,
          visible: !state.panes[action.pane]
        });
      }
      case 'HYDRATE_PANES': {
        const panes = {
          sidebar: action.panes?.sidebar !== false,
          editor: action.panes?.editor !== false,
          right: action.panes?.right !== false
        };
        if (!panes.editor && !panes.right) panes.editor = true;
        if (
          panes.sidebar === state.panes.sidebar &&
          panes.editor === state.panes.editor &&
          panes.right === state.panes.right
        ) return state;
        return withRevision(state, { ...state, panes });
      }
      case 'SET_PREVIEW_FULLSCREEN': {
        const fullscreen = Boolean(action.fullscreen);
        if (fullscreen && state.structuredRecord.active) return state;
        if (state.preview.fullscreen === fullscreen) return state;
        return withRevision(state, {
          ...state,
          activeRightPane: fullscreen ? 'preview' : state.activeRightPane,
          panes: fullscreen ? { ...state.panes, right: true } : state.panes,
          preview: {
            ...state.preview,
            fullscreen,
            sourceView: fullscreen ? false : state.preview.sourceView
          }
        });
      }
      case 'SET_SOURCE_VIEW': {
        const sourceView = Boolean(action.enabled);
        if (sourceView && state.structuredRecord.active) return state;
        if (
          state.preview.sourceView === sourceView &&
          (!sourceView || (!state.preview.sourceFilePath && state.preview.sourceSync))
        ) return state;
        return withRevision(state, {
          ...state,
          activeRightPane: sourceView ? 'preview' : state.activeRightPane,
          panes: sourceView ? { ...state.panes, right: true } : state.panes,
          preview: {
            ...state.preview,
            sourceView,
            sourceFilePath: sourceView ? null : state.preview.sourceFilePath,
            sourceSync: sourceView ? true : state.preview.sourceSync,
            fullscreen: sourceView ? false : state.preview.fullscreen
          }
        });
      }
      case 'SET_SOURCE_FILE': {
        const sourceFilePath = action.filePath || null;
        if (!state.preview.sourceView || !sourceFilePath || state.structuredRecord.active) return state;
        if (state.preview.sourceFilePath === sourceFilePath && !state.preview.sourceSync) return state;
        return withRevision(state, {
          ...state,
          preview: { ...state.preview, sourceFilePath, sourceSync: false }
        });
      }
      case 'SET_SOURCE_SYNC': {
        if (state.preview.sourceFilePath) return state;
        const sourceSync = Boolean(action.enabled);
        if (state.preview.sourceSync === sourceSync) return state;
        return withRevision(state, {
          ...state,
          preview: { ...state.preview, sourceSync }
        });
      }
      case 'SET_STRUCTURED_RECORD': {
        const active = Boolean(action.active);
        if (
          state.structuredRecord.active === active &&
          (!active || state.structuredRecord.sourceVisible === Boolean(action.sourceVisible))
        ) return state;
        return withRevision(state, {
          ...state,
          preview: active
            ? { ...state.preview, fullscreen: false, sourceView: false, sourceFilePath: null, sourceSync: true }
            : state.preview,
          structuredRecord: {
            active,
            sourceVisible: active ? Boolean(action.sourceVisible) : false
          }
        });
      }
      case 'SET_RECORD_SOURCE_VISIBLE': {
        if (!state.structuredRecord.active) return state;
        const sourceVisible = Boolean(action.visible);
        if (state.structuredRecord.sourceVisible === sourceVisible) return state;
        return withRevision(state, {
          ...state,
          structuredRecord: { ...state.structuredRecord, sourceVisible }
        });
      }
      case 'SET_ZEN_MODE': {
        const zenMode = Boolean(action.active);
        if (state.mode !== 'editor' && zenMode) return state;
        if (state.zenMode === zenMode) return state;
        return withRevision(state, { ...state, zenMode });
      }
      default:
        return state;
    }
  }

  function getEffectivePanes(state) {
    if (state.zenMode) {
      return { sidebar: false, editor: true, right: false };
    }
    if (state.structuredRecord.active) {
      return {
        sidebar: state.panes.sidebar,
        editor: state.structuredRecord.sourceVisible,
        right: true
      };
    }
    return { ...state.panes };
  }

  function toggleClass(documentRef, id, className, enabled) {
    documentRef.getElementById(id)?.classList.toggle(className, Boolean(enabled));
  }

  function applyDOMState(state, documentRef = root?.document) {
    if (!documentRef) return;
    const body = documentRef.body;
    if (body) {
      body.dataset.nightowlMode = state.mode;
      body.classList.toggle('presentation-mode', state.mode === 'presentation');
      body.classList.toggle('jsonl-record-mode-active', state.structuredRecord.active);
      body.classList.toggle('zen-mode', state.zenMode);
    }

    documentRef.querySelectorAll('.content-view').forEach(view => {
      view.classList.toggle('active', view.id === `${state.mode}-content`);
    });
    documentRef.querySelectorAll('.mode-btn').forEach(button => {
      button.classList.toggle('active', button.id === `${state.mode}-mode-btn`);
    });

    const effectivePanes = getEffectivePanes(state);
    toggleClass(documentRef, 'left-sidebar', 'nightowl-ui-hidden', !effectivePanes.sidebar);
    toggleClass(documentRef, 'sidebar-resizer', 'nightowl-ui-hidden', !effectivePanes.sidebar);
    toggleClass(documentRef, 'editor-pane', 'nightowl-ui-hidden', !effectivePanes.editor);
    toggleClass(documentRef, 'resizer', 'nightowl-ui-hidden', !effectivePanes.editor || !effectivePanes.right);
    toggleClass(documentRef, 'right-pane', 'nightowl-ui-hidden', !effectivePanes.right);
    toggleClass(documentRef, 'mode-switcher', 'nightowl-ui-hidden', state.zenMode);
    toggleClass(documentRef, 'editor-toolbar', 'nightowl-ui-hidden', state.zenMode);
    toggleClass(documentRef, 'editor-status-bar', 'nightowl-ui-hidden', state.zenMode);
    toggleClass(documentRef, 'gamification-panel', 'nightowl-ui-hidden', state.zenMode);

    const renderedRightPane = state.structuredRecord.active ? 'preview' : state.activeRightPane;
    const rightPaneIds = ['preview', 'chat', 'speaker-notes', 'wholepart', 'recognition'];
    rightPaneIds.forEach(pane => {
      const element = documentRef.getElementById(`${pane}-pane`);
      if (!element) return;
      const active = effectivePanes.right && renderedRightPane === pane;
      element.classList.toggle('ui-pane-active', active);
      element.classList.toggle('pane-hidden', !active);
    });
    const paneButtonIds = {
      preview: 'show-preview-btn',
      chat: 'show-chat-btn',
      'speaker-notes': 'show-speaker-notes-btn',
      wholepart: 'show-wholepart-btn',
      recognition: 'toggle-recognition-btn'
    };
    Object.entries(paneButtonIds).forEach(([pane, id]) => {
      documentRef.getElementById(id)?.classList.toggle('active', renderedRightPane === pane);
    });

    const previewFullscreen = state.mode === 'editor' &&
      effectivePanes.right &&
      state.activeRightPane === 'preview' &&
      state.preview.fullscreen &&
      !state.structuredRecord.active;
    toggleClass(documentRef, 'preview-pane', 'preview-fullscreen', previewFullscreen);
    toggleClass(documentRef, 'preview-fullscreen-btn', 'active', previewFullscreen);
    const fullscreenButton = documentRef.getElementById('preview-fullscreen-btn');
    if (fullscreenButton) {
      fullscreenButton.title = previewFullscreen ? 'Exit Fullscreen (F11 or Esc)' : 'Toggle Fullscreen (F11)';
      fullscreenButton.setAttribute('aria-pressed', String(previewFullscreen));
    }

    const sourceView = state.preview.sourceView && !state.structuredRecord.active;
    toggleClass(documentRef, 'preview-source-btn', 'active', sourceView);
    toggleClass(documentRef, 'preview-content', 'nightowl-ui-hidden', sourceView || state.structuredRecord.active);
    toggleClass(documentRef, 'preview-source', 'nightowl-ui-hidden', !sourceView);
    toggleClass(documentRef, 'preview-source-toolbar', 'nightowl-ui-hidden', !sourceView);
    toggleClass(documentRef, 'preview-source-sync-toggle', 'active', sourceView && state.preview.sourceSync);
    toggleClass(
      documentRef,
      'preview-source-sync-toggle',
      'nightowl-ui-hidden',
      !sourceView || Boolean(state.preview.sourceFilePath)
    );

    const recordActive = state.structuredRecord.active;
    ['preview-scroll-sync-btn', 'preview-source-btn', 'preview-fullscreen-btn'].forEach(id => {
      toggleClass(documentRef, id, 'nightowl-ui-hidden', recordActive);
    });
    toggleClass(documentRef, 'jsonl-record-mode', 'nightowl-ui-hidden', !recordActive);
    toggleClass(documentRef, 'right-pane', 'ui-record-focus', recordActive && !state.structuredRecord.sourceVisible);

    const paneToggleButtons = {
      sidebar: 'toggle-sidebar-btn',
      editor: 'toggle-editor-btn',
      right: 'toggle-preview-btn'
    };
    Object.entries(paneToggleButtons).forEach(([pane, id]) => {
      const button = documentRef.getElementById(id);
      if (!button) return;
      button.setAttribute('aria-pressed', String(state.panes[pane]));
      button.classList.toggle('toggle-off', !state.panes[pane]);
      button.classList.toggle('btn-primary', state.panes[pane]);
    });
  }

  function createUIStateStore(options = {}) {
    let state = createInitialState(options.initialState);
    const listeners = new Set();
    const completionListeners = new Set();
    const afterTransitionQueue = [];
    let completionScheduled = false;
    let lastAction = { type: 'INITIALIZE' };

    const getWindow = () => options.root || root;
    const getDocument = () => options.document || getWindow()?.document;
    const scheduleFrame = callback => {
      const windowRef = getWindow();
      if (typeof windowRef?.requestAnimationFrame === 'function') {
        return windowRef.requestAnimationFrame(callback);
      }
      return setTimeout(callback, 0);
    };

    function completeTransition() {
      completionScheduled = false;
      const windowRef = getWindow();
      windowRef?.editor?.layout?.();
      const detail = { state, action: lastAction };
      completionListeners.forEach(listener => listener(detail));
      while (afterTransitionQueue.length) {
        const callback = afterTransitionQueue.shift();
        callback(detail);
      }
      if (windowRef?.dispatchEvent && typeof windowRef.CustomEvent === 'function') {
        windowRef.dispatchEvent(new windowRef.CustomEvent('nightowl-ui-transition-complete', { detail }));
        if (state.mode === 'presentation' && typeof windowRef.Event === 'function') {
          windowRef.dispatchEvent(new windowRef.Event('resize'));
        }
      }
    }

    function scheduleCompletion() {
      if (completionScheduled) return;
      completionScheduled = true;
      scheduleFrame(completeTransition);
    }

    function dispatch(action) {
      const nextState = uiStateReducer(state, action);
      if (nextState === state) return state;
      state = nextState;
      lastAction = action;
      applyDOMState(state, getDocument());
      listeners.forEach(listener => listener(state, action));
      const windowRef = getWindow();
      if (windowRef?.dispatchEvent && typeof windowRef.CustomEvent === 'function') {
        windowRef.dispatchEvent(new windowRef.CustomEvent('nightowl-ui-state-changed', {
          detail: { state, action }
        }));
      }
      if (LAYOUT_ACTIONS.has(action.type)) scheduleCompletion();
      return state;
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function onTransitionComplete(listener) {
      completionListeners.add(listener);
      return () => completionListeners.delete(listener);
    }

    function afterTransition(callback) {
      afterTransitionQueue.push(callback);
      if (!completionScheduled) scheduleCompletion();
    }

    applyDOMState(state, getDocument());
    return {
      getState: () => state,
      dispatch,
      subscribe,
      onTransitionComplete,
      afterTransition,
      render: () => applyDOMState(state, getDocument()),
      getEffectivePanes: () => getEffectivePanes(state)
    };
  }

  const store = createUIStateStore();
  return {
    VALID_MODES,
    VALID_RIGHT_PANES,
    createInitialState,
    uiStateReducer,
    getEffectivePanes,
    applyDOMState,
    createUIStateStore,
    store
  };
});
