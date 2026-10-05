const path = require('path');
const managerPath = path.resolve(__dirname, '../../../styles/style-manager.js');

describe('presentation template lifecycle', () => {
    let manager;
    let invoke;
    beforeEach(async () => {
        jest.resetModules();
        document.getElementById = Document.prototype.getElementById;
        document.head.innerHTML = '';
        invoke = jest.fn(async (channel, value) => {
            if (channel === 'load-user-styles') return { success: true, styles: { custom: { type: 'presentation', css: '.slide { color: purple; }' } } };
            if (channel === 'load-style-preferences') return { success: true, preferences: { presentationTemplate: 'dark', previewStyle: 'latex' } };
            if (channel === 'load-style-file') return { success: true, content: `/* ${value} */ .slide { color: red; }` };
            return { success: true };
        });
        window.electronAPI = { invoke };
        require(managerPath);
        manager = window.styleManager;
        await manager.userStylesReady;
    });
    afterEach(() => { delete window.styleManager; });

    test('restores wrapped preferences and custom templates before applying saved styles', async () => {
        await manager.initialize();
        expect(manager.getCurrentStyles().presentation).toBe('dark');
        expect(manager.getPresentationTemplates().map(t => t.id)).toContain('custom');
        expect(manager.customStyles.has('success')).toBe(false);
        expect(document.getElementById('presentation-template').textContent).toContain('dark.css');
        expect(invoke).toHaveBeenCalledWith('load-style-file', './css/latex-style.css');
    });

    test('failed CSS loads retain the visible template and saved selection', async () => {
        expect(await manager.applyPresentationTemplate('academic')).toBe(true);
        const css = document.getElementById('presentation-template').textContent;
        invoke.mockImplementation(async () => ({ success: false, error: 'Missing asset' }));
        expect(await manager.applyPresentationTemplate('dark')).toBe(false);
        expect(manager.getCurrentStyles().presentation).toBe('academic');
        expect(document.getElementById('presentation-template').textContent).toBe(css);
    });

    test('uses fixed settings capabilities when the generic invoke bridge is absent', async () => {
        window.electronAPI = { settings: {
            loadStylePreferences: () => invoke('load-style-preferences'),
            loadStyleFile: file => invoke('load-style-file', file),
            saveStylePreferences: prefs => invoke('save-style-preferences', prefs)
        } };
        await manager.initialize();
        expect(await manager.applyPresentationTemplate('minimal')).toBe(true);
        expect(manager.getCurrentStyles().presentation).toBe('minimal');
    });

    test('a preference save failure does not claim or display a new template', async () => {
        await manager.applyPresentationTemplate('academic');
        const previous = document.getElementById('presentation-template').textContent;
        invoke.mockImplementation(async channel => channel === 'save-style-preferences'
            ? { success: false, error: 'Disk unavailable' }
            : { success: true, content: '.slide { color: white; }' });
        expect(await manager.applyPresentationTemplate('dark')).toBe(false);
        expect(manager.getCurrentStyles().presentation).toBe('academic');
        expect(document.getElementById('presentation-template').textContent).toBe(previous);
    });

    test('rapid selection applies only the last requested template', async () => {
        let completeFirst;
        invoke.mockImplementation((channel, value) => {
            if (channel === 'load-style-file' && value.includes('academic.css')) return new Promise(resolve => { completeFirst = resolve; });
            if (channel === 'load-style-file') return Promise.resolve({ success: true, content: '.slide { color: white; }' });
            return Promise.resolve({ success: true });
        });
        const first = manager.applyPresentationTemplate('academic');
        await Promise.resolve();
        expect(await manager.applyPresentationTemplate('dark')).toBe(true);
        completeFirst({ success: true, content: '.slide { color: black; }' });
        expect(await first).toBe(false);
        expect(manager.getCurrentStyles().presentation).toBe('dark');
        expect(document.querySelectorAll('#presentation-template')).toHaveLength(1);
        expect(document.getElementById('presentation-template').textContent).toContain('white');
    });

    test('template cards ignore a superseded selection without displaying an error', async () => {
        require('../../../styles/style-settings-ui.js');
        const ui = window.styleSettingsUI;
        let finishFirst;
        window.showNotification = jest.fn();
        manager.applyPresentationTemplate = jest.fn()
            .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
            .mockResolvedValueOnce(true);
        const first = ui.selectTemplate('academic');
        await ui.selectTemplate('dark');
        finishFirst(false);
        await first;
        expect(window.showNotification).not.toHaveBeenCalled();
        delete window.styleSettingsUI;
    });

    test('applying a template triggers content fitting without changing app theme', async () => {
        document.body.className = 'techne-theme';
        const resized = jest.fn(); window.addEventListener('resize', resized);
        await manager.applyPresentationTemplate('minimal');
        expect(resized).toHaveBeenCalledTimes(1);
        expect(document.body.className).toBe('techne-theme');
        window.removeEventListener('resize', resized);
    });
});
