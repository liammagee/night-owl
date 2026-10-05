// Notification center: toast notifications plus a quiet status-bar channel.
//
// Routine confirmations (auto-save, file saved, word wrap toggled, mode switched)
// used to appear as full toasts, which made the top-right corner noisy. They now
// go to the status bar unless the user opts back into toasts. Identical messages
// fired in quick succession are collapsed into one.
//
// Loaded before renderer.js; exposes window.NightOwlNotifications and, when no
// other implementation is present, window.showNotification.
(function () {
    const DEFAULT_DURATION = 4000;
    const MIN_TOAST_DURATION = 500;
    const MIN_STATUS_DURATION = 1500;
    const DEDUPE_WINDOW_MS = 3000;
    const HIDE_ANIMATION_MS = 250;
    const STATUS_ELEMENT_ID = 'status-notification';

    // Messages that confirm something the user just did and needs no interruption.
    const ROUTINE_PATTERNS = [
        /^auto-?saved\b/i,
        /^file saved\b/i,
        /\bsaved successfully\b/i,
        /^saved\b/i,
        /^word wrap\b/i,
        /^switched to\b/i,
        /^reloaded\b.*\bfrom disk\b/i,
        /^working directory changed\b/i,
        /^workspace (?:changed|switched|loaded)\b/i,
        /\btheme applied\b/i,
        /^applied (?:theme|layout|preset)\b/i,
        /^(?:editor|presentation|network|maze|circle|focus|zen) mode\b/i,
        /\bmode (?:enabled|disabled|activated|deactivated)\b/i,
        /^(?:copied|pasted)\b/i,
        /^scroll sync\b/i
    ];

    const AI_PATTERN = /\b(ai|ash|dr\.?\s*chen|summari(z|s)e|speaker notes|ghost text|openai|anthropic|gemini|openrouter)\b/i;

    function createNotificationCenter({ doc, getSettings, now } = {}) {
        const getDocument = () => doc || (typeof document !== 'undefined' ? document : null);
        const readSettings = () => {
            if (typeof getSettings === 'function') return getSettings() || {};
            return (typeof window !== 'undefined' && window.appSettings?.notifications) || {};
        };
        const clock = typeof now === 'function' ? now : () => Date.now();

        let lastShown = { key: '', at: 0 };
        let activeToast = null;
        let activeToastTimer = null;
        let statusTimer = null;

        const enabled = () => readSettings().enabled !== false;
        const aiEnabled = () => readSettings().aiEnabled !== false;
        const quietRoutine = () => readSettings().quietRoutine !== false;

        function looksLikeAINotification(message) {
            return typeof message === 'string' && AI_PATTERN.test(message);
        }

        function isRoutineMessage(message, type) {
            if (typeof message !== 'string') return false;
            if (type === 'error' || type === 'warning') return false;
            return ROUTINE_PATTERNS.some((pattern) => pattern.test(message.trim()));
        }

        function normalizeOptions(optionsOrDuration) {
            const options = { isHTML: false, duration: DEFAULT_DURATION, source: 'general', channel: null };
            if (typeof optionsOrDuration === 'number') {
                options.duration = optionsOrDuration;
            } else if (typeof optionsOrDuration === 'boolean') {
                options.isHTML = optionsOrDuration;
            } else if (typeof optionsOrDuration === 'string') {
                options.source = optionsOrDuration;
            } else if (optionsOrDuration && typeof optionsOrDuration === 'object') {
                options.isHTML = optionsOrDuration.isHTML === true;
                if (typeof optionsOrDuration.duration === 'number') options.duration = optionsOrDuration.duration;
                if (typeof optionsOrDuration.source === 'string') options.source = optionsOrDuration.source;
                if (typeof optionsOrDuration.channel === 'string') options.channel = optionsOrDuration.channel;
            }
            return options;
        }

        function resolveChannel(message, type, options) {
            if (options.channel === 'toast' || options.channel === 'status') return options.channel;
            if (options.isHTML) return 'toast';
            if (quietRoutine() && isRoutineMessage(message, type)) return 'status';
            return 'toast';
        }

        function textOf(message, isHTML) {
            if (!isHTML) return String(message == null ? '' : message);
            const d = getDocument();
            if (!d) return String(message);
            const probe = d.createElement('div');
            probe.innerHTML = String(message);
            return probe.textContent || '';
        }

        function dismissToast(toast) {
            if (!toast) return;
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, HIDE_ANIMATION_MS);
            if (toast === activeToast) {
                activeToast = null;
                if (activeToastTimer) clearTimeout(activeToastTimer);
                activeToastTimer = null;
            }
        }

        function scheduleToastDismiss(toast, duration) {
            if (activeToastTimer) clearTimeout(activeToastTimer);
            activeToastTimer = setTimeout(() => dismissToast(toast), Math.max(MIN_TOAST_DURATION, duration));
        }

        function showToast(message, type, options) {
            const d = getDocument();
            if (!d || !d.body) return null;

            // Same toast still on screen: keep it and extend its lifetime instead of re-animating.
            if (activeToast && activeToast.parentNode && activeToast.dataset.message === textOf(message, options.isHTML) && activeToast.dataset.type === type) {
                scheduleToastDismiss(activeToast, options.duration);
                return activeToast;
            }

            d.querySelectorAll('.notification').forEach((existing) => dismissToast(existing));

            const toast = d.createElement('div');
            toast.className = `notification notification-${type}`;
            toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
            toast.dataset.message = textOf(message, options.isHTML);
            toast.dataset.type = type;
            if (options.isHTML) {
                toast.innerHTML = message;
            } else {
                toast.textContent = message;
            }
            d.body.appendChild(toast);
            activeToast = toast;

            const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
            raf(() => toast.classList.add('show'));
            scheduleToastDismiss(toast, options.duration);
            return toast;
        }

        function findStatusHost() {
            const d = getDocument();
            if (!d) return null;
            return d.getElementById('status-left') || d.getElementById('editor-status-bar');
        }

        function showStatus(message, type, options) {
            const host = findStatusHost();
            if (!host) return showToast(message, type, options);
            const d = getDocument();
            let el = d.getElementById(STATUS_ELEMENT_ID);
            if (!el) {
                el = d.createElement('span');
                el.id = STATUS_ELEMENT_ID;
                el.setAttribute('role', 'status');
                el.setAttribute('aria-live', 'polite');
                host.appendChild(el);
            }
            el.className = `status-notification status-notification-${type} show`;
            el.textContent = textOf(message, options.isHTML);
            if (statusTimer) clearTimeout(statusTimer);
            statusTimer = setTimeout(() => {
                el.classList.remove('show');
                el.textContent = '';
            }, Math.max(MIN_STATUS_DURATION, options.duration));
            return el;
        }

        function show(message, type = 'info', optionsOrDuration = undefined) {
            if (!enabled()) return null;
            const options = normalizeOptions(optionsOrDuration);
            const isAIMessage = options.source === 'ai' || looksLikeAINotification(message);
            if (isAIMessage && !aiEnabled()) return null;

            const channel = resolveChannel(message, type, options);
            const key = `${channel}|${type}|${textOf(message, options.isHTML)}`;
            const at = clock();
            const duplicate = key === lastShown.key && at - lastShown.at < DEDUPE_WINDOW_MS;
            lastShown = { key, at };

            if (channel === 'status') {
                return showStatus(message, type, options);
            }
            if (duplicate && activeToast && activeToast.parentNode) {
                scheduleToastDismiss(activeToast, options.duration);
                return activeToast;
            }
            return showToast(message, type, options);
        }

        function clear() {
            const d = getDocument();
            if (d) d.querySelectorAll('.notification').forEach((el) => el.remove());
            activeToast = null;
            if (activeToastTimer) clearTimeout(activeToastTimer);
            activeToastTimer = null;
            const status = d && d.getElementById(STATUS_ELEMENT_ID);
            if (status) {
                status.classList.remove('show');
                status.textContent = '';
            }
            if (statusTimer) clearTimeout(statusTimer);
            statusTimer = null;
            lastShown = { key: '', at: 0 };
        }

        return {
            show,
            clear,
            isRoutineMessage,
            looksLikeAINotification,
            resolveChannel: (message, type, optionsOrDuration) => resolveChannel(message, type, normalizeOptions(optionsOrDuration)),
            constants: { DEDUPE_WINDOW_MS, STATUS_ELEMENT_ID, DEFAULT_DURATION }
        };
    }

    const api = { createNotificationCenter, ROUTINE_PATTERNS };

    if (typeof window !== 'undefined') {
        const center = createNotificationCenter();
        api.center = center;
        api.show = center.show;
        api.clear = center.clear;
        api.isRoutineMessage = center.isRoutineMessage;
        window.NightOwlNotifications = api;
        if (typeof window.showNotification !== 'function') {
            window.showNotification = center.show;
        }
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
