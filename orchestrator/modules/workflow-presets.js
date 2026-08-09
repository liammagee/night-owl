/* Reversible focused workflow presets over the canonical UI state and actions. */
(function initWorkflowPresets(root, factory) {
  const api = factory(root);
  if (root) root.NightOwlWorkflowPresets = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.initialize();
})(typeof window !== 'undefined' ? window : null, function createWorkflowPresetsModule(root) {
  'use strict';

  const PRESETS = Object.freeze({
    writing: Object.freeze({
      id: 'writing', label: 'Writing', description: 'Draft, preview, proofread, and revise.',
      panes: Object.freeze({ sidebar: false, editor: true, right: true }), rightPane: 'preview',
      actions: Object.freeze(['ai.rewriteSelection', 'proofread.panel', 'ai.writing-coach', 'view.focusMode'])
    }),
    research: Object.freeze({
      id: 'research', label: 'Research', description: 'Browse sources, citations, links, and the workspace index.',
      panes: Object.freeze({ sidebar: true, editor: true, right: true }), rightPane: 'preview',
      actions: Object.freeze(['view.citations', 'citations.captureClipboard', 'edit.findGlobal', 'workspace.index.refresh'])
    }),
    presentation: Object.freeze({
      id: 'presentation', label: 'Presentation', description: 'Author, preflight, rehearse, and present.',
      panes: Object.freeze({ sidebar: true, editor: true, right: true }), rightPane: 'speaker-notes',
      actions: Object.freeze(['presentation.preflight', 'presentation.presenterConsole', 'presentation.start', 'format.slideMarkers'])
    }),
    labelling: Object.freeze({
      id: 'labelling', label: 'Labelling', description: 'Review structured records with fast save-and-next actions.',
      panes: Object.freeze({ sidebar: true, editor: true, right: true }), rightPane: 'preview',
      actions: Object.freeze(['file.open', 'records.view.toggle', 'records.previous', 'records.next', 'records.saveNext'])
    })
  });

  function cloneSnapshot(state = {}) {
    return {
      mode: state.mode || 'editor',
      activeRightPane: state.activeRightPane || 'preview',
      panes: {
        sidebar: state.panes?.sidebar !== false,
        editor: state.panes?.editor !== false,
        right: state.panes?.right !== false
      }
    };
  }

  function createPresetController(options = {}) {
    const store = options.store;
    const panes = options.panes;
    if (!store?.getState || !panes?.hydrate || !panes?.show) {
      throw new TypeError('Workflow presets require the canonical UI state and pane controller');
    }
    const switchMode = options.switchMode || (() => {});
    const onChange = options.onChange || (() => {});
    let activeId = null;
    let customSnapshot = null;

    async function apply(id) {
      const preset = PRESETS[id];
      if (!preset) throw new Error(`Unknown workflow preset: ${id}`);
      if (!customSnapshot) customSnapshot = cloneSnapshot(store.getState());
      if (store.getState().mode !== 'editor') await switchMode('editor');
      panes.hydrate(preset.panes);
      if (preset.panes.right && preset.rightPane) panes.show(preset.rightPane);
      activeId = id;
      onChange({ activeId, preset, customSnapshot: cloneSnapshot(customSnapshot) });
      return getState();
    }

    async function restore() {
      if (!customSnapshot) {
        activeId = null;
        onChange({ activeId, preset: null, customSnapshot: null });
        return getState();
      }
      const target = customSnapshot;
      if (store.getState().mode !== target.mode) await switchMode(target.mode);
      if (target.activeRightPane) panes.show(target.activeRightPane);
      // Hydrate last so a formerly hidden right pane remains hidden while its
      // selected content is still restored for the next reveal.
      panes.hydrate(target.panes);
      activeId = null;
      customSnapshot = null;
      onChange({ activeId, preset: null, customSnapshot: null });
      return getState();
    }

    function getState() {
      return Object.freeze({
        activeId,
        activePreset: activeId ? PRESETS[activeId] : null,
        canRestore: Boolean(customSnapshot),
        customSnapshot: customSnapshot ? cloneSnapshot(customSnapshot) : null
      });
    }

    return Object.freeze({ apply, restore, getState });
  }

  let controller = null;
  let initialized = false;
  let actionSubscription = null;

  function executeAction(actionId) {
    Promise.resolve(root.NightOwlActions?.execute?.(actionId, { source: 'workflow-preset' }))
      .catch(error => root.showNotification?.(`Action unavailable: ${error.message}`, 'info'));
  }

  function renderActionButtons(container, preset) {
    container.replaceChildren();
    const actions = root.NightOwlActions;
    if (!preset || !actions) return;
    for (const actionId of preset.actions) {
      const action = actions.get(actionId);
      if (!action) continue;
      const button = root.document.createElement('button');
      button.type = 'button';
      button.className = 'workflow-preset-action';
      button.dataset.actionId = actionId;
      button.textContent = action.label.replace(/^[^:]+:\s*/, '');
      const available = actions.isAvailable(action, { source: 'workflow-preset' });
      button.disabled = !available;
      button.title = available ? action.label : `${action.label} (available when its document or feature is active)`;
      button.addEventListener('click', () => executeAction(actionId));
      container.appendChild(button);
    }
  }

  function renderBar() {
    if (!root?.document || !controller) return null;
    root.document.getElementById('workflow-preset-bar')?.remove();
    const bar = root.document.createElement('section');
    bar.id = 'workflow-preset-bar';
    bar.className = 'workflow-preset-bar';
    bar.setAttribute('aria-label', 'Focused workflow');
    const label = root.document.createElement('span');
    label.className = 'workflow-preset-label';
    label.textContent = 'Workflow';
    const choices = root.document.createElement('div');
    choices.className = 'workflow-preset-choices';
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', 'Workflow preset');
    for (const preset of Object.values(PRESETS)) {
      const button = root.document.createElement('button');
      button.type = 'button';
      button.dataset.workflowPreset = preset.id;
      button.textContent = preset.label;
      button.title = preset.description;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => controller.apply(preset.id));
      choices.appendChild(button);
    }
    const custom = root.document.createElement('button');
    custom.type = 'button';
    custom.dataset.workflowPreset = 'custom';
    custom.textContent = 'Custom';
    custom.title = 'Restore the pane layout that was active before the preset';
    custom.setAttribute('aria-pressed', 'true');
    custom.addEventListener('click', () => controller.restore());
    choices.appendChild(custom);
    const description = root.document.createElement('span');
    description.className = 'workflow-preset-description';
    description.textContent = 'Your current layout';
    const actions = root.document.createElement('div');
    actions.className = 'workflow-preset-actions';
    actions.setAttribute('aria-label', 'Recommended actions');
    bar.append(label, choices, description, actions);
    root.document.getElementById('mode-switcher')?.insertAdjacentElement('afterend', bar);
    return bar;
  }

  function updateProjection(change) {
    const bar = root.document.getElementById('workflow-preset-bar') || renderBar();
    if (!bar) return;
    const activeId = change.activeId;
    root.document.body.dataset.workflowPreset = activeId || 'custom';
    bar.querySelectorAll('[data-workflow-preset]').forEach(button => {
      const active = button.dataset.workflowPreset === (activeId || 'custom');
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('active', active);
    });
    const description = bar.querySelector('.workflow-preset-description');
    if (description) description.textContent = change.preset?.description || 'Your custom pane layout is restored.';
    renderActionButtons(bar.querySelector('.workflow-preset-actions'), change.preset);
  }

  function registerActions() {
    if (typeof root.registerCommand !== 'function') return;
    Object.values(PRESETS).forEach(preset => {
      const id = `workflow.preset.${preset.id}`;
      if (!root.NightOwlActions?.get?.(id)) {
        root.registerCommand(id, `Workflow: ${preset.label}`, () => controller.apply(preset.id), null, {
          category: 'Workflow', keywords: ['focus', 'preset', preset.description]
        });
      }
    });
    if (!root.NightOwlActions?.get?.('workflow.preset.custom')) {
      root.registerCommand('workflow.preset.custom', 'Workflow: Restore Custom Layout', () => controller.restore(), null, {
        category: 'Workflow', keywords: ['focus', 'preset', 'restore']
      });
    }
  }

  function tryInitialize() {
    const workflows = root?.NightOwlWorkflows;
    const store = root?.NightOwlUIState;
    if (!workflows?.panes || !store) return false;
    controller = createPresetController({
      store,
      panes: workflows.panes,
      switchMode: mode => root.switchToMode?.(mode),
      onChange: updateProjection
    });
    renderBar();
    updateProjection({ activeId: null, preset: null });
    registerActions();
    actionSubscription = root.NightOwlActions?.subscribe?.(() => {
      const state = controller.getState();
      updateProjection({ activeId: state.activeId, preset: state.activePreset });
    });
    return true;
  }

  function initialize() {
    if (initialized || !root?.document) return;
    initialized = true;
    const start = () => {
      if (tryInitialize()) return;
      const timer = root.setInterval(() => { if (tryInitialize()) root.clearInterval(timer); }, 200);
      root.setTimeout(() => root.clearInterval(timer), 15000);
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  function dispose() {
    actionSubscription?.();
    actionSubscription = null;
    root?.document?.getElementById('workflow-preset-bar')?.remove();
    controller = null;
    initialized = false;
  }

  const api = Object.freeze({
    PRESETS,
    cloneSnapshot,
    createPresetController,
    dispose,
    getController: () => controller,
    initialize
  });
  return api;
});
