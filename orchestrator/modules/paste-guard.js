(function (root) {
    function createPasteGestureGuard(options = {}) {
        const now = typeof options.now === 'function' ? options.now : () => Date.now();
        const lockMs = Number.isFinite(options.lockMs) && options.lockMs > 0
            ? options.lockMs
            : 150;

        let lockedUntil = 0;

        return {
            tryAcquire() {
                const currentTime = now();
                if (currentTime < lockedUntil) {
                    return false;
                }

                lockedUntil = currentTime + lockMs;
                return true;
            }
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createPasteGestureGuard };
    }

    if (root) {
        root.createPasteGestureGuard = createPasteGestureGuard;
    }
})(typeof window !== 'undefined' ? window : globalThis);
