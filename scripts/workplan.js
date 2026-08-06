#!/usr/bin/env node

/**
 * Dependency-free workplan CLI for NightOwl.
 *
 * Authored source: workplan/items/*.md
 * Generated views: workplan/BOARD.md and workplan/board.json
 *
 * Commands:
 *   list [--status S] [--type T] [--priority P] [--area A] [--owner O] [--evidence E] [--json]
 *   show <id>
 *   add --title "..." [--type T] [--priority P] [--area A] [--owner O]
 *   set <id> <field> <value>
 *   validate
 *   render
 *   check
 *
 * WORKPLAN_DIR may point at a different workplan directory for hermetic tests.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIFECYCLE = ['inbox', 'triaged', 'active', 'blocked', 'review', 'done', 'archived', 'dropped'];
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
const GENERATED_VIEWS = ['workplan/BOARD.md', 'workplan/board.json'];

function paths() {
  const dir = process.env.WORKPLAN_DIR
    ? path.resolve(process.env.WORKPLAN_DIR)
    : path.join(ROOT, 'workplan');
  return {
    dir,
    items: path.join(dir, 'items'),
    schema: path.join(dir, 'schema', 'item.schema.json'),
    boardMd: path.join(dir, 'BOARD.md'),
    boardJson: path.join(dir, 'board.json')
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fail(message) {
  console.error(`workplan: ${message}`);
  process.exitCode = 1;
}

function rel(filePath) {
  return path.relative(ROOT, filePath) || filePath;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 72)
    .replace(/-+$/g, '');
}

function splitInlineArray(source) {
  const values = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quote) {
      current += char;
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      current += char;
      continue;
    }
    if (char === ',' && !quote) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) values.push(current.trim());
  return values;
}

function parseScalar(rawValue) {
  const value = String(rawValue).trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner ? splitInlineArray(inner).map(parseScalar) : [];
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`invalid quoted value ${value}: ${error.message}`);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseDoc(text) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { fm: {}, body: normalized };
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return { fm: {}, body: normalized };

  const fm = {};
  const frontmatter = normalized.slice(4, end);
  for (const [index, line] of frontmatter.split('\n').entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([a-z][a-z0-9_]*):(?:\s*(.*))$/);
    if (!match) throw new Error(`unsupported frontmatter at line ${index + 2}: ${line}`);
    fm[match[1]] = parseScalar(match[2]);
  }
  return { fm, body: normalized.slice(end + 5) };
}

function formatScalar(value) {
  if (Array.isArray(value)) return `[${value.map(formatScalar).join(', ')}]`;
  if (typeof value === 'boolean' || value === null) return String(value);
  return JSON.stringify(String(value));
}

function serializeDoc(fm, body) {
  const lines = Object.entries(fm).map(([key, value]) => `${key}: ${formatScalar(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${String(body || '').trimStart()}`;
}

function listMarkdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(file => file.endsWith('.md') && file.toLowerCase() !== 'readme.md')
    .sort()
    .map(file => path.join(directory, file));
}

function loadSchema() {
  const file = paths().schema;
  if (!fs.existsSync(file)) throw new Error(`schema not found: ${rel(file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadItems() {
  return listMarkdownFiles(paths().items).map(file => {
    try {
      const { fm, body } = parseDoc(fs.readFileSync(file, 'utf8'));
      return { file, fm, body, parseError: null };
    } catch (error) {
      return { file, fm: {}, body: '', parseError: error.message };
    }
  });
}

function matchesType(value, expected) {
  if (Array.isArray(expected)) return expected.some(type => matchesType(value, type));
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === expected;
}

function validateItem(fm, file, schema) {
  const errors = [];
  const properties = schema.properties || {};
  for (const field of schema.required || []) {
    if (fm[field] === undefined || fm[field] === null || fm[field] === '') {
      errors.push(`missing required field: ${field}`);
    }
  }
  for (const [field, value] of Object.entries(fm)) {
    const spec = properties[field];
    if (!spec) {
      if (schema.additionalProperties === false) errors.push(`unknown field: ${field}`);
      continue;
    }
    if (spec.type && !matchesType(value, spec.type)) errors.push(`field ${field} has wrong type`);
    if (spec.enum && !spec.enum.includes(value)) {
      errors.push(`field ${field}="${value}" not in [${spec.enum.join(', ')}]`);
    }
    if (spec.pattern && typeof value === 'string' && !new RegExp(spec.pattern).test(value)) {
      errors.push(`field ${field}="${value}" fails pattern ${spec.pattern}`);
    }
    if (spec.minLength && typeof value === 'string' && value.length < spec.minLength) {
      errors.push(`field ${field} is too short`);
    }
    if (spec.type === 'array' && Array.isArray(value) && spec.items) {
      value.forEach((entry, index) => {
        if (spec.items.type && !matchesType(entry, spec.items.type)) {
          errors.push(`field ${field}[${index}] has wrong type`);
        }
        if (spec.items.pattern && typeof entry === 'string' && !new RegExp(spec.items.pattern).test(entry)) {
          errors.push(`field ${field}[${index}]="${entry}" fails pattern ${spec.items.pattern}`);
        }
      });
    }
  }
  const base = path.basename(file, '.md');
  if (fm.id && fm.id !== base) errors.push(`id "${fm.id}" != filename "${base}"`);
  if (fm.status === 'blocked' && !fm.blocked_by) errors.push('status is "blocked" but blocked_by is missing');
  return errors;
}

function validateItems() {
  const schema = loadSchema();
  const items = loadItems();
  const failures = [];
  const ids = new Set(items.map(item => item.fm.id).filter(Boolean));

  for (const item of items) {
    const errors = item.parseError ? [`bad frontmatter: ${item.parseError}`] : validateItem(item.fm, item.file, schema);
    for (const dependency of item.fm.depends_on || []) {
      if (dependency === item.fm.id) errors.push('an item cannot depend on itself');
      else if (!ids.has(dependency)) errors.push(`unknown dependency: ${dependency}`);
    }
    if (errors.length) failures.push({ file: item.file, errors });
  }
  return { items, failures };
}

function printValidation(result) {
  for (const { file, errors } of result.failures) {
    console.log(`x ${rel(file)}`);
    errors.forEach(error => console.log(`    - ${error}`));
  }
  console.log(`\n${result.items.length - result.failures.length}/${result.items.length} items valid`);
}

function sortedItems(items) {
  return items.slice().sort((a, b) =>
    (LIFECYCLE.indexOf(a.status) - LIFECYCLE.indexOf(b.status)) ||
    ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)) ||
    String(a.id).localeCompare(String(b.id))
  );
}

function buildBoardCore() {
  const items = sortedItems(loadItems().filter(item => !item.parseError).map(item => item.fm));
  const counts = { total: items.length, byStatus: {}, byPriority: {}, byArea: {} };
  for (const item of items) {
    counts.byStatus[item.status] = (counts.byStatus[item.status] || 0) + 1;
    counts.byPriority[item.priority] = (counts.byPriority[item.priority] || 0) + 1;
    counts.byArea[item.area] = (counts.byArea[item.area] || 0) + 1;
  }
  return { counts, items };
}

function sameBoardCore(left, right) {
  return JSON.stringify({ counts: left.counts, items: left.items }) ===
    JSON.stringify({ counts: right.counts, items: right.items });
}

function readBoardJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function boardMarkdown(board) {
  const lines = [
    '<!-- GENERATED by scripts/workplan.js render. Do not edit; source: workplan/items/*.md -->',
    '# NightOwl engineering board',
    '',
    `_${board.counts.total} items; generated ${board.generated}_`,
    '',
    LIFECYCLE.filter(status => board.counts.byStatus[status])
      .map(status => `${status} ${board.counts.byStatus[status]}`)
      .join(' | ') || '(empty)',
    ''
  ];

  for (const status of LIFECYCLE) {
    const group = board.items.filter(item => item.status === status);
    if (!group.length) continue;
    lines.push(`## ${status} (${group.length})`, '');
    for (const item of group) {
      const meta = [item.type, item.area, item.evidence, item.owner].join(' | ');
      const dependency = item.depends_on?.length ? ` | depends on ${item.depends_on.join(', ')}` : '';
      lines.push(`- **[${item.priority}] [${item.id}](items/${item.id}.md)** - ${item.title} | ${meta}${dependency}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function buildBoardDocuments(generated) {
  const core = buildBoardCore();
  const board = { generated, ...core };
  return {
    board,
    json: `${JSON.stringify(board, null, 2)}\n`,
    markdown: boardMarkdown(board)
  };
}

function renderBoard() {
  const p = paths();
  fs.mkdirSync(p.dir, { recursive: true });
  const core = buildBoardCore();
  const existing = readBoardJson(p.boardJson);
  const generated = process.env.WORKPLAN_RENDERED_AT ||
    (existing?.generated && sameBoardCore(existing, core) ? existing.generated : new Date().toISOString());
  const documents = buildBoardDocuments(generated);
  fs.writeFileSync(p.boardJson, documents.json);
  fs.writeFileSync(p.boardMd, documents.markdown);
  return documents.board.counts;
}

function flags(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function commandList(argv) {
  const options = flags(argv);
  let items = loadItems().filter(item => !item.parseError).map(item => item.fm);
  for (const field of ['status', 'type', 'priority', 'area', 'owner', 'evidence']) {
    if (options[field]) items = items.filter(item => item[field] === options[field]);
  }
  items = sortedItems(items);
  if (options.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (!items.length) {
    console.log('(no items match)');
    return;
  }
  for (const status of LIFECYCLE) {
    const group = items.filter(item => item.status === status);
    if (!group.length) continue;
    console.log(`\n${status.toUpperCase()} (${group.length})`);
    group.forEach(item => console.log(`  [${item.priority}] ${item.id} - ${item.title} (${item.area}; ${item.evidence})`));
  }
  console.log('');
}

function commandShow(argv) {
  const id = argv[0];
  if (!id) return fail('usage: show <id>');
  const file = path.join(paths().items, `${id}.md`);
  if (!fs.existsSync(file)) return fail(`no item: ${id}`);
  console.log(fs.readFileSync(file, 'utf8'));
}

function commandAdd(argv) {
  const options = flags(argv);
  if (!options.title) return fail('usage: add --title "..." [--type T] [--priority P] [--area A]');
  const p = paths();
  fs.mkdirSync(p.items, { recursive: true });
  const base = slugify(options.title);
  let id = base;
  let suffix = 2;
  while (fs.existsSync(path.join(p.items, `${id}.md`))) id = `${base}-${suffix++}`;
  const fm = {
    id,
    title: options.title,
    status: options.status || 'triaged',
    type: options.type || 'maintenance',
    priority: options.priority || 'P2',
    area: options.area || 'architecture',
    owner: options.owner || 'unassigned',
    source: options.source || 'manual',
    evidence: options.evidence || 'opportunity',
    created: today(),
    updated: today(),
    verification: options.verification || 'Replace this placeholder with a concrete completion check.'
  };
  const file = path.join(p.items, `${id}.md`);
  const schema = loadSchema();
  const errors = validateItem(fm, file, schema);
  if (errors.length) return fail(errors.join('; '));
  fs.writeFileSync(file, serializeDoc(fm, '## Context\n\nDescribe the problem and evidence.\n\n## Acceptance criteria\n\n- [ ] Add concrete checks.\n'));
  renderBoard();
  console.log(`created ${rel(file)}`);
}

function commandSet(argv) {
  const [id, field, ...parts] = argv;
  if (!id || !field || !parts.length) return fail('usage: set <id> <field> <value>');
  const file = path.join(paths().items, `${id}.md`);
  if (!fs.existsSync(file)) return fail(`no item: ${id}`);
  const { fm, body } = parseDoc(fs.readFileSync(file, 'utf8'));
  fm[field] = parseScalar(parts.join(' '));
  fm.updated = today();
  const errors = validateItem(fm, file, loadSchema());
  if (errors.length) return fail(errors.join('; '));
  fs.writeFileSync(file, serializeDoc(fm, body));
  renderBoard();
  console.log(`updated ${id}: ${field}=${formatScalar(fm[field])}`);
}

function commandValidate() {
  const result = validateItems();
  printValidation(result);
  if (result.failures.length) process.exitCode = 1;
}

function commandRender() {
  const counts = renderBoard();
  console.log(`rendered workplan views (${counts.total} items)`);
}

function commandCheck() {
  const validation = validateItems();
  printValidation(validation);
  const errors = [];
  if (validation.failures.length) errors.push('fix invalid item frontmatter');

  const p = paths();
  const actual = readBoardJson(p.boardJson);
  if (!actual) errors.push(`${rel(p.boardJson)} is missing or invalid; run npm run wp:render`);
  const expected = buildBoardDocuments(actual?.generated || 'missing');
  if (!fs.existsSync(p.boardJson) || fs.readFileSync(p.boardJson, 'utf8') !== expected.json) {
    errors.push(`${rel(p.boardJson)} is stale; run npm run wp:render`);
  }
  if (!fs.existsSync(p.boardMd) || fs.readFileSync(p.boardMd, 'utf8') !== expected.markdown) {
    errors.push(`${rel(p.boardMd)} is stale; run npm run wp:render`);
  }

  if (errors.length) {
    errors.forEach(error => console.log(`workplan check: ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(`\nworkplan check passed (${expected.board.counts.total} items)`);
}

function main(argv = process.argv.slice(2)) {
  const [command = 'list', ...rest] = argv;
  const commands = {
    list: commandList,
    show: commandShow,
    add: commandAdd,
    set: commandSet,
    validate: commandValidate,
    render: commandRender,
    check: commandCheck
  };
  if (!commands[command]) {
    fail(`unknown command "${command}"`);
    return;
  }
  try {
    commands[command](rest);
  } catch (error) {
    fail(error.message);
  }
}

if (require.main === module) main();

module.exports = {
  GENERATED_VIEWS,
  LIFECYCLE,
  buildBoardCore,
  buildBoardDocuments,
  main,
  parseDoc,
  renderBoard,
  serializeDoc,
  validateItem,
  validateItems
};
