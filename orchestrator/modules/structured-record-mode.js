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
        progress: null
    };

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
    }

    function refreshSchemaRendering() {
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
                    <button id="jsonl-schema-select" class="jsonl-mode-button" type="button">Choose schema…</button>
                    <button id="jsonl-schema-check" class="jsonl-mode-button" type="button" hidden>Check for export</button>
                    <button id="jsonl-source-toggle" class="jsonl-mode-button" type="button">Show raw source</button>
                </div>
            </header>
            <div class="jsonl-mode-body">
                <aside id="jsonl-record-sidebar" class="jsonl-record-sidebar" aria-label="Records">
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
                <button id="jsonl-next-record" class="jsonl-mode-button" type="button">Next →</button>
            </footer>
        `;
        previewPane.appendChild(container);
        state.container = container;
        uiStateStore?.render?.();

        getElement('jsonl-source-toggle')?.addEventListener('click', () => {
            setSourceVisible(!getRecordUIState().sourceVisible);
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
        getElement('jsonl-prev-record')?.addEventListener('click', () => selectRecord(state.selectedIndex - 1));
        getElement('jsonl-next-record')?.addEventListener('click', () => selectRecord(state.selectedIndex + 1));
        getElement('jsonl-record-search')?.addEventListener('input', event => {
            state.query = event.target.value;
            renderRecordList();
        });

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
            schemaId: state.schema.id
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

        const matches = [];
        state.parsed.records.forEach((record, index) => {
            if (recordMatches(record.value, state.query)) matches.push({ record, index });
        });
        refreshValidation(matches.length);

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
            summary.textContent = state.query
                ? `${matches.length} of ${state.parsed.records.length} records`
                : `${state.parsed.records.length} records`;
        }
    }

    function clearFieldError(wrapper) {
        wrapper.classList.remove('invalid');
        wrapper.querySelector('.jsonl-field-error')?.remove();
    }

    function showFieldError(wrapper, message) {
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

    function replaceSourceRecord(record, nextValue) {
        const model = window.editor?.getModel?.();
        const isCSV = state.format === 'csv';
        const replacement = isCSV ? serializeCSVRow(record.row) : JSON.stringify(nextValue);
        const computedContent = isCSV
            ? replaceCSVRecord(state.content, record, record.row)
            : replaceRecordLine(state.content, record.lineNumber, nextValue);
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

        if (model && typeof window.editor?.executeEdits === 'function') {
            window.editor.executeEdits(`${state.format}-record-mode`, [{ range, text: replacement }]);
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

    function renderRecordDetail() {
        const detail = getElement('jsonl-record-detail');
        const record = state.parsed?.records?.[state.selectedIndex];
        if (!detail) return;
        detail.replaceChildren();

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
        const position = getElement('jsonl-position');
        const previous = getElement('jsonl-prev-record');
        const next = getElement('jsonl-next-record');
        if (position) position.textContent = count ? `${state.selectedIndex + 1} of ${count}` : 'No records';
        if (previous) previous.disabled = !count || state.selectedIndex <= 0;
        if (next) next.disabled = !count || state.selectedIndex >= count - 1;
    }

    function selectRecord(index) {
        const count = state.parsed?.records?.length || 0;
        if (!count) return;
        state.selectedIndex = Math.max(0, Math.min(count - 1, Number(index) || 0));
        if (state.filePath) state.selectedByFile.set(state.filePath, state.selectedIndex);
        renderRecordList();
        renderRecordDetail();
        updateFooter();
        getElement('jsonl-record-detail')?.scrollTo?.({ top: 0, behavior: 'smooth' });
    }

    function render(content, options = {}) {
        const source = typeof content === 'string' ? content : String(content || '');
        if (!options.force && state.parsed && state.content === source) return true;
        state.content = source;
        state.parsed = parseRecordContent(state.filePath, source);
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
