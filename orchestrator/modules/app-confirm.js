/**
 * App-native confirmation helper.
 *
 * Uses Electron's message box when available and falls back to an in-app modal
 * in browser/test contexts. Callers should pass exact paths and consequences.
 */
(function () {
    'use strict';

    function appendTextBlock(parent, className, text) {
        if (!text) return null;
        const block = document.createElement('div');
        block.className = className;
        block.textContent = text;
        parent.appendChild(block);
        return block;
    }

    function showDomConfirmDialog(options = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'app-confirm-overlay';

            const dialog = document.createElement('div');
            dialog.className = `app-confirm-dialog ${options.variant === 'danger' ? 'danger' : ''}`;
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', 'app-confirm-title');

            const title = document.createElement('h2');
            title.id = 'app-confirm-title';
            title.textContent = options.title || 'Confirm Action';
            dialog.appendChild(title);

            appendTextBlock(dialog, 'app-confirm-message', options.message || 'Continue?');
            appendTextBlock(dialog, 'app-confirm-detail', options.detail || '');

            if (Array.isArray(options.paths) && options.paths.length > 0) {
                const pathList = document.createElement('div');
                pathList.className = 'app-confirm-path-list';
                options.paths.slice(0, 12).forEach((pathValue) => {
                    const pathItem = document.createElement('code');
                    pathItem.textContent = pathValue;
                    pathList.appendChild(pathItem);
                });
                if (options.paths.length > 12) {
                    const more = document.createElement('span');
                    more.className = 'app-confirm-more';
                    more.textContent = `and ${options.paths.length - 12} more`;
                    pathList.appendChild(more);
                }
                dialog.appendChild(pathList);
            }

            const actions = document.createElement('div');
            actions.className = 'app-confirm-actions';

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'btn btn-secondary';
            cancel.textContent = options.cancelText || 'Cancel';

            const confirm = document.createElement('button');
            confirm.type = 'button';
            confirm.className = `btn ${options.variant === 'danger' ? 'btn-error' : 'btn-primary'}`;
            confirm.textContent = options.confirmText || 'Confirm';

            const close = (confirmed) => {
                overlay.remove();
                document.removeEventListener('keydown', onKeyDown);
                resolve(confirmed);
            };

            const onKeyDown = (event) => {
                if (event.key === 'Escape') close(false);
            };

            cancel.addEventListener('click', () => close(false));
            confirm.addEventListener('click', () => close(true));
            overlay.addEventListener('mousedown', (event) => {
                if (event.target === overlay) close(false);
            });
            document.addEventListener('keydown', onKeyDown);

            actions.appendChild(cancel);
            actions.appendChild(confirm);
            dialog.appendChild(actions);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            cancel.focus();
        });
    }

    async function showAppConfirm(options = {}) {
        if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
            try {
                const response = await window.electronAPI.invoke('show-confirm-dialog', options);
                if (response && response.success) {
                    return Boolean(response.confirmed);
                }
            } catch (error) {
                console.warn('[app-confirm] Native confirmation failed, using DOM fallback:', error.message);
            }
        }

        return showDomConfirmDialog(options);
    }

    window.showAppConfirm = showAppConfirm;
})();
