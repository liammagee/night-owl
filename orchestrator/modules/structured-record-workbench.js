/**
 * Pure helpers for schema-backed JSONL/CSV labelling and review workflows.
 */
(function (root, factory) {
    const api = factory();
    if (root) root.NightOwlRecordWorkbench = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createModule() {
    'use strict';

    function isMissing(value) {
        return value == null || (typeof value === 'string' && value.trim() === '') ||
            (Array.isArray(value) && value.length === 0);
    }

    function recordId(record, index = 0) {
        const value = record?.value ?? record ?? {};
        return ['item_id', 'record_id', 'id', 'key', 'name']
            .map(key => value?.[key])
            .find(candidate => !isMissing(candidate)) ?? `record-${index + 1}`;
    }

    function workflowState(record, workflow = {}) {
        const value = record?.value ?? record ?? {};
        const coderValue = workflow.coderField ? value[workflow.coderField] : undefined;
        const reviewerValue = workflow.reviewerField ? value[workflow.reviewerField] : undefined;
        const adjudicationValue = workflow.adjudicationField ? value[workflow.adjudicationField] : undefined;
        const coderComplete = Boolean(workflow.coderField) && !isMissing(coderValue);
        const reviewerComplete = Boolean(workflow.reviewerField) && !isMissing(reviewerValue);
        const adjudicated = Boolean(workflow.adjudicationField) && !isMissing(adjudicationValue);
        const disagreement = coderComplete && reviewerComplete && String(coderValue) !== String(reviewerValue);
        const bucket = adjudicated
            ? 'adjudicated'
            : disagreement
                ? 'disagreement'
                : reviewerComplete
                    ? 'reviewed'
                    : coderComplete
                        ? 'coded'
                        : 'pending';
        return { coderComplete, reviewerComplete, adjudicated, disagreement, bucket };
    }

    function builtInViews(workflow = {}) {
        const views = [];
        if (workflow.coderField) {
            views.push({ id: 'coder-queue', title: 'Coder queue', kind: 'coder-queue', builtin: true });
        }
        if (workflow.coderField && workflow.reviewerField) {
            views.push({ id: 'reviewer-queue', title: 'Reviewer queue', kind: 'reviewer-queue', builtin: true });
            views.push({ id: 'disagreements', title: 'Disagreements', kind: 'disagreements', builtin: true });
        }
        if (workflow.adjudicationField) {
            views.push({ id: 'adjudication-queue', title: 'Adjudication queue', kind: 'adjudication-queue', builtin: true });
            views.push({ id: 'adjudicated', title: 'Adjudicated', kind: 'adjudicated', builtin: true });
        }
        return views;
    }

    function availableViews(workflow = {}, localViews = []) {
        const result = [{ id: 'all', title: 'All records', builtin: true }];
        const seen = new Set(['all']);
        for (const view of [...(workflow.savedViews || []), ...builtInViews(workflow), ...(localViews || [])]) {
            if (!view?.id || seen.has(view.id)) continue;
            seen.add(view.id);
            result.push(view);
        }
        return result;
    }

    function specialValue(record, index, validation, workflow, field) {
        if (field === '$validation') return validation?.[index]?.status || 'generic';
        if (field === '$workflow') return workflowState(record, workflow).bucket;
        return (record?.value ?? record ?? {})[field];
    }

    function matchesFilter(record, index, validation, workflow, filter = {}) {
        if (!filter?.field) return true;
        const value = specialValue(record, index, validation, workflow, filter.field);
        const expected = filter.value;
        if (expected === '(empty)' && (filter.operator || 'equals') === 'equals') return isMissing(value);
        switch (filter.operator || 'equals') {
        case 'not_equals':
            return String(value ?? '') !== String(expected ?? '');
        case 'contains':
            return String(value ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
        case 'is_empty':
            return isMissing(value);
        case 'is_not_empty':
            return !isMissing(value);
        case 'in':
            return (Array.isArray(expected) ? expected : [expected]).some(item => String(item) === String(value));
        case 'equals':
        default:
            return String(value ?? '') === String(expected ?? '');
        }
    }

    function matchesView(record, index, validation, workflow, view) {
        if (!view || view.id === 'all') return true;
        const state = workflowState(record, workflow);
        if (view.kind === 'coder-queue') return !state.coderComplete;
        if (view.kind === 'reviewer-queue') return state.coderComplete && !state.reviewerComplete;
        if (view.kind === 'disagreements' || view.kind === 'adjudication-queue') {
            return state.disagreement && !state.adjudicated;
        }
        if (view.kind === 'adjudicated') return state.adjudicated;
        return (view.filters || []).every(filter => matchesFilter(record, index, validation, workflow, filter));
    }

    function compareValues(left, right) {
        if (isMissing(left) && isMissing(right)) return 0;
        if (isMissing(left)) return 1;
        if (isMissing(right)) return -1;
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
        return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
    }

    function selectRows(records = [], validation = [], options = {}) {
        const workflow = options.workflow || {};
        const views = availableViews(workflow, options.localViews);
        const view = views.find(candidate => candidate.id === options.viewId) || views[0];
        const query = String(options.query || '').trim().toLowerCase();
        const adHocFilter = options.filterField
            ? { field: options.filterField, operator: 'equals', value: options.filterValue }
            : null;
        const rows = records.map((record, index) => ({ record, index }))
            .filter(({ record, index }) => {
                if (query) {
                    try {
                        if (!JSON.stringify(record?.value ?? record).toLowerCase().includes(query)) return false;
                    } catch (_) {
                        return false;
                    }
                }
                if (!matchesView(record, index, validation, workflow, view)) return false;
                return !adHocFilter || matchesFilter(record, index, validation, workflow, adHocFilter);
            });
        const sort = view.sort || options.sort || {};
        const sortField = options.sortField || sort.field;
        const direction = (options.sortDirection || sort.direction) === 'desc' ? -1 : 1;
        if (sortField) {
            rows.sort((left, right) => {
                const comparison = compareValues(
                    specialValue(left.record, left.index, validation, workflow, sortField),
                    specialValue(right.record, right.index, validation, workflow, sortField)
                );
                return comparison === 0 ? left.index - right.index : comparison * direction;
            });
        }
        return rows;
    }

    function facetCounts(records = [], validation = [], workflow = {}, field) {
        const counts = new Map();
        records.forEach((record, index) => {
            const raw = specialValue(record, index, validation, workflow, field);
            const value = isMissing(raw) ? '(empty)' : String(raw);
            counts.set(value, (counts.get(value) || 0) + 1);
        });
        return Array.from(counts.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
    }

    function previewBulk(records = [], selectedIndices = [], field, value, options = {}) {
        const selected = new Set(Array.from(selectedIndices, Number));
        const changes = [];
        records.forEach((record, index) => {
            if (!selected.has(index)) return;
            const object = record?.value ?? record ?? {};
            const oldValue = object[field];
            const newValue = options.clear ? undefined : value;
            if ((options.clear && isMissing(oldValue)) || (!options.clear && String(oldValue ?? '') === String(newValue ?? ''))) return;
            changes.push({
                index,
                recordId: String(recordId(record, index)),
                field,
                oldValue,
                newValue,
                clear: options.clear === true
            });
        });
        return { field, value, clear: options.clear === true, changes, affected: changes.length };
    }

    function handoffMetadata(records = [], validation = [], workflow = {}, context = {}) {
        const workflowCounts = {
            coded: 0,
            reviewed: 0,
            disagreements: 0,
            unresolvedDisagreements: 0,
            adjudicated: 0
        };
        records.forEach(record => {
            const status = workflowState(record, workflow);
            if (status.coderComplete) workflowCounts.coded += 1;
            if (status.reviewerComplete) workflowCounts.reviewed += 1;
            if (status.disagreement) workflowCounts.disagreements += 1;
            if (status.disagreement && !status.adjudicated) workflowCounts.unresolvedDisagreements += 1;
            if (status.adjudicated) workflowCounts.adjudicated += 1;
        });
        const validationCounts = { complete: 0, incomplete: 0, invalid: 0 };
        validation.forEach(result => {
            if (result?.status in validationCounts) validationCounts[result.status] += 1;
        });
        return {
            version: 1,
            generatedAt: context.generatedAt || new Date().toISOString(),
            fileName: String(context.filePath || '').split(/[\\/]/).pop() || null,
            schemaId: context.schemaId || null,
            totalRecords: records.length,
            validation: validationCounts,
            workflow: workflowCounts,
            resume: {
                selectedIndex: Number(context.selectedIndex) || 0,
                selectedRecordId: records.length
                    ? String(recordId(records[Number(context.selectedIndex) || 0], Number(context.selectedIndex) || 0))
                    : null,
                activeView: context.activeView || 'all',
                updatedAt: context.updatedAt || null
            },
            filters: {
                query: context.query || '',
                field: context.filterField || '',
                value: context.filterValue || '',
                sortField: context.sortField || '',
                sortDirection: context.sortDirection || 'asc'
            }
        };
    }

    return Object.freeze({
        availableViews,
        builtInViews,
        facetCounts,
        handoffMetadata,
        isMissing,
        matchesFilter,
        matchesView,
        previewBulk,
        recordId,
        selectRows,
        workflowState
    });
});
