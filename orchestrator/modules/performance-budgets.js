/**
 * Shared performance budgets and semantic readiness records.
 *
 * Workflow code records completion at the point where a view is usable. The
 * benchmark suite consumes these records instead of guessing with fixed waits.
 */
(function (root, factory) {
    const api = factory(root?.performance);
    if (root) root.NightOwlPerformanceBudgets = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createModule(browserPerformance) {
    'use strict';

    const DEFAULT_BUDGETS = Object.freeze({
        'startup.small': Object.freeze({ warningMs: 4000, regressionMs: 9000 }),
        'file-switch.markdown.small': Object.freeze({ warningMs: 800, regressionMs: 2500 }),
        'file-switch.markdown.large': Object.freeze({ warningMs: 2000, regressionMs: 6000 }),
        'preview.markdown.small': Object.freeze({ warningMs: 800, regressionMs: 2500 }),
        'preview.markdown.large': Object.freeze({ warningMs: 2500, regressionMs: 8000 }),
        'structured.jsonl.large': Object.freeze({ warningMs: 1800, regressionMs: 6000 }),
        'structured.csv.large': Object.freeze({ warningMs: 1800, regressionMs: 6000 }),
        'presentation-ready.small': Object.freeze({ warningMs: 3000, regressionMs: 8000 }),
        'presentation-ready.large': Object.freeze({ warningMs: 4500, regressionMs: 12000 }),
        'presentation-fit.large': Object.freeze({ warningMs: 1500, regressionMs: 5000 })
    });

    function percentile(samples, percentileValue) {
        const sorted = samples
            .map(Number)
            .filter(Number.isFinite)
            .sort((left, right) => left - right);
        if (!sorted.length) return null;
        const rank = Math.max(1, Math.ceil((percentileValue / 100) * sorted.length));
        return sorted[Math.min(rank - 1, sorted.length - 1)];
    }

    function summarizeSamples(samples, budget) {
        const finite = samples.map(Number).filter(value => Number.isFinite(value) && value >= 0);
        const p50 = percentile(finite, 50);
        const p95 = percentile(finite, 95);
        let status = 'pass';
        if (!finite.length) status = 'correctness-failure';
        else if (p95 > budget.regressionMs) status = 'regression';
        else if (p95 > budget.warningMs) status = 'warning';

        return {
            count: finite.length,
            samplesMs: finite,
            minMs: finite.length ? Math.min(...finite) : null,
            maxMs: finite.length ? Math.max(...finite) : null,
            p50Ms: p50,
            p95Ms: p95,
            status,
            budget: { ...budget }
        };
    }

    function createReadinessTracker(options = {}) {
        const performanceApi = options.performanceApi || browserPerformance || {
            now: () => 0,
            mark: () => {},
            measure: () => {}
        };
        const maxRecords = Math.max(10, Number(options.maxRecords) || 250);
        const records = [];
        const active = new Map();
        let sequence = 0;

        function now() {
            return typeof performanceApi.now === 'function' ? performanceApi.now() : 0;
        }

        function safeMark(name) {
            try {
                performanceApi.mark?.(name);
            } catch (_error) {
                // Marks are diagnostic; readiness records remain authoritative.
            }
        }

        function begin(name, metadata = {}) {
            if (!name) throw new Error('Readiness name is required');
            const id = ++sequence;
            const markBase = `nightowl:${name}:${id}`;
            const token = {
                id,
                name: String(name),
                metadata: { ...metadata },
                startTime: now(),
                status: 'pending',
                markBase
            };
            active.set(id, token);
            safeMark(`${markBase}:start`);
            return token;
        }

        function settle(token, status, detail = {}) {
            if (!token || token.status !== 'pending' || !active.has(token.id)) return null;
            const endTime = now();
            token.status = status;
            active.delete(token.id);
            safeMark(`${token.markBase}:end`);
            try {
                performanceApi.measure?.(
                    `nightowl:${token.name}`,
                    `${token.markBase}:start`,
                    `${token.markBase}:end`
                );
            } catch (_error) {
                // Some test doubles do not retain named marks.
            }
            const record = Object.freeze({
                id: token.id,
                name: token.name,
                status,
                startTime: token.startTime,
                endTime,
                durationMs: Math.max(0, endTime - token.startTime),
                metadata: Object.freeze({ ...token.metadata, ...detail })
            });
            records.push(record);
            if (records.length > maxRecords) records.splice(0, records.length - maxRecords);
            return record;
        }

        return Object.freeze({
            begin,
            complete: (token, detail) => settle(token, 'ready', detail),
            fail: (token, error, detail = {}) => settle(token, 'failed', {
                ...detail,
                error: error instanceof Error ? error.message : String(error || 'Unknown failure')
            }),
            cancel: (token, detail) => settle(token, 'cancelled', detail),
            getRecords: (name = null) => records
                .filter(record => !name || record.name === name)
                .map(record => ({ ...record, metadata: { ...record.metadata } })),
            getActive: (name = null) => Array.from(active.values())
                .filter(token => !name || token.name === name)
                .map(token => ({ ...token, metadata: { ...token.metadata } })),
            clear: () => {
                records.splice(0, records.length);
                active.clear();
            }
        });
    }

    return Object.freeze({
        DEFAULT_BUDGETS,
        percentile,
        summarizeSamples,
        createReadinessTracker,
        readiness: createReadinessTracker()
    });
});
