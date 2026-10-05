/**
 * Renderer status and commands for the main-process workspace index.
 */
(function () {
    'use strict';

    let hideTimer = null;
    let unsubscribe = null;
    let lastProgress = null;

    function getElement() {
        let element = document.getElementById('workspace-index-progress');
        if (element) return element;
        element = document.createElement('div');
        element.id = 'workspace-index-progress';
        element.className = 'workspace-index-progress';
        element.hidden = true;
        element.innerHTML = `
            <span class="workspace-index-progress-label"></span>
            <progress class="workspace-index-progress-meter" max="100" value="0"></progress>
            <button class="workspace-index-progress-cancel" type="button">Cancel</button>
        `;
        element.querySelector('.workspace-index-progress-cancel').addEventListener('click', async () => {
            await window.electronAPI?.search?.workspaceIndexCancel?.();
        });
        document.body.appendChild(element);
        return element;
    }

    function formatProgress(progress) {
        if (progress.phase === 'discovering') return `Indexing workspace · ${progress.discovered || 0} files found`;
        if (progress.phase === 'extracting') return `Indexing workspace · ${progress.processed || 0}/${progress.discovered || 0}`;
        if (progress.phase === 'complete') {
            return `Workspace index ready · ${progress.indexed || 0} files · ${progress.reused || 0} unchanged · ${progress.durationMs || 0} ms`;
        }
        if (progress.state === 'cancelled') return 'Workspace indexing cancelled';
        return 'Preparing workspace index…';
    }

    function renderProgress(progress) {
        lastProgress = progress;
        const element = getElement();
        const label = element.querySelector('.workspace-index-progress-label');
        const meter = element.querySelector('.workspace-index-progress-meter');
        const cancel = element.querySelector('.workspace-index-progress-cancel');
        label.textContent = formatProgress(progress);
        const total = Number(progress.discovered) || 0;
        const processed = Number(progress.processed) || 0;
        meter.value = total ? Math.min(100, Math.round(processed / total * 100)) : 0;
        const active = !['complete', 'cancelled'].includes(progress.phase) && progress.state !== 'cancelled';
        meter.hidden = !active;
        cancel.hidden = !active;
        element.hidden = false;
        clearTimeout(hideTimer);
        if (!active) hideTimer = setTimeout(() => { element.hidden = true; }, 4000);
    }

    async function refresh() {
        const result = await window.electronAPI?.search?.workspaceIndexRefresh?.({ force: true });
        if (!result?.success && !result?.cancelled) {
            window.showNotification?.(result?.error || 'Workspace index refresh failed', 'error');
        }
        return result;
    }

    async function showStatus() {
        const status = await window.electronAPI?.search?.workspaceIndexStatus?.();
        if (!status?.success) {
            window.showNotification?.(status?.error || 'Workspace index status is unavailable', 'warning');
            return status;
        }
        const budget = status.budget || {};
        window.showNotification?.(
            `Workspace index: ${status.indexed || 0} files, ${status.state}, ${status.durationMs || 0} ms. Limits: ${budget.maxFiles || 0} files / ${Math.round((budget.maxContentBytes || 0) / 1048576)} MB per text file.`,
            status.state === 'ready' ? 'success' : 'info'
        );
        return status;
    }

    function registerActions() {
        if (typeof window.registerCommand !== 'function') return;
        window.registerCommand('workspace.index.refresh', 'Workspace: Refresh File Index', refresh, null, {
            owner: 'workspace-index',
            category: 'Workspace',
            replace: true
        });
        window.registerCommand('workspace.index.status', 'Workspace: Show Index Status', showStatus, null, {
            owner: 'workspace-index',
            category: 'Workspace',
            replace: true
        });
        window.registerCommand('workspace.index.cancel', 'Workspace: Cancel Indexing', () => (
            window.electronAPI?.search?.workspaceIndexCancel?.()
        ), null, {
            owner: 'workspace-index',
            category: 'Workspace',
            replace: true,
            when: () => lastProgress?.state === 'building' || ['discovering', 'extracting'].includes(lastProgress?.phase)
        });
    }

    function init() {
        registerActions();
        unsubscribe?.();
        unsubscribe = window.electronAPI?.events?.workspaceIndexProgress?.(renderProgress) || null;
    }

    const controller = Object.freeze({ init, refresh, renderProgress, showStatus, getLastProgress: () => lastProgress });
    window.NightOwlWorkspaceIndex = controller;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
