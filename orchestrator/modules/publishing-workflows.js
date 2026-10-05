/**
 * Publishing Workflows
 *
 * Presents declarative, staged multi-repository publishing profiles. Main
 * process services own profile discovery and direct command execution; the
 * renderer only displays exact plans and requests a named stage.
 */
(function initPublishingWorkflowsModule() {
  'use strict';

  const state = {
    overlay: null,
    inspection: null,
    loading: false,
    runningKey: null,
    stageResults: new Map(),
    messages: new Map(),
    initialized: false
  };

  function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function shortRevision(revision) {
    return revision ? revision.slice(0, 12) : 'unavailable';
  }

  function authorityLabel(authority) {
    if (authority === 'mutate') return 'commit + push';
    if (authority === 'network') return 'network read';
    return 'read-only';
  }

  function close() {
    state.overlay?.remove();
    state.overlay = null;
    document.removeEventListener('keydown', handleEscape);
  }

  function handleEscape(event) {
    if (event.key === 'Escape' && !state.runningKey) close();
  }

  function buildShell() {
    const overlay = makeElement('div', 'publishing-workflows-overlay');
    overlay.id = 'publishing-workflows-overlay';
    const dialog = makeElement('section', 'publishing-workflows-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'publishing-workflows-title');

    const header = makeElement('header', 'publishing-workflows-header');
    const headingGroup = makeElement('div', 'publishing-workflows-heading');
    const title = makeElement('h2', '', 'Publishing workflows');
    title.id = 'publishing-workflows-title';
    headingGroup.append(
      title,
      makeElement('p', '', 'Move authored content through explicit preflight, preview, publish, deploy, and live-verification stages.')
    );

    const actions = makeElement('div', 'publishing-workflows-header-actions');
    const refreshButton = makeElement('button', 'btn btn-secondary publishing-refresh', 'Refresh');
    refreshButton.type = 'button';
    refreshButton.addEventListener('click', () => refresh());
    const closeButton = makeElement('button', 'publishing-workflows-close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close publishing workflows');
    closeButton.addEventListener('click', close);
    actions.append(refreshButton, closeButton);
    header.append(headingGroup, actions);

    const body = makeElement('div', 'publishing-workflows-body');
    body.id = 'publishing-workflows-body';
    dialog.append(header, body);
    overlay.appendChild(dialog);
    overlay.addEventListener('mousedown', event => {
      if (event.target === overlay && !state.runningKey) close();
    });
    return overlay;
  }

  function renderEmpty(body) {
    const empty = makeElement('div', 'publishing-empty');
    empty.append(
      makeElement('h3', '', 'No publishing profile matches this workspace'),
      makeElement(
        'p',
        '',
        `Add ${state.inspection?.customProfilePath || '.nightowl/publishing.json'} or open one of the standard Machine Spirits brand, content, or website sibling checkouts.`
      )
    );
    body.appendChild(empty);
  }

  function renderConfigurationErrors(body) {
    const errors = state.inspection?.configurationErrors || [];
    if (errors.length === 0) return;
    const panel = makeElement('section', 'publishing-alert publishing-alert-error');
    panel.appendChild(makeElement('strong', '', 'Publishing profile configuration failed'));
    for (const entry of errors) {
      panel.appendChild(makeElement('div', '', `${entry.source}: ${entry.error}`));
    }
    body.appendChild(panel);
  }

  function renderRepository(repository) {
    const card = makeElement(
      'article',
      `publishing-repository ${repository.found ? '' : 'missing'}`.trim()
    );
    const heading = makeElement('div', 'publishing-repository-heading');
    heading.append(
      makeElement('strong', '', repository.label),
      makeElement('span', `publishing-status ${repository.found ? 'ready' : 'blocked'}`, repository.found ? 'found' : 'missing')
    );
    card.appendChild(heading);
    if (!repository.found) {
      card.appendChild(makeElement('p', '', `Expected ${repository.expectedBasenames.join(' or ')} in a declared sibling path.`));
      return card;
    }

    const metadata = makeElement('dl', 'publishing-repository-metadata');
    for (const [label, value] of [
      ['Path', repository.path],
      ['Branch', repository.branch || 'unknown'],
      ['Revision', repository.revision || 'unknown'],
      ['Origin', repository.origin || 'none']
    ]) {
      metadata.append(makeElement('dt', '', label), makeElement('dd', '', value));
    }
    card.appendChild(metadata);

    if (!repository.remoteMatches) {
      card.appendChild(makeElement('p', 'publishing-repository-warning', `Origin does not match ${repository.remote}.`));
    }
    const status = repository.status;
    if (status?.clean) {
      card.appendChild(makeElement('p', 'publishing-repository-clean', 'Working tree clean'));
    } else if (status) {
      const details = makeElement('details', 'publishing-changes');
      const summary = makeElement(
        'summary',
        '',
        `${status.total} changed path(s): ${status.staged} staged, ${status.modified} modified, ${status.untracked} untracked`
      );
      const list = makeElement('ul', 'publishing-change-list');
      status.changedFiles.slice(0, 30).forEach(change => {
        list.appendChild(makeElement('li', '', `${change.status} ${change.path}`));
      });
      if (status.truncated || status.changedFiles.length > 30) {
        list.appendChild(makeElement('li', '', '… additional changed paths omitted'));
      }
      details.append(summary, list);
      card.appendChild(details);
    }
    return card;
  }

  function renderStageResult(profileId, stageId) {
    const result = state.stageResults.get(`${profileId}:${stageId}`);
    if (!result) return null;
    const panel = makeElement('div', `publishing-stage-result ${result.success ? 'success' : 'failure'}`);
    const summary = result.success
      ? `Stage completed${result.downstreamRevision ? `; content revision ${result.downstreamRevision}` : ''}`
      : `Stage failed: ${result.error || 'See output below'}`;
    panel.appendChild(makeElement('strong', '', summary));

    for (const step of result.results || []) {
      const details = makeElement('details', 'publishing-step-output');
      if (!step.success) details.open = true;
      details.appendChild(makeElement(
        'summary',
        '',
        `${step.success ? '✓' : '✗'} ${step.command || step.id}${step.durationMs ? ` (${(step.durationMs / 1000).toFixed(1)}s)` : ''}`
      ));
      if (step.snapshot) {
        const status = step.snapshot.status;
        details.appendChild(makeElement(
          'pre',
          '',
          status?.clean
            ? `${step.snapshot.label}: clean at ${step.snapshot.revision || 'unknown revision'}`
            : (status?.changedFiles || []).map(change => `${change.status} ${change.path}`).join('\n')
        ));
      } else {
        const output = [step.stdout, step.stderr].filter(Boolean).join('\n').trim() || '(no output)';
        details.appendChild(makeElement('pre', '', output));
      }
      panel.appendChild(details);
    }
    return panel;
  }

  function renderStage(profile, stage) {
    const card = makeElement('article', `publishing-stage authority-${stage.authority}`);
    const heading = makeElement('div', 'publishing-stage-heading');
    const headingText = makeElement('div');
    headingText.append(
      makeElement('h4', '', stage.label),
      makeElement('p', '', stage.description)
    );
    heading.append(
      headingText,
      makeElement('span', `publishing-authority ${stage.authority}`, authorityLabel(stage.authority))
    );
    card.appendChild(heading);

    const plan = makeElement('ol', 'publishing-stage-plan');
    for (const step of stage.plan) {
      const item = makeElement('li');
      item.appendChild(makeElement('code', '', step.display));
      const environmentEntries = Object.entries(step.environment || {});
      if (environmentEntries.length) {
        item.appendChild(makeElement(
          'small',
          '',
          environmentEntries.map(([key, value]) => `${key}=${value}`).join(' ')
        ));
      }
      plan.appendChild(item);
    }
    card.appendChild(plan);

    if (stage.blockers.length) {
      const blockers = makeElement('ul', 'publishing-stage-blockers');
      stage.blockers.forEach(blocker => blockers.appendChild(makeElement('li', '', blocker)));
      card.appendChild(blockers);
    }

    const footer = makeElement('div', 'publishing-stage-footer');
    const running = state.runningKey === `${profile.id}:${stage.id}`;
    const button = makeElement(
      'button',
      `btn ${stage.authority === 'mutate' ? 'btn-primary' : 'btn-secondary'}`,
      running ? 'Running…' : `Run ${stage.label.replace(/^\d+\.\s*/, '')}`
    );
    button.type = 'button';
    button.disabled = !stage.canRun || Boolean(state.runningKey);
    button.addEventListener('click', () => runStage(profile, stage));
    footer.appendChild(button);
    card.appendChild(footer);

    const result = renderStageResult(profile.id, stage.id);
    if (result) card.appendChild(result);
    return card;
  }

  function renderProfile(profile) {
    const section = makeElement('section', 'publishing-profile');
    const header = makeElement('div', 'publishing-profile-header');
    const titleGroup = makeElement('div');
    titleGroup.append(
      makeElement('h3', '', profile.title),
      makeElement('p', '', profile.description)
    );
    const revision = makeElement('div', 'publishing-downstream-revision');
    revision.append(
      makeElement('span', '', 'Target content revision'),
      makeElement('code', '', profile.downstreamRevision || 'unavailable')
    );
    header.append(titleGroup, revision);
    section.appendChild(header);

    if (profile.warnings.length) {
      const warnings = makeElement('div', 'publishing-alert publishing-alert-warning');
      warnings.appendChild(makeElement('strong', '', 'Review before publishing'));
      profile.warnings.forEach(warning => warnings.appendChild(makeElement('div', '', warning)));
      section.appendChild(warnings);
    }

    const repositoryGrid = makeElement('div', 'publishing-repositories');
    profile.repositories.forEach(repository => repositoryGrid.appendChild(renderRepository(repository)));
    section.appendChild(repositoryGrid);

    const tools = makeElement('div', 'publishing-tools');
    tools.appendChild(makeElement('strong', '', 'Tools'));
    profile.tools.forEach(tool => tools.appendChild(makeElement(
      'span',
      `publishing-tool ${tool.available ? 'ready' : 'blocked'}`,
      `${tool.available ? '✓' : '✗'} ${tool.name}`
    )));
    section.appendChild(tools);

    if (profile.stages.some(stage => stage.messageRequired)) {
      const messageGroup = makeElement('label', 'publishing-message');
      messageGroup.appendChild(makeElement('span', '', 'Release message'));
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 240;
      input.placeholder = 'Describe the public-site update';
      input.value = state.messages.get(profile.id) || '';
      input.addEventListener('input', () => state.messages.set(profile.id, input.value));
      messageGroup.appendChild(input);
      section.appendChild(messageGroup);
    }

    const stages = makeElement('div', 'publishing-stages');
    profile.stages.forEach(stage => stages.appendChild(renderStage(profile, stage)));
    section.appendChild(stages);
    return section;
  }

  function render() {
    const body = state.overlay?.querySelector('#publishing-workflows-body');
    if (!body) return;
    body.replaceChildren();
    if (state.loading) {
      body.appendChild(makeElement('div', 'publishing-loading', 'Inspecting repositories, tools, and revisions…'));
      return;
    }
    if (!state.inspection) {
      body.appendChild(makeElement('div', 'publishing-alert publishing-alert-error', 'Publishing profile inspection is unavailable.'));
      return;
    }
    renderConfigurationErrors(body);
    if ((state.inspection.profiles || []).length === 0) {
      renderEmpty(body);
      return;
    }
    state.inspection.profiles.forEach(profile => body.appendChild(renderProfile(profile)));
  }

  async function refresh() {
    state.loading = true;
    render();
    try {
      state.inspection = await window.electronAPI.publishing.inspect();
    } catch (error) {
      state.inspection = {
        success: false,
        configurationErrors: [{ source: 'NightOwl', error: error.message }],
        profiles: []
      };
    } finally {
      state.loading = false;
      render();
    }
  }

  async function runStage(profile, stage) {
    if (state.runningKey || !stage.canRun) return;
    const message = (state.messages.get(profile.id) || '').trim();
    if (stage.messageRequired && !message) {
      window.showNotification?.('Add a release message before publishing', 'warning');
      state.overlay?.querySelector('.publishing-message input')?.focus();
      return;
    }

    let confirmed = false;
    if (stage.authority === 'mutate') {
      const paths = Array.from(new Set(
        stage.plan.map(step => step.cwd).filter(Boolean)
      ));
      confirmed = await window.showAppConfirm({
        title: 'Publish across repositories?',
        message: `${stage.label} will run the displayed command plan.`,
        detail: 'This stage may render generated files, create a scoped content commit, rebase, and push. Cancel is the safe default.',
        paths,
        confirmText: 'Publish content',
        cancelText: 'Cancel',
        variant: 'danger'
      });
      if (!confirmed) return;
    }

    state.runningKey = `${profile.id}:${stage.id}`;
    render();
    try {
      const result = await window.electronAPI.publishing.runStage({
        profileId: profile.id,
        stageId: stage.id,
        planDigest: stage.planDigest,
        message,
        confirmed
      });
      state.stageResults.set(state.runningKey, result);
      if (result.success) {
        window.showNotification?.(`${stage.label} completed`, 'success');
      } else {
        window.showNotification?.(`${stage.label} failed: ${result.error}`, 'error');
      }
      state.inspection = await window.electronAPI.publishing.inspect();
    } catch (error) {
      state.stageResults.set(state.runningKey, { success: false, error: error.message, results: [] });
      window.showNotification?.(`Publishing stage failed: ${error.message}`, 'error');
    } finally {
      state.runningKey = null;
      render();
    }
  }

  async function open() {
    if (!window.electronAPI?.publishing?.inspect) {
      window.showNotification?.('Publishing profiles are unavailable in this runtime', 'warning');
      return;
    }
    if (state.overlay) {
      state.overlay.querySelector('.publishing-workflows-close')?.focus();
      return;
    }
    state.overlay = buildShell();
    document.body.appendChild(state.overlay);
    document.addEventListener('keydown', handleEscape);
    state.overlay.querySelector('.publishing-workflows-close')?.focus();
    await refresh();
  }

  function initialize() {
    if (state.initialized) return;
    state.initialized = true;
    window.registerCommand?.(
      'publishing.openWorkflows',
      'Publishing: Open Workflow',
      open,
      null,
      { owner: 'publishing-profiles', keywords: ['deploy', 'release', 'website', 'content'] }
    );
    window.electronAPI?.events?.openPublishingWorkflows?.(() => open());
  }

  window.NightOwlPublishingWorkflows = Object.freeze({
    open,
    close,
    refresh,
    getSnapshot: () => ({
      open: Boolean(state.overlay),
      loading: state.loading,
      runningKey: state.runningKey,
      profileCount: state.inspection?.profiles?.length || 0
    })
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
