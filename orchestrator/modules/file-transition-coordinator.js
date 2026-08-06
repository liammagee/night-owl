/**
 * Latest-wins coordination for file and preview transitions.
 *
 * Each channel owns one current token. Beginning a newer transition resolves
 * the previous token as superseded. Callers must use token.commit() for every
 * externally visible write that happens after an await boundary.
 */
(function () {
    'use strict';

    function createCoordinator() {
        let sequence = 0;
        const currentByChannel = new Map();
        const latestByChannel = new Map();

        function settle(token, status, detail = {}) {
            if (!token || token.status !== 'pending') return token?.outcome || null;
            token.status = status;
            token.outcome = {
                id: token.id,
                channel: token.channel,
                key: token.key,
                status,
                ...detail
            };
            token._resolveDone(token.outcome);
            return token.outcome;
        }

        function isCurrent(token) {
            return Boolean(
                token &&
                token.status === 'pending' &&
                currentByChannel.get(token.channel) === token
            );
        }

        function isLatest(token) {
            return Boolean(token && latestByChannel.get(token.channel) === token);
        }

        function supersede(channel, reason = 'newer-transition') {
            const current = currentByChannel.get(channel);
            const latest = latestByChannel.get(channel);
            if (latest) latestByChannel.delete(channel);
            if (!current) return latest?.outcome || null;
            currentByChannel.delete(channel);
            return settle(current, 'superseded', { reason });
        }

        function begin(channel, key, metadata = {}) {
            if (!channel) throw new Error('Transition channel is required');
            supersede(channel);

            let resolveDone;
            const done = new Promise(resolve => {
                resolveDone = resolve;
            });
            const token = {
                id: ++sequence,
                channel,
                key: key == null ? null : String(key),
                metadata: { ...metadata },
                status: 'pending',
                outcome: null,
                done,
                _resolveDone: resolveDone,
                isCurrent: () => isCurrent(token),
                isLatest: () => isLatest(token),
                checkpoint: () => isCurrent(token),
                commit(callback) {
                    if (!isCurrent(token)) {
                        return { committed: false, status: token.status };
                    }
                    const value = typeof callback === 'function' ? callback() : callback;
                    return { committed: true, status: 'pending', value };
                }
            };
            currentByChannel.set(channel, token);
            latestByChannel.set(channel, token);
            return token;
        }

        function complete(token, detail = {}) {
            if (!isCurrent(token)) {
                return token?.outcome || settle(token, 'superseded', { reason: 'not-current' });
            }
            currentByChannel.delete(token.channel);
            return settle(token, 'committed', detail);
        }

        function fail(token, error) {
            if (!isCurrent(token)) {
                return token?.outcome || settle(token, 'superseded', { reason: 'failed-after-superseded' });
            }
            currentByChannel.delete(token.channel);
            if (latestByChannel.get(token.channel) === token) latestByChannel.delete(token.channel);
            return settle(token, 'failed', {
                error: error instanceof Error ? error.message : String(error || 'Unknown transition failure')
            });
        }

        function getCurrent(channel) {
            return currentByChannel.get(channel) || null;
        }

        return {
            begin,
            complete,
            fail,
            getCurrent,
            isCurrent,
            isLatest,
            supersede
        };
    }

    const api = { createCoordinator };
    if (typeof window !== 'undefined') {
        window.NightOwlFileTransitions = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
