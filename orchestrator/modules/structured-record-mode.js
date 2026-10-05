/**
 * Structured Record Mode
 *
 * Presents JSONL and CSV files as searchable lists of readable, editable
 * records. Monaco remains the source of truth: form edits replace only the
 * corresponding source record, preserving normal undo and autosave.
 *
 * @module structured-record-mode
 */
(function () {
    'use strict';

    const uiStateStore = typeof module !== 'undefined' && module.exports
        ? require('./ui-state-store').store
        : window.NightOwlUIState;
    const schemaTools = typeof module !== 'undefined' && module.exports
        ? require('./structured-record-schema')
        : window.NightOwlRecordSchema;
    const workbenchTools = typeof module !== 'undefined' && module.exports
        ? require('./structured-record-workbench')
        : window.NightOwlRecordWorkbench;
    const getRecordUIState = () => uiStateStore?.getState?.().structuredRecord || {
        active: false,
        sourceVisible: false
    };

    const MULTILINE_FIELD_RE = /(context|message|turn|reference|text|content|description|instruction|rationale|note|prompt|response|answer|basis)/i;
    const PRIMARY_ID_KEYS = ['item_id', 'record_id', 'id', 'key', 'name'];
    const SECONDARY_KEYS = ['domain', 'category', 'type', 'status', 'coder_id'];

    function isJSONLFile(filePath) {
        return typeof filePath === 'string' && /\.jsonl$/i.test(filePath);
    }

    function isCSVFile(filePath) {
        return typeof filePath === 'string' && /\.csv$/i.test(filePath);
    }

    function isRecordFile(filePath) {
        return isJSONLFile(filePath) || isCSVFile(filePath);
    }

    function getRecordFormat(filePath) {
        return isCSVFile(filePath) ? 'csv' : 'jsonl';
    }

    function isRecordObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function parseJSONL(content) {
        const source = typeof content === 'string' ? content : String(content || '');
        const lines = source.split('\n');
        const records = [];
        const errors = [];

        lines.forEach((raw, lineIndex) => {
            if (!raw.trim()) return;

            try {
                const value = JSON.parse(raw);
                if (!isRecordObject(value)) {
                    errors.push({
                        lineNumber: lineIndex + 1,
                        message: 'Expected a JSON object on this line.'
                    });
                    return;
                }
                records.push({
                    value,
                    raw,
                    lineIndex,
                    lineNumber: lineIndex + 1
                });
            } catch (error) {
                errors.push({
                    lineNumber: lineIndex + 1,
                    message: error?.message || 'Invalid JSON.'
                });
            }
        });

        return {
            format: 'jsonl',
            source,
            lines,
            records,
            errors,
            trailingNewline: source.endsWith('\n')
        };
    }

    function parseCSVRows(source) {
        const rows = [];
        const errors = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        let rowStartOffset = 0;
        let rowStartLine = 1;
        let currentLine = 1;
        let index = 0;

        const pushRow = endOffset => {
            row.push(field);
            rows.push({
                values: row,
                startOffset: rowStartOffset,
                endOffset,
                lineNumber: rowStartLine,
                endLine: currentLine
            });
            row = [];
            field = '';
        };

        while (index < source.length) {
            const char = source[index];

            if (inQuotes) {
                if (char === '"' && source[index + 1] === '"') {
                    field += '"';
                    index += 2;
                } else if (char === '"') {
                    inQuotes = false;
                    index += 1;
                } else if (char === '\r' && source[index + 1] === '\n') {
                    field += '\r\n';
                    currentLine += 1;
                    index += 2;
                } else {
                    field += char;
                    if (char === '\n') currentLine += 1;
                    index += 1;
                }
                continue;
            }

            if (char === '"' && field === '') {
                inQuotes = true;
                index += 1;
            } else if (char === ',') {
                row.push(field);
                field = '';
                index += 1;
            } else if (char === '\n' || (char === '\r' && source[index + 1] === '\n')) {
                const newlineLength = char === '\r' ? 2 : 1;
                pushRow(index);
                index += newlineLength;
                currentLine += 1;
                rowStartOffset = index;
                rowStartLine = currentLine;
            } else {
                field += char;
                index += 1;
            }
        }

        if (inQuotes) {
            errors.push({
                lineNumber: rowStartLine,
                message: 'Quoted field is not closed.'
            });
        }

        if (rowStartOffset < source.length || row.length || field.length) {
            pushRow(source.length);
        }

        return { rows, errors };
    }

    function makeUniqueCSVHeaders(headerValues, width) {
        const headers = [];
        const counts = new Map();
        for (let index = 0; index < width; index += 1) {
            const raw = String(headerValues[index] ?? '').trim();
            const base = raw || `Column ${index + 1}`;
            const count = (counts.get(base) || 0) + 1;
            counts.set(base, count);
            headers.push(count === 1 ? base : `${base} (${count})`);
        }
        return headers;
    }

    function parseCSV(content) {
        const source = typeof content === 'string' ? content : String(content || '');
        const parsedRows = parseCSVRows(source);
        const errors = [...parsedRows.errors];
        const rows = parsedRows.rows;

        if (!rows.length) {
            return {
                format: 'csv',
                source,
                headers: [],
                records: [],
                errors,
                trailingNewline: /(?:\r\n|\n)$/.test(source),
                newline: source.includes('\r\n') ? '\r\n' : '\n'
            };
        }

        const width = rows.reduce((maximum, current) => Math.max(maximum, current.values.length), 0);
        const headers = makeUniqueCSVHeaders(rows[0].values, width);
        const records = [];

        rows.slice(1).forEach((sourceRow, rowIndex) => {
            if (sourceRow.values.length === 1 && sourceRow.values[0] === '' && sourceRow.startOffset === sourceRow.endOffset) {
                return;
            }
            const values = [...sourceRow.values];
            while (values.length < width) values.push('');
            const value = {};
            headers.forEach((header, columnIndex) => {
                value[header] = values[columnIndex] ?? '';
            });
            records.push({
                value,
                row: values,
                rowIndex,
                startOffset: sourceRow.startOffset,
                endOffset: sourceRow.endOffset,
                lineNumber: sourceRow.lineNumber,
                endLine: sourceRow.endLine
            });
        });

        return {
            format: 'csv',
            source,
            headers,
            headerRow: rows[0],
            records,
            errors,
            trailingNewline: /(?:\r\n|\n)$/.test(source),
            newline: source.includes('\r\n') ? '\r\n' : '\n'
        };
    }

    function serializeCSVField(value) {
        const text = String(value ?? '');
        if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    function serializeCSVRow(values) {
        return values.map(serializeCSVField).join(',');
    }

    function replaceCSVRecord(content, record, values) {
        const source = String(content || '');
        if (!record || !Number.isInteger(record.startOffset) || !Number.isInteger(record.endOffset)) {
            throw new Error('CSV record location is unavailable.');
        }
        return `${source.slice(0, record.startOffset)}${serializeCSVRow(values)}${source.slice(record.endOffset)}`;
    }

    function parseRecordContent(filePath, content) {
        return isCSVFile(filePath) ? parseCSV(content) : parseJSONL(content);
    }

    function prettifyFieldName(name) {
        return String(name || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, letter => letter.toUpperCase());
    }

    function valueType(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    function fieldValueToText(value) {
        if (value === undefined) return '';
        if (typeof value === 'string') return value;
        if (value === null) return 'null';
        if (typeof value === 'object') return JSON.stringify(value, null, 2);
        return String(value);
    }

    function coerceFieldValue(rawValue, originalValue) {
        const type = valueType(originalValue);
        const raw = String(rawValue ?? '');

        if (type === 'string') return raw;
        if (type === 'number') {
            if (!raw.trim()) throw new Error('Enter a number.');
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) throw new Error('Enter a finite number.');
            return parsed;
        }
        if (type === 'boolean') {
            if (raw === 'true') return true;
            if (raw === 'false') return false;
            throw new Error('Choose true or false.');
        }

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            throw new Error(type === 'null' ? 'Enter a valid JSON value.' : `Enter valid JSON for this ${type}.`);
        }

        if (type === 'array' && !Array.isArray(parsed)) {
            throw new Error('Enter a JSON array.');
        }
        if (type === 'object' && !isRecordObject(parsed)) {
            throw new Error('Enter a JSON object.');
        }
        return parsed;
    }

    function replaceRecordLine(content, lineNumber, value) {
        const lines = String(content || '').split('\n');
        const lineIndex = Number(lineNumber) - 1;
        if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
            throw new Error(`Line ${lineNumber} is outside this document.`);
        }
        lines[lineIndex] = JSON.stringify(value);
        return lines.join('\n');
    }

    function firstPresentValue(record, keys) {
        for (const key of keys) {
            const value = record?.[key];
            if (value !== undefined && value !== null && String(value).trim()) {
                return String(value);
            }
        }
        return '';
    }

    function recordTitle(record, index) {
        return firstPresentValue(record, PRIMARY_ID_KEYS) || `Record ${index + 1}`;
    }

    function recordSecondary(record) {
        return firstPresentValue(record, SECONDARY_KEYS);
    }

    function recordSnippet(record) {
        const preferredKeys = ['scenario_context', 'learner_message', 'prompt', 'text', 'content', 'tutor_turn'];
        const preferred = firstPresentValue(record, preferredKeys);
        if (preferred) return preferred;

        for (const value of Object.values(record || {})) {
            if (typeof value === 'string' && value.trim()) return value;
        }
        return '';
    }

    function recordMatches(record, query) {
        const normalized = String(query || '').trim().toLowerCase();
        if (!normalized) return true;
        try {
            return JSON.stringify(record).toLowerCase().includes(normalized);
        } catch (_) {
            return false;
        }
    }

    const state = {
        format: 'jsonl',
        filePath: null,
        content: '',
        parsed: null,
        selectedIndex: 0,
        selectedByFile: new Map(),
        query: '',
        container: null,
        fieldTimers: new Map(),
        generation: 0,
        initialized: false,
        schema: null,
        schemaPath: null,
        schemaSource: 'generic',
        schemaError: null,
        schemaGeneration: 0,
        schemasByFile: new Map(),
        validation: [],
        progress: null,
        workbench: {
            viewMode: 'form',
            viewId: 'all',
            filterField: '',
            filterValue: '',
            sortField: '',
            sortDirection: 'asc',
            selectedIndices: new Set(),
            localViews: [],
            bulkPreview: null,
            updatedAt: null,
            restoredKey: null
        }
    };

    function hasWorkbench() {
        return Boolean(state.schema?.workflow && workbenchTools);
    }

    function workbenchStorageKey(kind = 'resume') {
        if (!state.filePath || !state.schema?.id) return null;
        return `nightowl-record-workbench:${kind}:v1:${state.schema.id}:${state.filePath}`;
    }

    function readStoredJSON(key, fallback) {
        if (!key) return fallback;
        try {
            const value = window.localStorage?.getItem?.(key);
            return value ? JSON.parse(value) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function writeStoredJSON(key, value) {
        if (!key) return false;
        try {
            window.localStorage?.setItem?.(key, JSON.stringify(value));
            return true;
        } catch (_) {
            return false;
        }
    }

    function resetWorkbenchState(options = {}) {
        state.workbench.viewMode = 'form';
        state.workbench.viewId = 'all';
        state.workbench.filterField = '';
        state.workbench.filterValue = '';
        state.workbench.sortField = '';
        state.workbench.sortDirection = 'asc';
        state.workbench.selectedIndices = new Set();
        state.workbench.localViews = [];
        state.workbench.bulkPreview = null;
        state.workbench.updatedAt = null;
        if (!options.keepRestoreKey) state.workbench.restoredKey = null;
    }

    function persistWorkbenchResume() {
        if (!hasWorkbench()) return null;
        const updatedAt = new Date().toISOString();
        state.workbench.updatedAt = updatedAt;
        const record = state.parsed?.records?.[state.selectedIndex];
        const value = {
            selectedIndex: state.selectedIndex,
            selectedRecordId: record ? String(workbenchTools.recordId(record, state.selectedIndex)) : null,
            viewMode: state.workbench.viewMode,
            viewId: state.workbench.viewId,
            filterField: state.workbench.filterField,
            filterValue: state.workbench.filterValue,
            sortField: state.workbench.sortField,
            sortDirection: state.workbench.sortDirection,
            updatedAt
        };
        writeStoredJSON(workbenchStorageKey(), value);
        return value;
    }

    function restoreWorkbenchState() {
        if (!hasWorkbench()) {
            resetWorkbenchState();
            return;
        }
        const key = workbenchStorageKey();
        if (state.workbench.restoredKey === key) return;
        resetWorkbenchState({ keepRestoreKey: true });
        state.workbench.restoredKey = key;
        state.workbench.localViews = readStoredJSON(workbenchStorageKey('views'), []);
        const stored = readStoredJSON(key, null);
        const workflow = state.schema.workflow;
        const defaultSort = workflow.defaultSort || {};
        state.workbench.sortField = stored?.sortField || defaultSort.field || '';
        state.workbench.sortDirection = stored?.sortDirection || defaultSort.direction || 'asc';
        if (!stored) return;
        state.workbench.viewMode = stored.viewMode === 'grid' ? 'grid' : 'form';
        state.workbench.viewId = String(stored.viewId || 'all');
        state.workbench.filterField = String(stored.filterField || '');
        state.workbench.filterValue = String(stored.filterValue || '');
        state.workbench.updatedAt = stored.updatedAt || null;
        const records = state.parsed?.records || [];
        const matchedIndex = stored.selectedRecordId == null
            ? -1
            : records.findIndex((record, index) => String(workbenchTools.recordId(record, index)) === String(stored.selectedRecordId));
        state.selectedIndex = matchedIndex >= 0
            ? matchedIndex
            : Math.max(0, Math.min(records.length - 1, Number(stored.selectedIndex) || 0));
    }

    function availableWorkbenchViews() {
        return hasWorkbench()
            ? workbenchTools.availableViews(state.schema.workflow, state.workbench.localViews)
            : [];
    }

    function visibleRecordRows() {
        const records = state.parsed?.records || [];
        if (!hasWorkbench()) {
            return records.map((record, index) => ({ record, index }))
                .filter(({ record }) => recordMatches(record.value, state.query));
        }
        return workbenchTools.selectRows(records, state.validation, {
            workflow: state.schema.workflow,
            localViews: state.workbench.localViews,
            viewId: state.workbench.viewId,
            query: state.query,
            filterField: state.workbench.filterValue ? state.workbench.filterField : '',
            filterValue: state.workbench.filterValue,
            sortField: state.workbench.sortField,
            sortDirection: state.workbench.sortDirection
        });
    }

    function replaceSelectOptions(select, options, selectedValue) {
        if (!select) return;
        select.replaceChildren();
        options.forEach(item => {
            const option = document.createElement('option');
            option.value = String(item.value ?? '');
            option.textContent = item.label;
            select.appendChild(option);
        });
        select.value = String(selectedValue ?? '');
        if (select.value !== String(selectedValue ?? '') && select.options.length) select.selectedIndex = 0;
    }

    function getHandoffMetadata() {
        if (!hasWorkbench()) return null;
        return workbenchTools.handoffMetadata(
            state.parsed?.records || [],
            state.validation,
            state.schema.workflow,
            {
                filePath: state.filePath,
                schemaId: state.schema.id,
                selectedIndex: state.selectedIndex,
                activeView: state.workbench.viewId,
                updatedAt: state.workbench.updatedAt,
                query: state.query,
                filterField: state.workbench.filterField,
                filterValue: state.workbench.filterValue,
                sortField: state.workbench.sortField,
                sortDirection: state.workbench.sortDirection
            }
        );
    }

    function refreshWorkbenchControls() {
        const enabled = hasWorkbench();
        const controls = getElement('jsonl-workbench-controls');
        const toggle = getElement('jsonl-workbench-toggle');
        if (controls) controls.hidden = !enabled;
        if (toggle) {
            toggle.hidden = !enabled;
            toggle.textContent = state.workbench.viewMode === 'grid' ? 'Show form' : 'Show grid';
            toggle.setAttribute('aria-pressed', String(state.workbench.viewMode === 'grid'));
        }
        const resume = getElement('jsonl-workbench-resume');
        if (!enabled) {
            if (resume) resume.hidden = true;
            return;
        }

        const workflow = state.schema.workflow;
        const views = availableWorkbenchViews();
        if (!views.some(view => view.id === state.workbench.viewId)) state.workbench.viewId = 'all';
        replaceSelectOptions(
            getElement('jsonl-workbench-view'),
            views.map(view => ({ value: view.id, label: view.title })),
            state.workbench.viewId
        );

        const fieldOptions = [
            { value: '', label: 'All values' },
            { value: '$validation', label: 'Validation state' },
            { value: '$workflow', label: 'Review state' },
            ...state.schema.fields.map(field => ({ value: field.name, label: field.label }))
        ];
        replaceSelectOptions(getElement('jsonl-workbench-filter-field'), fieldOptions, state.workbench.filterField);
        const valueSelect = getElement('jsonl-workbench-filter-value');
        const facetValues = state.workbench.filterField
            ? workbenchTools.facetCounts(
                state.parsed?.records || [],
                state.validation,
                workflow,
                state.workbench.filterField
            )
            : [];
        replaceSelectOptions(valueSelect, [
            { value: '', label: 'All' },
            ...facetValues.map(facet => ({ value: facet.value, label: `${facet.value} (${facet.count})` }))
        ], state.workbench.filterValue);
        if (valueSelect) valueSelect.disabled = !state.workbench.filterField;

        replaceSelectOptions(getElement('jsonl-workbench-sort'), [
            { value: '', label: 'Source order' },
            { value: '$validation', label: 'Validation state' },
            { value: '$workflow', label: 'Review state' },
            ...state.schema.fields.map(field => ({ value: field.name, label: field.label }))
        ], state.workbench.sortField);
        const direction = getElement('jsonl-workbench-sort-direction');
        if (direction) {
            direction.textContent = state.workbench.sortDirection === 'desc' ? '↓' : '↑';
            direction.setAttribute('aria-label', state.workbench.sortDirection === 'desc' ? 'Sort descending' : 'Sort ascending');
        }
        const saveView = getElement('jsonl-workbench-save-view');
        if (saveView) saveView.hidden = !(state.workbench.filterField && state.workbench.filterValue);
        const deleteView = getElement('jsonl-workbench-delete-view');
        const currentView = state.workbench.localViews.find(view => view.id === state.workbench.viewId);
        if (deleteView) deleteView.hidden = !currentView;

        const metadata = getHandoffMetadata();
        const stats = getElement('jsonl-workbench-stats');
        if (stats && metadata) {
            stats.textContent = `Coded ${metadata.workflow.coded}/${metadata.totalRecords} · Reviewed ${metadata.workflow.reviewed} · Disagreements ${metadata.workflow.unresolvedDisagreements} · Adjudicated ${metadata.workflow.adjudicated}`;
        }
        if (resume) {
            resume.hidden = false;
            resume.textContent = state.workbench.updatedAt
                ? `Resume saved ${new Date(state.workbench.updatedAt).toLocaleString()}`
                : 'Resume point will be saved automatically';
        }
    }

    function saveCurrentWorkbenchView() {
        if (!hasWorkbench() || !state.workbench.filterField || !state.workbench.filterValue) return false;
        const title = window.prompt?.('Name this saved record view:', 'My review view');
        if (!String(title || '').trim()) return false;
        const idBase = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'saved-view';
        let id = `local-${idBase}`;
        let suffix = 2;
        const ids = new Set(availableWorkbenchViews().map(view => view.id));
        while (ids.has(id)) id = `local-${idBase}-${suffix++}`;
        const view = {
            id,
            title: String(title).trim(),
            filters: [{
                field: state.workbench.filterField,
                operator: 'equals',
                value: state.workbench.filterValue
            }],
            sort: state.workbench.sortField ? {
                field: state.workbench.sortField,
                direction: state.workbench.sortDirection
            } : null,
            local: true
        };
        state.workbench.localViews.push(view);
        state.workbench.viewId = id;
        state.workbench.filterField = '';
        state.workbench.filterValue = '';
        writeStoredJSON(workbenchStorageKey('views'), state.workbench.localViews);
        persistWorkbenchResume();
        renderRecordList();
        renderRecordDetail();
        updateStatus(`Saved view “${view.title}”`, 'saved');
        return true;
    }

    function deleteCurrentWorkbenchView() {
        const index = state.workbench.localViews.findIndex(view => view.id === state.workbench.viewId);
        if (index < 0) return false;
        const [removed] = state.workbench.localViews.splice(index, 1);
        state.workbench.viewId = 'all';
        writeStoredJSON(workbenchStorageKey('views'), state.workbench.localViews);
        persistWorkbenchResume();
        renderRecordList();
        renderRecordDetail();
        updateStatus(`Removed view “${removed.title}”`, 'saved');
        return true;
    }

    async function copyHandoffMetadata() {
        const metadata = getHandoffMetadata();
        if (!metadata) return false;
        const text = JSON.stringify(metadata, null, 2);
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else throw new Error('Clipboard access is unavailable.');
        updateStatus('Handoff metadata copied', 'saved');
        state.container?.dispatchEvent(new CustomEvent('structured-record-handoff-copied', { detail: metadata }));
        return true;
    }

    function pathDirectory(filePath) {
        const value = String(filePath || '');
        const index = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
        return index >= 0 ? value.slice(0, index) : '';
    }

    function joinPath(basePath, childPath) {
        const base = String(basePath || '').replace(/[\\/]+$/, '');
        const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/';
        return `${base}${separator}${String(childPath || '').replace(/^[\\/]+/, '')}`;
    }

    function schemaSidecarPaths(filePath) {
        const direct = `${filePath}.schema.json`;
        const stem = String(filePath || '').replace(/\.(?:jsonl|csv)$/i, '.schema.json');
        return [...new Set([direct, stem])];
    }

    async function readSchemaJSON(filePath) {
        const files = window.electronAPI?.files;
        if (!files?.checkFileExists || !files?.readFileContentOnly) return null;
        const exists = await files.checkFileExists(filePath);
        if (!(exists === true || exists?.exists)) return null;
        const result = await files.readFileContentOnly(filePath);
        if (!result?.success) throw new Error(result?.error || `Could not read ${filePath}`);
        try {
            return JSON.parse(result.content);
        } catch (error) {
            throw new Error(`Invalid schema JSON in ${filePath}: ${error.message}`);
        }
    }

    async function getWorkspaceRoots() {
        const result = await window.electronAPI?.workspace?.getWorkspaceFolders?.();
        const candidates = [
            result?.primaryFolder,
            ...(Array.isArray(result?.workspaceFolders) ? result.workspaceFolders : []),
            window.appSettings?.workingDirectory,
            pathDirectory(state.filePath)
        ];
        return [...new Set(candidates.map(value => (
            typeof value === 'string' ? value : value?.path
        )).filter(Boolean))];
    }

    function refreshSchemaUI() {
        const summary = getElement('jsonl-schema-summary');
        const choose = getElement('jsonl-schema-select');
        const check = getElement('jsonl-schema-check');
        if (summary) {
            summary.textContent = state.schemaError
                ? state.schemaError
                : state.schema
                    ? `${state.schema.title} · ${state.schemaSource}`
                    : 'Generic record fields';
            summary.dataset.tone = state.schemaError ? 'error' : state.schema ? 'schema' : 'generic';
        }
        if (choose) choose.textContent = state.schema ? 'Change schema…' : 'Choose schema…';
        if (check) check.hidden = !state.schema;
        refreshWorkbenchControls();
    }

    function refreshSchemaRendering() {
        restoreWorkbenchState();
        refreshSchemaUI();
        if (!state.parsed || state.parsed.errors.length) return;
        renderRecordList();
        renderRecordDetail();
        updateFooter();
    }

    function setSchema(schema, options = {}) {
        const normalized = schema?.fieldsByName
            ? schema
            : schemaTools.normalizeSchema(schema, {
                path: options.path || null,
                source: options.source || 'explicit'
            });
        if (normalized.formats.length && !normalized.formats.includes(state.format)) {
            throw new Error(`${normalized.title} does not support ${state.format.toUpperCase()} files.`);
        }
        state.schema = normalized;
        state.workbench.restoredKey = null;
        state.schemaPath = options.path || normalized.path || null;
        state.schemaSource = options.source || normalized.source || 'explicit';
        state.schemaError = null;
        if (state.filePath) state.schemasByFile.set(state.filePath, {
            schema: normalized,
            path: state.schemaPath,
            source: state.schemaSource
        });
        refreshSchemaRendering();
        return normalized;
    }

    function useGenericSchema(options = {}) {
        state.schema = null;
        state.schemaPath = null;
        state.schemaSource = 'generic';
        state.schemaError = options.error || null;
        resetWorkbenchState();
        if (options.remember && state.filePath) state.schemasByFile.set(state.filePath, null);
        refreshSchemaRendering();
    }

    async function resolveSchemaForFile(filePath, generation = state.schemaGeneration) {
        if (!schemaTools || !window.electronAPI) return null;
        try {
            for (const candidatePath of schemaSidecarPaths(filePath)) {
                const documentValue = await readSchemaJSON(candidatePath);
                if (generation !== state.schemaGeneration || filePath !== state.filePath) return null;
                if (!documentValue) continue;
                const selected = schemaTools.selectSchemaFromDocument(documentValue, filePath, {
                    path: candidatePath,
                    source: 'sidecar'
                });
                if (selected) return setSchema(selected, { path: candidatePath, source: 'sidecar' });
            }

            const workspaceRoots = await getWorkspaceRoots();
            for (const root of workspaceRoots) {
                const manifestPath = joinPath(root, '.nightowl/record-schemas.json');
                const documentValue = await readSchemaJSON(manifestPath);
                if (generation !== state.schemaGeneration || filePath !== state.filePath) return null;
                if (!documentValue) continue;
                const matched = schemaTools.selectSchemaFromDocument(documentValue, filePath, {
                    path: manifestPath,
                    source: 'workspace pattern'
                });
                if (matched) return setSchema(matched, { path: manifestPath, source: 'workspace pattern' });
            }
        } catch (error) {
            if (generation === state.schemaGeneration && filePath === state.filePath) {
                useGenericSchema({ error: error.message });
                updateStatus('Schema could not be loaded', 'error');
            }
        }
        return null;
    }

    async function selectSchemaFromDialog() {
        const files = window.electronAPI?.files;
        if (!files?.dialogOpenFile || !files?.readFileContentOnly) {
            throw new Error('Schema file selection is unavailable.');
        }
        const selection = await files.dialogOpenFile({
            title: 'Choose a NightOwl record schema',
            defaultPath: pathDirectory(state.filePath),
            filters: [{ name: 'JSON schema files', extensions: ['json'] }]
        });
        if (!selection?.success) return selection?.canceled ? null : Promise.reject(new Error(selection?.error || 'Schema selection failed'));
        const result = await files.readFileContentOnly(selection.filePath);
        if (!result?.success) throw new Error(result?.error || 'Schema file could not be read.');
        const documentValue = JSON.parse(result.content);
        const schema = schemaTools.selectSchemaFromDocument(documentValue, state.filePath, {
            path: selection.filePath,
            source: 'explicit'
        });
        if (!schema) throw new Error('The selected schema file has no pattern matching this record file.');
        return setSchema(schema, { path: selection.filePath, source: 'explicit' });
    }

    function getElement(id) {
        return typeof document !== 'undefined' ? document.getElementById(id) : null;
    }

    function getFileStatusLabel(filePath) {
        const lower = String(filePath || '').toLowerCase();
        if (lower.endsWith('.jsonl')) return 'JSONL (.jsonl)';
        if (lower.endsWith('.csv')) return 'CSV (.csv)';
        if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return 'JSON (.json)';
        if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'HTML (.html)';
        if (lower.endsWith('.bib')) return 'BibTeX (.bib)';
        if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'Markdown (.md)';
        return 'Plain text';
    }

    function updateDocumentStatus(source, recordCount) {
        window.updateStatusBar?.(source);
        const previewCount = getElement('preview-word-count');
        if (previewCount) {
            previewCount.textContent = `Records: ${recordCount}`;
            previewCount.title = `${state.format.toUpperCase()} records in this document`;
        }
        const fileStatus = getElement('file-status');
        if (fileStatus) fileStatus.textContent = getFileStatusLabel(state.filePath);
    }

    function createContainer() {
        if (state.container?.isConnected) return state.container;
        const previewPane = getElement('preview-pane');
        if (!previewPane) return null;

        const container = document.createElement('section');
        container.id = 'jsonl-record-mode';
        container.className = 'jsonl-record-mode nightowl-ui-hidden';
        container.setAttribute('aria-label', 'Structured record editor');
        container.innerHTML = `
            <header class="jsonl-mode-header">
                <div>
                    <div id="jsonl-mode-eyebrow" class="jsonl-mode-eyebrow">Record mode</div>
                    <div class="jsonl-mode-title-row">
                        <h2 id="jsonl-mode-title">Records</h2>
                        <span id="jsonl-mode-status" class="jsonl-mode-status" aria-live="polite"></span>
                    </div>
                    <div id="jsonl-schema-summary" class="jsonl-schema-summary">Generic record fields</div>
                </div>
                <div class="jsonl-mode-actions">
                    <button id="jsonl-workbench-toggle" class="jsonl-mode-button" type="button" hidden>Show grid</button>
                    <button id="jsonl-schema-select" class="jsonl-mode-button" type="button">Choose schema…</button>
                    <button id="jsonl-schema-check" class="jsonl-mode-button" type="button" hidden>Check for export</button>
                    <button id="jsonl-source-toggle" class="jsonl-mode-button" type="button">Show raw source</button>
                </div>
            </header>
            <div class="jsonl-mode-body">
                <aside id="jsonl-record-sidebar" class="jsonl-record-sidebar" aria-label="Records">
                    <section id="jsonl-workbench-controls" class="jsonl-workbench-controls" aria-label="Labelling queue controls" hidden>
                        <label class="jsonl-search-label" for="jsonl-workbench-view">Saved view</label>
                        <div class="jsonl-workbench-control-row">
                            <select id="jsonl-workbench-view" class="jsonl-record-search"></select>
                            <button id="jsonl-workbench-delete-view" class="jsonl-mode-button jsonl-workbench-icon-button" type="button" title="Delete this local view" hidden>×</button>
                        </div>
                        <label class="jsonl-search-label" for="jsonl-workbench-filter-field">Facet filter</label>
                        <div class="jsonl-workbench-control-row">
                            <select id="jsonl-workbench-filter-field" class="jsonl-record-search"></select>
                            <select id="jsonl-workbench-filter-value" class="jsonl-record-search" disabled></select>
                        </div>
                        <button id="jsonl-workbench-save-view" class="jsonl-mode-button" type="button" hidden>Save current view…</button>
                        <label class="jsonl-search-label" for="jsonl-workbench-sort">Sort</label>
                        <div class="jsonl-workbench-control-row">
                            <select id="jsonl-workbench-sort" class="jsonl-record-search"></select>
                            <button id="jsonl-workbench-sort-direction" class="jsonl-mode-button jsonl-workbench-icon-button" type="button" title="Reverse sort">↑</button>
                        </div>
                        <div id="jsonl-workbench-stats" class="jsonl-workbench-stats"></div>
                        <button id="jsonl-workbench-copy-handoff" class="jsonl-mode-button" type="button">Copy handoff metadata</button>
                    </section>
                    <label class="jsonl-search-label" for="jsonl-record-search">Find a record</label>
                    <input id="jsonl-record-search" class="jsonl-record-search" type="search" placeholder="ID, domain, or text…" autocomplete="off">
                    <div id="jsonl-record-list-summary" class="jsonl-record-list-summary"></div>
                    <div id="jsonl-record-progress" class="jsonl-record-progress" role="status" aria-live="polite"></div>
                    <div id="jsonl-record-list" class="jsonl-record-list" role="listbox"></div>
                </aside>
                <main id="jsonl-record-detail" class="jsonl-record-detail"></main>
            </div>
            <footer class="jsonl-mode-footer">
                <button id="jsonl-prev-record" class="jsonl-mode-button" type="button">← Previous</button>
                <span id="jsonl-position" class="jsonl-position"></span>
                <span id="jsonl-workbench-resume" class="jsonl-workbench-resume" hidden></span>
                <button id="jsonl-next-record" class="jsonl-mode-button" type="button">Next →</button>
            </footer>
        `;
        previewPane.appendChild(container);
        state.container = container;
        uiStateStore?.render?.();

        getElement('jsonl-source-toggle')?.addEventListener('click', () => {
            setSourceVisible(!getRecordUIState().sourceVisible);
        });
        getElement('jsonl-workbench-toggle')?.addEventListener('click', () => {
            if (!hasWorkbench()) return;
            state.workbench.viewMode = state.workbench.viewMode === 'grid' ? 'form' : 'grid';
            state.workbench.bulkPreview = null;
            persistWorkbenchResume();
            renderRecordDetail();
            refreshWorkbenchControls();
        });
        getElement('jsonl-schema-select')?.addEventListener('click', async () => {
            try {
                await selectSchemaFromDialog();
                if (state.schema) updateStatus(`Using ${state.schema.title}`, 'saved');
            } catch (error) {
                state.schemaError = error.message;
                refreshSchemaUI();
                updateStatus('Schema could not be loaded', 'error');
            }
        });
        getElement('jsonl-schema-check')?.addEventListener('click', () => checkForExport());
        getElement('jsonl-prev-record')?.addEventListener('click', () => selectAdjacentRecord(-1));
        getElement('jsonl-next-record')?.addEventListener('click', () => selectAdjacentRecord(1));
        getElement('jsonl-record-search')?.addEventListener('input', event => {
            state.query = event.target.value;
            renderRecordList();
            if (state.workbench.viewMode === 'grid') renderRecordDetail();
        });
        getElement('jsonl-workbench-view')?.addEventListener('change', event => {
            state.workbench.viewId = event.target.value || 'all';
            state.workbench.selectedIndices.clear();
            state.workbench.bulkPreview = null;
            persistWorkbenchResume();
            renderRecordList();
            renderRecordDetail();
        });
        getElement('jsonl-workbench-filter-field')?.addEventListener('change', event => {
            state.workbench.filterField = event.target.value;
            state.workbench.filterValue = '';
            state.workbench.selectedIndices.clear();
            refreshWorkbenchControls();
            renderRecordList();
            renderRecordDetail();
        });
        getElement('jsonl-workbench-filter-value')?.addEventListener('change', event => {
            state.workbench.filterValue = event.target.value;
            state.workbench.selectedIndices.clear();
            persistWorkbenchResume();
            renderRecordList();
            renderRecordDetail();
        });
        getElement('jsonl-workbench-sort')?.addEventListener('change', event => {
            state.workbench.sortField = event.target.value;
            persistWorkbenchResume();
            renderRecordList();
            renderRecordDetail();
        });
        getElement('jsonl-workbench-sort-direction')?.addEventListener('click', () => {
            state.workbench.sortDirection = state.workbench.sortDirection === 'asc' ? 'desc' : 'asc';
            persistWorkbenchResume();
            refreshWorkbenchControls();
            renderRecordList();
            renderRecordDetail();
        });
        getElement('jsonl-workbench-save-view')?.addEventListener('click', saveCurrentWorkbenchView);
        getElement('jsonl-workbench-delete-view')?.addEventListener('click', deleteCurrentWorkbenchView);
        getElement('jsonl-workbench-copy-handoff')?.addEventListener('click', copyHandoffMetadata);

        return container;
    }

    function updateModeLabels() {
        const formatLabel = state.format.toUpperCase();
        const eyebrow = getElement('jsonl-mode-eyebrow');
        const sidebar = getElement('jsonl-record-sidebar');
        if (eyebrow) eyebrow.textContent = `${formatLabel} record mode`;
        if (sidebar) sidebar.setAttribute('aria-label', `${formatLabel} records`);
        state.container?.setAttribute('aria-label', `${formatLabel} record editor`);
    }

    function applyModeLayout() {
        const sourceVisible = getRecordUIState().sourceVisible;
        uiStateStore?.dispatch?.({ type: 'SET_STRUCTURED_RECORD', active: true, sourceVisible });
        updateSourceToggle(sourceVisible);
    }

    function setSourceVisible(visible) {
        const sourceVisible = Boolean(visible);
        uiStateStore?.dispatch?.({ type: 'SET_RECORD_SOURCE_VISIBLE', visible: sourceVisible });
        updateSourceToggle(sourceVisible);
    }

    function updateSourceToggle(sourceVisible) {
        const toggle = getElement('jsonl-source-toggle');
        if (toggle) {
            toggle.textContent = sourceVisible ? 'Focus records' : `Show raw ${state.format.toUpperCase()}`;
            toggle.setAttribute('aria-pressed', String(sourceVisible));
        }
    }

    function cancelPendingEdits() {
        for (const timer of state.fieldTimers.values()) {
            clearTimeout(timer);
        }
        state.fieldTimers.clear();
        state.generation += 1;
    }

    function activate(filePath) {
        const container = createContainer();
        if (!container) return false;

        if (state.filePath && state.filePath !== filePath) {
            state.selectedByFile.set(state.filePath, state.selectedIndex);
            cancelPendingEdits();
        }
        if (state.filePath !== filePath) {
            state.filePath = filePath;
            state.format = getRecordFormat(filePath);
            state.selectedIndex = state.selectedByFile.get(filePath) || 0;
            state.query = '';
            state.content = '';
            state.schemaGeneration += 1;
            const cachedSchema = state.schemasByFile.get(filePath);
            state.schema = cachedSchema?.schema || null;
            state.schemaPath = cachedSchema?.path || null;
            state.schemaSource = cachedSchema?.source || 'generic';
            state.schemaError = null;
            resetWorkbenchState();
            const search = getElement('jsonl-record-search');
            if (search) search.value = '';
            if (!state.schemasByFile.has(filePath)) {
                void resolveSchemaForFile(filePath, state.schemaGeneration);
            }
        }

        updateModeLabels();
        refreshSchemaUI();
        applyModeLayout();
        return true;
    }

    function deactivate() {
        cancelPendingEdits();
        if (!getRecordUIState().active) return;
        if (state.filePath) state.selectedByFile.set(state.filePath, state.selectedIndex);
        state.format = 'jsonl';
        state.filePath = null;
        state.content = '';
        state.parsed = null;
        state.schemaGeneration += 1;
        state.schema = null;
        state.schemaPath = null;
        state.schemaSource = 'generic';
        state.schemaError = null;
        state.validation = [];
        state.progress = null;
        state.query = '';
        resetWorkbenchState();
        uiStateStore?.dispatch?.({ type: 'SET_STRUCTURED_RECORD', active: false });
        const fileStatus = getElement('file-status');
        if (fileStatus) fileStatus.textContent = getFileStatusLabel(window.currentFilePath);
    }

    function updateStatus(message, tone = '') {
        const status = getElement('jsonl-mode-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.tone = tone;
    }

    function renderErrors(errors) {
        const detail = getElement('jsonl-record-detail');
        const list = getElement('jsonl-record-list');
        const listSummary = getElement('jsonl-record-list-summary');
        if (list) list.replaceChildren();
        if (listSummary) listSummary.textContent = 'Fix source errors to continue';
        if (!detail) return;

        detail.replaceChildren();
        const panel = document.createElement('div');
        panel.className = 'jsonl-error-panel';
        const title = document.createElement('h3');
        title.textContent = `Could not open record mode (${errors.length} ${errors.length === 1 ? 'error' : 'errors'})`;
        const explanation = document.createElement('p');
        explanation.textContent = state.format === 'csv'
            ? 'The CSV contains an unclosed quoted field. Show the raw CSV and fix these lines:'
            : 'Every non-blank line must contain one complete JSON object. Show the raw JSONL and fix these lines:';
        const errorList = document.createElement('ul');
        errors.forEach(error => {
            const item = document.createElement('li');
            const line = document.createElement('strong');
            line.textContent = `Line ${error.lineNumber}: `;
            item.append(line, document.createTextNode(error.message));
            errorList.appendChild(item);
        });
        panel.append(title, explanation, errorList);
        detail.appendChild(panel);
        updateStatus(`${errors.length} invalid ${errors.length === 1 ? 'line' : 'lines'}`, 'error');
        setSourceVisible(true);
        updateFooter();
    }

    function refreshValidation(filteredCount = state.parsed?.records?.length || 0) {
        const records = state.parsed?.records || [];
        const result = state.schema
            ? schemaTools.summarizeRecords(records, state.schema, filteredCount)
            : {
                validation: records.map(() => ({ status: 'generic', fields: {}, issues: [], missing: [] })),
                progress: {
                    total: records.length,
                    complete: 0,
                    incomplete: 0,
                    invalid: 0,
                    filtered: filteredCount
                }
            };
        state.validation = result.validation;
        state.progress = result.progress;
        const progress = getElement('jsonl-record-progress');
        if (progress) {
            progress.textContent = state.schema
                ? `Complete: ${result.progress.complete} · Incomplete: ${result.progress.incomplete} · Invalid: ${result.progress.invalid} · Filtered: ${result.progress.filtered}/${result.progress.total}`
                : `Filtered: ${result.progress.filtered}/${result.progress.total}`;
            progress.dataset.schemaActive = String(Boolean(state.schema));
        }
        return result;
    }

    function checkForExport() {
        const result = refreshValidation();
        const handoff = getHandoffMetadata();
        if (!state.schema) {
            const outcome = { allowed: true, blocked: false, reason: 'generic', progress: result.progress };
            updateStatus('No task schema; export checks are not required', 'valid');
            return outcome;
        }
        const hasIncomplete = result.progress.incomplete > 0 || result.progress.invalid > 0;
        const blocked = state.schema.completion.blockExport && hasIncomplete;
        const outcome = {
            allowed: !blocked,
            blocked,
            reason: blocked ? 'schema-completion-required' : 'schema-check-passed',
            progress: result.progress,
            schemaId: state.schema.id,
            handoff
        };
        updateStatus(
            blocked
                ? `Export blocked: ${result.progress.incomplete} incomplete, ${result.progress.invalid} invalid`
                : hasIncomplete
                    ? 'Schema check is advisory; export remains available'
                    : 'Task is complete and valid for export',
            blocked ? 'error' : 'valid'
        );
        state.container?.dispatchEvent(new CustomEvent('structured-record-export-check', { detail: outcome }));
        return outcome;
    }

    function renderRecordList() {
        const list = getElement('jsonl-record-list');
        const summary = getElement('jsonl-record-list-summary');
        if (!list || !state.parsed) return;

        refreshValidation(state.parsed.records.length);
        const matches = visibleRecordRows();
        refreshValidation(matches.length);
        if (hasWorkbench() && matches.length && !matches.some(row => row.index === state.selectedIndex)) {
            state.selectedIndex = matches[0].index;
            persistWorkbenchResume();
        }

        list.replaceChildren();
        matches.forEach(({ record, index }) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'jsonl-record-list-item';
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', String(index === state.selectedIndex));
            if (index === state.selectedIndex) button.classList.add('active');

            const top = document.createElement('span');
            top.className = 'jsonl-record-list-item-top';
            const title = document.createElement('strong');
            title.textContent = recordTitle(record.value, index);
            const secondaryValue = recordSecondary(record.value);
            top.appendChild(title);
            if (secondaryValue) {
                const secondary = document.createElement('span');
                secondary.className = 'jsonl-record-badge';
                secondary.textContent = secondaryValue;
                top.appendChild(secondary);
            }
            const validation = state.validation[index];
            if (state.schema && validation) {
                button.classList.add(`is-${validation.status}`);
                button.dataset.validationState = validation.status;
                const validationBadge = document.createElement('span');
                validationBadge.className = 'jsonl-record-validation-badge';
                validationBadge.dataset.state = validation.status;
                validationBadge.textContent = validation.status;
                top.appendChild(validationBadge);
                button.setAttribute('aria-label', `${recordTitle(record.value, index)}, ${validation.status}`);
            }

            const snippet = document.createElement('span');
            snippet.className = 'jsonl-record-list-snippet';
            snippet.textContent = recordSnippet(record.value);
            const line = document.createElement('span');
            line.className = 'jsonl-record-line-number';
            line.textContent = record.endLine && record.endLine !== record.lineNumber
                ? `Lines ${record.lineNumber}–${record.endLine}`
                : `Line ${record.lineNumber}`;
            button.append(top, snippet, line);
            button.addEventListener('click', () => selectRecord(index));
            list.appendChild(button);
        });

        if (summary) {
            const constrained = state.query || (hasWorkbench() && (
                state.workbench.viewId !== 'all' || state.workbench.filterValue
            ));
            summary.textContent = constrained
                ? `${matches.length} of ${state.parsed.records.length} records`
                : `${state.parsed.records.length} records`;
        }
        refreshWorkbenchControls();
    }

    function clearFieldError(wrapper) {
        if (!wrapper) return;
        wrapper.classList.remove('invalid');
        wrapper.querySelector('.jsonl-field-error')?.remove();
    }

    function showFieldError(wrapper, message) {
        if (!wrapper) return;
        clearFieldError(wrapper);
        wrapper.classList.add('invalid');
        const error = document.createElement('div');
        error.className = 'jsonl-field-error';
        error.textContent = message;
        wrapper.appendChild(error);
    }

    function offsetToPosition(source, offset) {
        const before = String(source || '').slice(0, Math.max(0, offset));
        const lines = before.split('\n');
        return {
            lineNumber: lines.length,
            column: lines[lines.length - 1].replace(/\r$/, '').length + 1
        };
    }

    function makeSourceEdit(record, nextValue, nextRow = record.row) {
        const model = window.editor?.getModel?.();
        const isCSV = state.format === 'csv';
        const replacement = isCSV ? serializeCSVRow(nextRow) : JSON.stringify(nextValue);
        let range;

        if (isCSV) {
            const start = typeof model?.getPositionAt === 'function'
                ? model.getPositionAt(record.startOffset)
                : offsetToPosition(state.content, record.startOffset);
            const end = typeof model?.getPositionAt === 'function'
                ? model.getPositionAt(record.endOffset)
                : offsetToPosition(state.content, record.endOffset);
            range = window.monaco?.Range
                ? new window.monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column)
                : {
                    startLineNumber: start.lineNumber,
                    startColumn: start.column,
                    endLineNumber: end.lineNumber,
                    endColumn: end.column
                };
        } else {
            const maxColumn = typeof model?.getLineMaxColumn === 'function'
                ? model.getLineMaxColumn(record.lineNumber)
                : String(model?.getLineContent?.(record.lineNumber) || record.raw || '').length + 1;
            range = window.monaco?.Range
                ? new window.monaco.Range(record.lineNumber, 1, record.lineNumber, maxColumn)
                : {
                    startLineNumber: record.lineNumber,
                    startColumn: 1,
                    endLineNumber: record.lineNumber,
                    endColumn: maxColumn
                };
        }

        return { record, nextValue, nextRow, range, text: replacement };
    }

    function applySourceEdits(entries, sourceId = `${state.format}-record-mode`) {
        if (!entries.length) return false;
        let computedContent = state.content;
        if (state.format === 'csv') {
            entries.slice().sort((left, right) => right.record.startOffset - left.record.startOffset).forEach(entry => {
                computedContent = `${computedContent.slice(0, entry.record.startOffset)}${entry.text}${computedContent.slice(entry.record.endOffset)}`;
            });
        } else {
            const lines = String(computedContent || '').split('\n');
            entries.forEach(entry => {
                lines[entry.record.lineNumber - 1] = entry.text;
            });
            computedContent = lines.join('\n');
        }

        const model = window.editor?.getModel?.();
        if (model && typeof window.editor?.executeEdits === 'function') {
            window.editor.pushUndoStop?.();
            window.editor.executeEdits(sourceId, entries.map(entry => ({ range: entry.range, text: entry.text })));
            window.editor.pushUndoStop?.();
            const editorContent = window.editor.getValue?.();
            state.content = typeof editorContent === 'string' && editorContent !== state.content
                ? editorContent
                : computedContent;
        } else if (window.editor?.setValue) {
            state.content = computedContent;
            window.editor.setValue(state.content);
        } else {
            state.content = computedContent;
        }

        state.parsed = parseRecordContent(state.filePath, state.content);
        updateDocumentStatus(state.content, state.parsed?.records?.length || 0);
        return true;
    }

    function replaceSourceRecord(record, nextValue) {
        return applySourceEdits([makeSourceEdit(record, nextValue)], `${state.format}-record-mode`);
    }

    function commitField(recordIndex, key, rawValue, wrapper, field = null) {
        const record = state.parsed?.records?.[recordIndex];
        if (!record) return false;
        if (field?.readOnly) return false;
        const originalValue = record.value[key];

        try {
            const nextValue = field
                ? schemaTools.coerceValue(rawValue, field, state.format, originalValue).value
                : coerceFieldValue(rawValue, originalValue);
            clearFieldError(wrapper);
            if (JSON.stringify(nextValue) === JSON.stringify(originalValue)) return true;
            if (state.format === 'csv') {
                const columnIndex = state.parsed.headers.indexOf(key);
                if (columnIndex < 0) throw new Error(`${field?.label || prettifyFieldName(key)} is not present in the CSV header.`);
                record.row[columnIndex] = String(nextValue ?? '');
            }
            record.value[key] = nextValue;
            replaceSourceRecord(record, record.value);
            if (hasWorkbench()) {
                state.workbench.updatedAt = new Date().toISOString();
                persistWorkbenchResume();
            }
            updateStatus(
                state.format === 'csv' ? `Updated record ${recordIndex + 1}` : `Updated line ${record.lineNumber}`,
                'saved'
            );
            refreshValidation();
            renderRecordList();
            window.dispatchEvent(new CustomEvent('structured-record-updated', {
                detail: { filePath: state.filePath, format: state.format, lineNumber: record.lineNumber, key }
            }));
            return true;
        } catch (error) {
            showFieldError(wrapper, error?.message || 'Invalid value.');
            updateStatus(`Check ${prettifyFieldName(key)}`, 'error');
            return false;
        }
    }

    function scheduleStringCommit(control, recordIndex, key, wrapper, field = null) {
        const existing = state.fieldTimers.get(control);
        if (existing) clearTimeout(existing);
        const editContext = {
            filePath: state.filePath,
            generation: state.generation,
            model: window.editor?.getModel?.()
        };
        const timer = setTimeout(() => {
            state.fieldTimers.delete(control);
            if (
                editContext.generation !== state.generation ||
                editContext.filePath !== state.filePath ||
                editContext.model !== window.editor?.getModel?.()
            ) {
                return;
            }
            commitField(recordIndex, key, control.value, wrapper, field);
        }, 300);
        state.fieldTimers.set(control, timer);
    }

    function flushControl(control, recordIndex, key, wrapper, field = null) {
        const existing = state.fieldTimers.get(control);
        if (existing) {
            clearTimeout(existing);
            state.fieldTimers.delete(control);
        }
        commitField(recordIndex, key, control.value, wrapper, field);
    }

    function createSelectControl(options, value) {
        const control = document.createElement('select');
        options.forEach(optionValue => {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionValue || '— Not set —';
            control.appendChild(option);
        });
        const currentValue = value == null ? '' : String(value);
        if (!options.some(option => String(option) === currentValue)) {
            const current = document.createElement('option');
            current.value = currentValue;
            current.textContent = `${value} (current value)`;
            control.appendChild(current);
        }
        control.value = currentValue;
        return control;
    }

    function createFieldControl(recordIndex, key, value, wrapper, field = null) {
        const type = field?.type || valueType(value);
        const fieldOptions = field?.enum ? [...field.enum] : null;
        if (fieldOptions && !fieldOptions.some(option => String(option) === '')) fieldOptions.unshift('');
        let control;

        if (fieldOptions) {
            control = createSelectControl(fieldOptions, value);
            control.addEventListener('change', () => commitField(recordIndex, key, control.value, wrapper, field));
        } else if (type === 'boolean') {
            control = createSelectControl(['true', 'false'], value);
            control.addEventListener('change', () => commitField(recordIndex, key, control.value, wrapper, field));
        } else if (type === 'number' || type === 'integer') {
            control = document.createElement('input');
            control.type = 'number';
            control.step = type === 'integer' ? '1' : 'any';
            if (field?.min != null) control.min = String(field.min);
            if (field?.max != null) control.max = String(field.max);
            control.value = value == null ? '' : String(value);
            control.addEventListener('change', () => commitField(recordIndex, key, control.value, wrapper, field));
            control.addEventListener('blur', () => commitField(recordIndex, key, control.value, wrapper, field));
        } else if (type === 'string' && !MULTILINE_FIELD_RE.test(key) && String(value ?? '').length <= 100 && !String(value ?? '').includes('\n')) {
            control = document.createElement('input');
            control.type = 'text';
            control.value = value ?? '';
            control.addEventListener('input', () => scheduleStringCommit(control, recordIndex, key, wrapper, field));
            control.addEventListener('blur', () => flushControl(control, recordIndex, key, wrapper, field));
        } else {
            control = document.createElement('textarea');
            control.value = fieldValueToText(value);
            const estimatedRows = Math.ceil(control.value.length / 88) + (control.value.match(/\n/g) || []).length;
            control.rows = Math.max(3, Math.min(10, estimatedRows));
            if (type === 'string' || type === 'multiline') {
                control.addEventListener('input', () => scheduleStringCommit(control, recordIndex, key, wrapper, field));
                control.addEventListener('blur', () => flushControl(control, recordIndex, key, wrapper, field));
            } else {
                control.classList.add('jsonl-code-value');
                control.addEventListener('blur', () => commitField(recordIndex, key, control.value, wrapper, field));
            }
        }

        control.classList.add('jsonl-field-control');
        control.dataset.field = key;
        control.setAttribute('aria-label', field?.label || prettifyFieldName(key));
        if (field?.required) control.setAttribute('aria-required', 'true');
        if (field?.readOnly) {
            wrapper.classList.add('is-read-only');
            if (control.tagName === 'SELECT') control.disabled = true;
            else control.readOnly = true;
        }
        return control;
    }

    function editableWorkbenchFields() {
        if (!state.schema) return [];
        return state.schema.fields.filter(field => {
            if (field.readOnly) return false;
            return state.format !== 'csv' || state.parsed?.headers?.includes(field.name);
        });
    }

    function applyBulkPreview() {
        const preview = state.workbench.bulkPreview;
        if (!preview?.changes?.length) return false;
        const field = state.schema?.fieldsByName?.[preview.field] || null;
        const entries = preview.changes.map(change => {
            const record = state.parsed.records[change.index];
            const nextValue = { ...record.value };
            const nextRow = state.format === 'csv' ? [...record.row] : record.row;
            if (state.format === 'csv') {
                const columnIndex = state.parsed.headers.indexOf(change.field);
                if (columnIndex < 0) throw new Error(`${field?.label || change.field} is not present in the CSV header.`);
                const value = change.clear ? '' : String(change.newValue ?? '');
                nextRow[columnIndex] = value;
                nextValue[change.field] = value;
            } else if (change.clear) {
                delete nextValue[change.field];
            } else {
                nextValue[change.field] = change.newValue;
            }
            return makeSourceEdit(record, nextValue, nextRow);
        });
        applySourceEdits(entries, 'structured-record-workbench-bulk');
        state.workbench.bulkPreview = null;
        state.workbench.updatedAt = new Date().toISOString();
        refreshValidation();
        persistWorkbenchResume();
        renderRecordList();
        renderRecordDetail();
        updateFooter();
        updateStatus(`Updated ${entries.length} ${entries.length === 1 ? 'record' : 'records'} in one undo step`, 'saved');
        window.dispatchEvent(new CustomEvent('structured-record-bulk-updated', {
            detail: { filePath: state.filePath, format: state.format, field: preview.field, count: entries.length }
        }));
        return true;
    }

    function createBulkToolbar(rows) {
        const section = document.createElement('section');
        section.className = 'jsonl-workbench-bulk';
        const selectedCount = state.workbench.selectedIndices.size;
        const summary = document.createElement('strong');
        summary.textContent = `${selectedCount} selected`;
        const fieldSelect = document.createElement('select');
        fieldSelect.className = 'jsonl-field-control jsonl-workbench-bulk-field';
        fieldSelect.setAttribute('aria-label', 'Bulk edit field');
        editableWorkbenchFields().forEach(field => {
            const option = document.createElement('option');
            option.value = field.name;
            option.textContent = field.label;
            fieldSelect.appendChild(option);
        });
        const valueSlot = document.createElement('span');
        valueSlot.className = 'jsonl-workbench-bulk-value';
        let valueControl = null;
        const renderValueControl = () => {
            valueSlot.replaceChildren();
            const field = state.schema.fieldsByName[fieldSelect.value];
            valueControl = field?.enum
                ? createSelectControl(field.enum, field.enum[0])
                : document.createElement('input');
            if (!field?.enum) {
                valueControl.type = field?.type === 'number' || field?.type === 'integer' ? 'number' : 'text';
                valueControl.placeholder = 'Value';
            }
            valueControl.classList.add('jsonl-field-control');
            valueControl.setAttribute('aria-label', 'Bulk edit value');
            valueSlot.appendChild(valueControl);
        };
        renderValueControl();
        fieldSelect.addEventListener('change', () => {
            state.workbench.bulkPreview = null;
            renderValueControl();
        });

        const previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.className = 'jsonl-mode-button';
        previewButton.textContent = 'Preview fill';
        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'jsonl-mode-button';
        clearButton.textContent = 'Preview clear';
        [fieldSelect, valueControl, previewButton, clearButton].forEach(control => {
            control.disabled = selectedCount === 0 || fieldSelect.options.length === 0;
        });

        const preview = clear => {
            try {
                const field = state.schema.fieldsByName[fieldSelect.value];
                const value = clear ? undefined : schemaTools.coerceValue(
                    valueControl.value,
                    field,
                    state.format,
                    undefined
                ).value;
                state.workbench.bulkPreview = workbenchTools.previewBulk(
                    state.parsed.records,
                    state.workbench.selectedIndices,
                    fieldSelect.value,
                    value,
                    { clear }
                );
                renderRecordDetail();
                updateStatus(
                    state.workbench.bulkPreview.affected
                        ? `Previewing ${state.workbench.bulkPreview.affected} bulk changes`
                        : 'Bulk edit would not change any records',
                    state.workbench.bulkPreview.affected ? 'valid' : ''
                );
            } catch (error) {
                updateStatus(error.message || 'Invalid bulk value', 'error');
            }
        };
        previewButton.addEventListener('click', () => preview(false));
        clearButton.addEventListener('click', () => preview(true));
        section.append(summary, fieldSelect, valueSlot, previewButton, clearButton);

        const bulkPreview = state.workbench.bulkPreview;
        if (bulkPreview) {
            const panel = document.createElement('div');
            panel.className = 'jsonl-workbench-bulk-preview';
            const heading = document.createElement('strong');
            heading.textContent = bulkPreview.affected
                ? `${bulkPreview.clear ? 'Clear' : 'Fill'} ${bulkPreview.field} on ${bulkPreview.affected} ${bulkPreview.affected === 1 ? 'record' : 'records'}?`
                : 'No source changes are needed.';
            const examples = document.createElement('span');
            examples.textContent = bulkPreview.changes.slice(0, 5).map(change => (
                `${change.recordId}: ${change.oldValue ?? 'empty'} → ${change.clear ? 'empty' : change.newValue}`
            )).join(' · ');
            const actions = document.createElement('span');
            actions.className = 'jsonl-workbench-bulk-preview-actions';
            const apply = document.createElement('button');
            apply.type = 'button';
            apply.className = 'jsonl-mode-button';
            apply.textContent = 'Apply changes';
            apply.disabled = bulkPreview.affected === 0;
            apply.addEventListener('click', applyBulkPreview);
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'jsonl-mode-button';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', () => {
                state.workbench.bulkPreview = null;
                renderRecordDetail();
            });
            actions.append(apply, cancel);
            panel.append(heading, examples, actions);
            section.appendChild(panel);
        }
        return section;
    }

    function renderRecordGrid(detail) {
        const rows = visibleRecordRows();
        const workflow = state.schema.workflow;
        const columns = workflow.gridColumns.length
            ? workflow.gridColumns
            : state.schema.fields.slice(0, 6).map(field => field.name);
        detail.classList.add('jsonl-record-detail-grid');
        detail.appendChild(createBulkToolbar(rows));

        const wrapper = document.createElement('div');
        wrapper.className = 'jsonl-workbench-table-wrapper';
        const table = document.createElement('table');
        table.className = 'jsonl-workbench-table';
        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        const selectHeading = document.createElement('th');
        const selectAll = document.createElement('input');
        selectAll.type = 'checkbox';
        selectAll.setAttribute('aria-label', 'Select all filtered records');
        selectAll.checked = rows.length > 0 && rows.every(row => state.workbench.selectedIndices.has(row.index));
        selectAll.indeterminate = !selectAll.checked && rows.some(row => state.workbench.selectedIndices.has(row.index));
        selectAll.addEventListener('change', () => {
            rows.forEach(row => {
                if (selectAll.checked) state.workbench.selectedIndices.add(row.index);
                else state.workbench.selectedIndices.delete(row.index);
            });
            state.workbench.bulkPreview = null;
            renderRecordDetail();
        });
        selectHeading.appendChild(selectAll);
        headRow.appendChild(selectHeading);
        const stateHeading = document.createElement('th');
        stateHeading.textContent = 'State';
        headRow.appendChild(stateHeading);
        columns.forEach(name => {
            const heading = document.createElement('th');
            heading.textContent = state.schema.fieldsByName[name]?.label || prettifyFieldName(name);
            headRow.appendChild(heading);
        });
        head.appendChild(headRow);
        table.appendChild(head);

        const body = document.createElement('tbody');
        rows.forEach(({ record, index }) => {
            const row = document.createElement('tr');
            row.tabIndex = 0;
            row.className = index === state.selectedIndex ? 'active' : '';
            row.setAttribute('aria-selected', String(index === state.selectedIndex));
            const choose = () => selectRecord(index, { keepGrid: true });
            row.addEventListener('click', choose);
            row.addEventListener('keydown', event => {
                if (event.key === 'Enter') choose();
            });
            const selectCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = state.workbench.selectedIndices.has(index);
            checkbox.setAttribute('aria-label', `Select ${recordTitle(record.value, index)}`);
            checkbox.addEventListener('click', event => event.stopPropagation());
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) state.workbench.selectedIndices.add(index);
                else state.workbench.selectedIndices.delete(index);
                state.workbench.bulkPreview = null;
                renderRecordDetail();
            });
            selectCell.appendChild(checkbox);
            row.appendChild(selectCell);
            const workflowStatus = workbenchTools.workflowState(record, workflow);
            const statusCell = document.createElement('td');
            const status = document.createElement('span');
            status.className = 'jsonl-record-validation-badge';
            status.dataset.state = workflowStatus.bucket;
            status.textContent = workflowStatus.bucket;
            statusCell.appendChild(status);
            row.appendChild(statusCell);
            columns.forEach(name => {
                const cell = document.createElement('td');
                const value = record.value[name];
                cell.textContent = typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : String(value ?? '');
                cell.title = cell.textContent;
                row.appendChild(cell);
            });
            body.appendChild(row);
        });
        table.appendChild(body);
        wrapper.appendChild(table);
        detail.appendChild(wrapper);
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'jsonl-empty-state';
            empty.textContent = 'No records match this view and filter.';
            detail.appendChild(empty);
        }
    }

    function renderRecordDetail() {
        const detail = getElement('jsonl-record-detail');
        const record = state.parsed?.records?.[state.selectedIndex];
        if (!detail) return;
        detail.replaceChildren();
        detail.classList.remove('jsonl-record-detail-grid');

        if (hasWorkbench() && state.workbench.viewMode === 'grid') {
            renderRecordGrid(detail);
            return;
        }

        if (!record) {
            const empty = document.createElement('div');
            empty.className = 'jsonl-empty-state';
            empty.textContent = state.format === 'csv'
                ? 'This CSV has a header but no data records yet.'
                : 'This file does not contain any JSON records yet.';
            detail.appendChild(empty);
            return;
        }

        const header = document.createElement('div');
        header.className = 'jsonl-record-detail-header';
        const titleGroup = document.createElement('div');
        const kicker = document.createElement('div');
        kicker.className = 'jsonl-record-detail-kicker';
        kicker.textContent = `Record ${state.selectedIndex + 1} · source line ${record.lineNumber}`;
        const title = document.createElement('h3');
        title.textContent = recordTitle(record.value, state.selectedIndex);
        titleGroup.append(kicker, title);
        const secondaryValue = recordSecondary(record.value);
        if (secondaryValue) {
            const badge = document.createElement('span');
            badge.className = 'jsonl-record-detail-badge';
            badge.textContent = secondaryValue;
            header.append(titleGroup, badge);
        } else {
            header.appendChild(titleGroup);
        }

        const hint = document.createElement('p');
        hint.className = 'jsonl-record-hint';
        hint.textContent = state.schema
            ? `${state.schema.description || `Complete the ${state.schema.title} fields.`} Changes are written back to this record’s ${state.format.toUpperCase()} source through the normal editor workflow.`
            : `Edit the readable fields below. Changes are written back to this record’s ${state.format.toUpperCase()} source and saved through the normal editor workflow.`;
        if (hasWorkbench() && state.schema.workflow.labelValues.length) {
            hint.textContent += ` Keyboard: Alt+1–${Math.min(9, state.schema.workflow.labelValues.length)} labels this record; Cmd/Ctrl+Enter saves and advances.`;
        }

        const form = document.createElement('div');
        form.className = 'jsonl-record-form';
        schemaTools.orderedFields(record.value, state.schema).forEach(({ name: key, value, field }) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'jsonl-field';
            if (field?.type === 'multiline' || MULTILINE_FIELD_RE.test(key) || (typeof value === 'string' && value.length > 100) || typeof value === 'object') {
                wrapper.classList.add('jsonl-field-wide');
            }
            const labelRow = document.createElement('div');
            labelRow.className = 'jsonl-field-label-row';
            const label = document.createElement('label');
            label.textContent = field?.label || prettifyFieldName(key);
            if (field?.required) {
                const required = document.createElement('span');
                required.className = 'jsonl-field-required';
                required.textContent = ' required';
                label.appendChild(required);
            }
            const type = document.createElement('span');
            type.className = 'jsonl-field-type';
            type.textContent = field?.enum ? 'choice' : field?.type || valueType(value);
            labelRow.append(label, type);
            const control = createFieldControl(state.selectedIndex, key, value, wrapper, field);
            label.htmlFor = `jsonl-field-${state.selectedIndex}-${key}`;
            control.id = label.htmlFor;
            wrapper.append(labelRow, control);
            if (field?.help) {
                const help = document.createElement('p');
                help.className = 'jsonl-field-help';
                help.id = `${control.id}-help`;
                help.textContent = field.help;
                control.setAttribute('aria-describedby', help.id);
                wrapper.appendChild(help);
            }
            const fieldIssues = state.validation[state.selectedIndex]?.fields?.[key] || [];
            if (fieldIssues.length) showFieldError(wrapper, fieldIssues.map(issue => issue.message).join(' '));
            form.appendChild(wrapper);
        });

        detail.append(header, hint, form);
    }

    function updateFooter() {
        const count = state.parsed?.records?.length || 0;
        const rows = hasWorkbench() ? visibleRecordRows() : [];
        const visiblePosition = hasWorkbench() ? rows.findIndex(row => row.index === state.selectedIndex) : -1;
        const position = getElement('jsonl-position');
        const previous = getElement('jsonl-prev-record');
        const next = getElement('jsonl-next-record');
        if (position) position.textContent = count
            ? hasWorkbench() && visiblePosition >= 0
                ? `${visiblePosition + 1} of ${rows.length} in view · ${state.selectedIndex + 1} of ${count}`
                : `${state.selectedIndex + 1} of ${count}`
            : 'No records';
        if (previous) previous.disabled = !count || (hasWorkbench() ? visiblePosition <= 0 : state.selectedIndex <= 0);
        if (next) next.disabled = !count || (hasWorkbench() ? visiblePosition < 0 || visiblePosition >= rows.length - 1 : state.selectedIndex >= count - 1);
        refreshWorkbenchControls();
    }

    function selectRecord(index) {
        const count = state.parsed?.records?.length || 0;
        if (!count) return;
        state.selectedIndex = Math.max(0, Math.min(count - 1, Number(index) || 0));
        if (state.filePath) state.selectedByFile.set(state.filePath, state.selectedIndex);
        persistWorkbenchResume();
        renderRecordList();
        renderRecordDetail();
        updateFooter();
        getElement('jsonl-record-detail')?.scrollTo?.({ top: 0, behavior: 'smooth' });
    }

    function selectAdjacentRecord(delta) {
        if (!hasWorkbench()) return selectRecord(state.selectedIndex + delta);
        const rows = visibleRecordRows();
        if (!rows.length) return false;
        const current = rows.findIndex(row => row.index === state.selectedIndex);
        const next = current < 0
            ? (delta < 0 ? rows.length - 1 : 0)
            : Math.max(0, Math.min(rows.length - 1, current + delta));
        selectRecord(rows[next].index);
        return true;
    }

    function applyLabelChoice(choiceIndex) {
        const workflow = state.schema?.workflow;
        const value = workflow?.labelValues?.[choiceIndex];
        const field = workflow?.labelField ? state.schema.fieldsByName[workflow.labelField] : null;
        if (!field || value === undefined) return false;
        const applied = commitField(state.selectedIndex, field.name, value, null, field);
        if (applied) {
            renderRecordDetail();
            updateFooter();
            updateStatus(`Applied ${field.label}: ${value}`, 'saved');
        }
        return applied;
    }

    async function saveAndNextRecord() {
        if (!hasWorkbench()) return false;
        await window.saveFile?.();
        return selectAdjacentRecord(1);
    }

    function registerWorkbenchActions() {
        if (typeof window.registerCommand !== 'function') return;
        const common = {
            owner: 'structured-records',
            category: 'Records',
            shortcutScope: 'record',
            replace: true,
            when: () => hasWorkbench() && getRecordUIState().active
        };
        window.registerCommand('records.view.toggle', 'Records: Toggle Form and Grid', () => {
            getElement('jsonl-workbench-toggle')?.click();
        }, 'Alt+G', common);
        window.registerCommand('records.previous', 'Records: Previous in View', () => selectAdjacentRecord(-1), 'Alt+ArrowUp', common);
        window.registerCommand('records.next', 'Records: Next in View', () => selectAdjacentRecord(1), 'Alt+ArrowDown', common);
        window.registerCommand('records.saveNext', 'Records: Save and Next', () => saveAndNextRecord(), 'Mod+Enter', common);
        for (let index = 0; index < 9; index += 1) {
            window.registerCommand(
                `records.label.${index + 1}`,
                `Records: Apply Label Choice ${index + 1}`,
                () => applyLabelChoice(index),
                `Alt+${index + 1}`,
                {
                    ...common,
                    when: () => hasWorkbench() && getRecordUIState().active &&
                        state.schema.workflow.labelValues[index] !== undefined
                }
            );
        }
    }

    function render(content, options = {}) {
        const source = typeof content === 'string' ? content : String(content || '');
        if (!options.force && state.parsed && state.content === source) return true;
        state.content = source;
        state.parsed = parseRecordContent(state.filePath, source);
        restoreWorkbenchState();
        updateDocumentStatus(source, state.parsed.records.length);

        const fileName = state.filePath?.split('/').pop() || `${state.format.toUpperCase()} records`;
        const title = getElement('jsonl-mode-title');
        if (title) title.textContent = fileName;

        if (state.parsed.errors.length) {
            renderErrors(state.parsed.errors);
            return true;
        }

        state.selectedIndex = Math.max(0, Math.min(state.selectedIndex, Math.max(0, state.parsed.records.length - 1)));
        updateStatus(
            state.schema
                ? `${state.parsed.records.length} records · ${state.schema.title}`
                : `${state.parsed.records.length} ${state.parsed.records.length === 1 ? 'record' : 'records'} · valid`,
            'valid'
        );
        renderRecordList();
        renderRecordDetail();
        updateFooter();
        return true;
    }

    function handlePreviewUpdate(filePath, content) {
        if (!isRecordFile(filePath)) {
            deactivate();
            return false;
        }
        if (!activate(filePath)) return false;
        return render(content);
    }

    function syncToCurrentFile() {
        const filePath = window.currentFilePath;
        if (!isRecordFile(filePath)) {
            deactivate();
            return false;
        }
        const content = window.editor?.getValue?.();
        if (typeof content !== 'string') return false;
        activate(filePath);
        render(content, { force: true });
        return true;
    }

    function init() {
        if (state.initialized || typeof window === 'undefined') return;
        state.initialized = true;
        registerWorkbenchActions();
        window.addEventListener('nightowl-current-file-changed', () => {
            queueMicrotask(syncToCurrentFile);
        });
        syncToCurrentFile();
    }

    const utils = {
        isJSONLFile,
        isCSVFile,
        isRecordFile,
        getRecordFormat,
        parseJSONL,
        parseCSV,
        serializeCSVField,
        serializeCSVRow,
        replaceCSVRecord,
        parseRecordContent,
        prettifyFieldName,
        valueType,
        fieldValueToText,
        getFileStatusLabel,
        coerceFieldValue,
        replaceRecordLine,
        recordMatches,
        recordTitle,
        recordSecondary,
        schemaSidecarPaths
    };
    const controller = {
        init,
        activate,
        deactivate,
        render,
        handlePreviewUpdate,
        syncToCurrentFile,
        cancelPendingEdits,
        checkForExport,
        getHandoffMetadata,
        applyLabelChoice,
        applyBulkPreview,
        selectAdjacentRecord,
        clearSchema: () => useGenericSchema({ remember: true }),
        resolveSchemaForFile,
        selectSchemaFromDialog,
        setSchema,
        isActive: () => getRecordUIState().active,
        getState: () => ({ ...state, ...getRecordUIState() })
    };

    if (typeof window !== 'undefined') {
        window.JSONLModeUtils = utils;
        window.StructuredRecordModeUtils = utils;
        window.jsonlMode = controller;
        window.recordMode = controller;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = utils;
    }
})();
