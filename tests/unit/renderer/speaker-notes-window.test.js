const path = require('path');

const modulePath = path.resolve(__dirname, '../../../js/speaker-notes-window.js');

describe('speaker notes window HTML renderer', () => {
  let speakerNotesWindow;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = Object.getPrototypeOf(document).getElementById.bind(document);
    document.body.innerHTML = '<div id="notes-content"></div><span id="slide-number">1</span>';
    delete window.speakerNotesAPI;
    delete window.NightOwlSpeakerNotesWindow;
    speakerNotesWindow = require(modulePath);
  });

  test('preserves semantic note HTML while stripping active content and unsafe links', () => {
    const sanitized = speakerNotesWindow.sanitizeNotesHTML([
      '<h2 onclick="bad()">Teaching cue</h2>',
      '<p><strong>Stress this point</strong> and <em>pause</em>.</p>',
      '<ul><li>Invite a question</li></ul>',
      '<a href="javascript:bad()">Unsafe link</a>',
      '<a href="https://example.com/path">Safe link</a>',
      '<script>bad()</script>'
    ].join(''));
    const template = document.createElement('template');
    template.innerHTML = sanitized;

    expect(template.content.querySelector('h2').textContent).toBe('Teaching cue');
    expect(template.content.querySelector('strong').textContent).toBe('Stress this point');
    expect(template.content.querySelector('li').textContent).toBe('Invite a question');
    expect(template.content.querySelector('[onclick], script')).toBeNull();
    expect(template.content.querySelectorAll('a')[0].hasAttribute('href')).toBe(false);
    expect(template.content.querySelectorAll('a')[1].getAttribute('href')).toBe('https://example.com/path');
    expect(template.content.querySelectorAll('a')[1].getAttribute('rel')).toBe('noopener noreferrer');
  });

  test('renders sanitized HTML nodes rather than literal tag text', () => {
    const content = document.getElementById('notes-content');
    const rendered = speakerNotesWindow.renderNotes(
      content,
      '<p>Introduce <strong>reciprocal learning</strong>.</p><ol><li>Pause</li></ol>'
    );

    expect(rendered).toContain('<strong>reciprocal learning</strong>');
    expect(content.dataset.renderFormat).toBe('html');
    expect(content.querySelector('strong').textContent).toBe('reciprocal learning');
    expect(content.querySelector('li').textContent).toBe('Pause');
    expect(content.textContent).not.toContain('<strong>');
  });

  test('renders a semantic empty state when notes are absent', () => {
    const content = document.getElementById('notes-content');
    speakerNotesWindow.renderNotes(content, '');

    expect(content.dataset.renderFormat).toBe('empty');
    expect(content.querySelector('em').textContent).toBe('No speaker notes for this slide.');
  });
});
