/**
 * Declarative schema helpers for JSONL/CSV record workflows.
 */
(function (root, factory) {
    const api = factory();
    if (root) root.NightOwlRecordSchema = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createModule() {
    'use strict';

    const FIELD_TYPES = new Set(['string', 'multiline', 'number', 'integer', 'boolean', 'array', 'object', 'json']);

    function normalizePatternList(value) {
        if (value == null) return [];
        return (Array.isArray(value) ? value : [value])
            .map(item => String(item || '').trim())
            .filter(Boolean);
    }

    function normalizeField(name, input = {}, index = 0) {
        const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        const type = source.enum ? (source.type || 'string') : (source.type || 'string');
        if (!FIELD_TYPES.has(type)) throw new Error(`Unsupported type for field ${name}: ${type}`);
        if (source.pattern != null) {
            try {
                new RegExp(source.pattern);
            } catch (error) {
                throw new Error(`Invalid pattern for field ${name}: ${error.message}`);
            }
        }
        return {
            name,
            label: String(source.label || '').trim() || String(name).replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
            help: String(source.help || '').trim(),
            type,
            enum: Array.isArray(source.enum) ? [...source.enum] : null,
            required: source.required === true,
            readOnly: source.readOnly === true,
            order: Number.isFinite(Number(source.order)) ? Number(source.order) : index,
            min: source.min == null ? null : Number(source.min),
            max: source.max == null ? null : Number(source.max),
            minLength: source.minLength == null ? null : Number(source.minLength),
            maxLength: source.maxLength == null ? null : Number(source.maxLength),
            pattern: source.pattern == null ? null : String(source.pattern)
        };
    }

    function normalizeFields(fields) {
        if (Array.isArray(fields)) {
            return fields.map((field, index) => {
                if (!field?.name) throw new Error(`Schema field ${index + 1} requires a name`);
                return normalizeField(String(field.name), field, index);
            });
        }
        if (fields && typeof fields === 'object') {
            return Object.entries(fields).map(([name, field], index) => normalizeField(name, field, index));
        }
        return [];
    }

    function normalizeSchema(input, context = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new Error('Record schema must be a JSON object');
        }
        const fields = normalizeFields(input.fields);
        const requiredFromCompletion = Array.isArray(input.completion?.requiredFields)
            ? input.completion.requiredFields.map(String)
            : [];
        const required = new Set([
            ...fields.filter(field => field.required).map(field => field.name),
            ...requiredFromCompletion
        ]);
        for (const fieldName of required) {
            const field = fields.find(candidate => candidate.name === fieldName);
            if (field) field.required = true;
            else fields.push(normalizeField(fieldName, { required: true }, fields.length));
        }
        fields.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
        return {
            id: String(input.id || context.path || 'record-schema'),
            title: String(input.title || input.name || 'Task schema'),
            description: String(input.description || ''),
            match: normalizePatternList(input.match || input.matches),
            formats: normalizePatternList(input.formats).map(format => format.toLowerCase()),
            additionalFields: input.additionalFields !== false,
            fields,
            fieldsByName: Object.fromEntries(fields.map(field => [field.name, field])),
            completion: {
                requiredFields: [...required],
                blockExport: input.completion?.blockExport === true
            },
            path: context.path || null,
            source: context.source || 'manual'
        };
    }

    function globToRegExp(pattern) {
        const normalized = String(pattern || '').replace(/\\/g, '/');
        let expression = '^';
        for (let index = 0; index < normalized.length; index += 1) {
            const character = normalized[index];
            if (character === '*' && normalized[index + 1] === '*') {
                expression += '.*';
                index += 1;
            } else if (character === '*') expression += '[^/]*';
            else if (character === '?') expression += '[^/]';
            else expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
        }
        return new RegExp(`${expression}$`, 'i');
    }

    function schemaMatchesFile(schema, filePath) {
        if (!schema?.match?.length) return false;
        const normalizedPath = String(filePath || '').replace(/\\/g, '/');
        const fileName = normalizedPath.split('/').pop() || normalizedPath;
        return schema.match.some(pattern => {
            const expression = globToRegExp(pattern);
            return expression.test(normalizedPath) || expression.test(fileName);
        });
    }

    function selectSchemaFromDocument(documentValue, filePath, context = {}) {
        if (!documentValue || typeof documentValue !== 'object') throw new Error('Schema file must contain a JSON object');
        if (!Array.isArray(documentValue.schemas)) {
            return normalizeSchema(documentValue, context);
        }
        for (const candidate of documentValue.schemas) {
            const schema = normalizeSchema(candidate, context);
            if (schemaMatchesFile(schema, filePath)) return schema;
        }
        return null;
    }

    function isMissing(value) {
        return value == null || (typeof value === 'string' && value.trim() === '') ||
            (Array.isArray(value) && value.length === 0);
    }

    function validateField(value, field) {
        const issues = [];
        if (field.required && isMissing(value)) {
            issues.push({ kind: 'required', message: `${field.label} is required.` });
            return issues;
        }
        if (isMissing(value)) return issues;

        const actualType = Array.isArray(value) ? 'array' : typeof value;
        const numericValue = typeof value === 'number' ? value : Number(value);
        if (field.type === 'number' && !Number.isFinite(numericValue)) {
            issues.push({ kind: 'invalid', message: `${field.label} must be a number.` });
        } else if (field.type === 'integer' && (!Number.isFinite(numericValue) || !Number.isInteger(numericValue))) {
            issues.push({ kind: 'invalid', message: `${field.label} must be an integer.` });
        } else if (field.type === 'boolean' && ![true, false, 'true', 'false'].includes(value)) {
            issues.push({ kind: 'invalid', message: `${field.label} must be true or false.` });
        } else if (field.type === 'array' && actualType !== 'array') {
            issues.push({ kind: 'invalid', message: `${field.label} must be an array.` });
        } else if (field.type === 'object' && (actualType !== 'object' || value === null || Array.isArray(value))) {
            issues.push({ kind: 'invalid', message: `${field.label} must be an object.` });
        }

        if (field.enum && !field.enum.some(option => String(option) === String(value))) {
            issues.push({ kind: 'invalid', message: `${field.label} must use one of the allowed choices.` });
        }
        if (Number.isFinite(numericValue)) {
            if (field.min != null && numericValue < field.min) issues.push({ kind: 'invalid', message: `${field.label} must be at least ${field.min}.` });
            if (field.max != null && numericValue > field.max) issues.push({ kind: 'invalid', message: `${field.label} must be at most ${field.max}.` });
        }
        const text = typeof value === 'string' ? value : '';
        if (field.minLength != null && text.length < field.minLength) issues.push({ kind: 'invalid', message: `${field.label} is too short.` });
        if (field.maxLength != null && text.length > field.maxLength) issues.push({ kind: 'invalid', message: `${field.label} is too long.` });
        if (field.pattern && !new RegExp(field.pattern).test(text)) issues.push({ kind: 'invalid', message: `${field.label} has an invalid format.` });
        return issues;
    }

    function validateRecord(record, schema) {
        if (!schema) return { status: 'generic', fields: {}, issues: [], missing: [] };
        const fields = {};
        const issues = [];
        for (const field of schema.fields) {
            const fieldIssues = validateField(record?.[field.name], field);
            if (fieldIssues.length) fields[field.name] = fieldIssues;
            fieldIssues.forEach(issue => issues.push({ ...issue, field: field.name }));
        }
        const missing = issues.filter(issue => issue.kind === 'required');
        const invalid = issues.filter(issue => issue.kind === 'invalid');
        return {
            status: invalid.length ? 'invalid' : missing.length ? 'incomplete' : 'complete',
            fields,
            issues,
            missing
        };
    }

    function summarizeRecords(records, schema, matches = records?.length || 0) {
        const progress = { total: records?.length || 0, complete: 0, incomplete: 0, invalid: 0, filtered: matches };
        const validation = (records || []).map(record => validateRecord(record.value ?? record, schema));
        validation.forEach(result => {
            if (result.status in progress) progress[result.status] += 1;
        });
        return { progress, validation };
    }

    function orderedFields(record, schema) {
        if (!schema) return Object.entries(record || {}).map(([name, value]) => ({
            name,
            value,
            field: null
        }));
        const names = new Set();
        const result = schema.fields.map(field => {
            names.add(field.name);
            return { name: field.name, value: record?.[field.name], field };
        });
        if (schema.additionalFields) {
            for (const [name, value] of Object.entries(record || {})) {
                if (!names.has(name)) result.push({ name, value, field: null });
            }
        }
        return result;
    }

    function coerceValue(rawValue, field, format, originalValue) {
        if (!field) return { value: rawValue, preserveText: false };
        const raw = String(rawValue ?? '');
        let value = raw;
        if (field.enum) {
            const match = field.enum.find(option => String(option) === raw);
            value = match === undefined ? raw : match;
        } else if (field.type === 'number') value = raw.trim() ? Number(raw) : raw;
        else if (field.type === 'integer') value = raw.trim() ? Number(raw) : raw;
        else if (field.type === 'boolean') value = raw === 'true' ? true : raw === 'false' ? false : raw;
        else if (['array', 'object', 'json'].includes(field.type)) {
            value = raw.trim() ? JSON.parse(raw) : raw;
        }
        const issues = validateField(value, field);
        if (issues.length) throw new Error(issues[0].message);
        if (format === 'csv') return { value: String(rawValue ?? ''), preserveText: true };
        return { value, preserveText: false, originalValue };
    }

    return Object.freeze({
        FIELD_TYPES,
        coerceValue,
        globToRegExp,
        isMissing,
        normalizeSchema,
        orderedFields,
        schemaMatchesFile,
        selectSchemaFromDocument,
        summarizeRecords,
        validateField,
        validateRecord
    });
});
