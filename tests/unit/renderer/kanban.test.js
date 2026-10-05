const path = require('path');
const { createElectronApiMock } = require('../../helpers/electron-api-mock');

const kanbanPath = path.resolve(__dirname, '../../../orchestrator/modules/kanban.js');
const previewMarkdownPath = path.resolve(__dirname, '../../../orchestrator/modules/preview-markdown.js');
const markedPath = path.resolve(__dirname, '../../../lib/marked.min.js');

describe('kanban markdown rendering', () => {
  let kanban;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.NightOwlPreviewMarkdown;
    delete window.marked;

    window.marked = require(markedPath);
    require(previewMarkdownPath);
    kanban = require(kanbanPath);
  });

  test('ignores emphasis and thematic breaks that are not Markdown list tasks', () => {
    const parsed = kanban.parseKanbanFromMarkdown(`# todo

*Drafted 2026-05-14, after extracting content.
This is still prose, not a bullet task.

---

**Brand repo (\`machinespirits-brand\`, this repo).**

- Real task with **bold**
  continuation to \`index.md\`
`, {});

    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0]).toMatchObject({
      number: '',
      lineNumber: 9,
      endLineNumber: 10,
      text: 'Real task with **bold**\ncontinuation to `index.md`',
      status: 'todo'
    });
  });

  test('keeps lazy and indented continuation lines in one task card', () => {
    const parsed = kanban.parseKanbanFromMarkdown(`1. Build renderer with **bold**
lazy continuation with \`code\`
  - nested note
2. Ship it - DONE
`, {});

    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0]).toMatchObject({
      number: '1.',
      lineNumber: 0,
      endLineNumber: 2,
      text: 'Build renderer with **bold**\nlazy continuation with `code`\n- nested note'
    });
    expect(parsed.tasks[1]).toMatchObject({
      number: '2.',
      status: 'done',
      text: 'Ship it'
    });
  });

  test('groups tasks under their nearest Markdown heading', () => {
    const parsed = kanban.parseKanbanFromMarkdown(`# Roadmap
- First task

## Migration
- Second task
`, { kanban: { groupSize: 5 } });

    expect(parsed.tasks[0]).toMatchObject({
      text: 'First task',
      groupName: 'Roadmap'
    });
    expect(parsed.tasks[1]).toMatchObject({
      text: 'Second task',
      groupName: 'Migration'
    });
    expect(parsed.groupsByColumn.todo.map(group => group.name)).toEqual(['Roadmap', 'Migration']);

    const container = document.createElement('div');
    container.innerHTML = kanban.renderKanbanBoard(parsed, '/workspace/todo.md');

    const groups = Array.from(container.querySelectorAll('.kanban-task-group'));
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector('.kanban-task-group-title')?.textContent).toBe('Roadmap');
    expect(groups[0].hasAttribute('open')).toBe(true);
  });

  test('splits oversized heading groups into count ranges', () => {
    const tasks = Array.from({ length: 13 }, (_item, index) => `- Task ${index + 1}`).join('\n');
    const parsed = kanban.parseKanbanFromMarkdown(`# Massive
${tasks}
`, { kanban: { groupSize: 5 } });

    expect(parsed.groupsByColumn.todo.map(group => group.name)).toEqual([
      'Massive (1-5)',
      'Massive (6-10)',
      'Massive (11-13)'
    ]);
  });

  test('treats GitHub task checkboxes as status markers and removes them from card text', () => {
    const parsed = kanban.parseKanbanFromMarkdown(`## Hygiene
- [x] Completed task
- [ ] Open task
- [~] Active task
`, {});

    expect(parsed.tasks.map(task => ({ text: task.text, status: task.status, groupName: task.groupName }))).toEqual([
      { text: 'Completed task', status: 'done', groupName: 'Hygiene' },
      { text: 'Open task', status: 'todo', groupName: 'Hygiene' },
      { text: 'Active task', status: 'inprogress', groupName: 'Hygiene' }
    ]);
  });

  test('renders task bodies as sanitized Markdown HTML', () => {
    const parsed = kanban.parseKanbanFromMarkdown(`- Render **bold** and \`code\`
  <script>alert(1)</script>
  [bad](javascript:alert(1))
`, {});

    const container = document.createElement('div');
    container.innerHTML = kanban.renderKanbanBoard(parsed, '/workspace/todo.md');
    const text = container.querySelector('.kanban-task-text');

    expect(text.dataset.markdown).toContain('**bold**');
    expect(text.querySelector('strong')?.textContent).toBe('bold');
    expect(text.querySelector('code')?.textContent).toBe('code');
    expect(text.innerHTML).not.toContain('<script');
    expect(text.innerHTML).not.toContain('javascript:');
  });

  test('updates a multiline task block without flattening continuation lines', async () => {
    const writes = [];
    window.electronAPI = createElectronApiMock(async (channel, ...args) => {
      if (channel === 'read-file') {
        return {
          success: true,
          content: '- Old task - DONE\n  old detail\n  second detail\n- Next task'
        };
      }
      if (channel === 'get-settings') {
        return { kanban: { doneMarkers: ['DONE'], inProgressMarkers: ['DOING'] } };
      }
      if (channel === 'write-file') {
        writes.push(args);
        return { success: true };
      }
      return {};
    }).api;

    const taskElement = document.createElement('div');
    taskElement.dataset.lineNumber = '0';
    taskElement.dataset.endLineNumber = '2';
    taskElement.dataset.originalStatus = 'done';

    await kanban.updateTaskTextInFile('/workspace/todo.md', taskElement, 'New **task**\nextra line');

    expect(writes).toEqual([
      ['/workspace/todo.md', '- New **task** - DONE\n  extra line\n- Next task']
    ]);
    expect(taskElement.dataset.endLineNumber).toBe('1');
  });
});
