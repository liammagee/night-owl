const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.resolve(__dirname, '../..');

test('presentation template selection changes rendered slides, preserves geometry, and survives reload', async () => {
    test.setTimeout(90000);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-templates-'));
    const profile = path.join(temporary, 'profile');
    const workspace = path.join(temporary, 'workspace');
    fs.mkdirSync(profile); fs.mkdirSync(workspace);
    const file = path.join(workspace, 'templates.md');
    const markdown = '# Template review\n\n1. First point\n2. Second point\n\n| Concept | Value |\n| --- | --- |\n| Contrast | Readable |\n\n```js\nconst example = true;\n```\n\n---\n\n# Second slide\n\nA second slide.';
    fs.writeFileSync(file, markdown);
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ workingDirectory: workspace, currentFile: file, stylePreferences: { presentationTemplate: 'academic', previewStyle: 'latex' }, theme: 'techne', ai: { enableInlineCompletions: false } }));
    const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
    const executablePath = process.env.NIGHTOWL_TEMPLATE_TEST_EXECUTABLE;
    const app = await electron.launch({ executablePath: executablePath || require('electron'), args: [...(executablePath ? [] : [process.env.NIGHTOWL_TEMPLATE_TEST_ROOT || root]), `--user-data-dir=${profile}`], env: { ...env, NODE_ENV:'test', NIGHTOWL_WORKSPACE_USER_DATA_DIR:profile, NIGHTOWL_DISABLE_SINGLE_INSTANCE:'1' } });
    try {
        const page = await app.firstWindow();
        page.on('console', message => { if (/StyleManager|style-file|style-preferences/.test(message.text())) console.log(message.text()); });
        await page.waitForFunction(() => window.editor && window.styleManager);
        await page.waitForFunction(() => document.getElementById('presentation-template'));
        await page.evaluate(async ({file, markdown}) => {
            await window.openFileInEditor(file, markdown);
            await window.NightOwlFeatures.enableFeature('nightowl-presentations');
        }, {file, markdown});
        const guidance = page.locator('.capability-first-run-guidance button').filter({hasText:'Dismiss'});
        if (await guidance.isVisible()) await guidance.click();
        await page.locator('#presentation-mode-btn').click();
        const slide = page.locator('#presentation-root .slide').first();
        await expect(slide).toBeVisible();
        const editorBackground = await page.locator('#mode-switcher').evaluate(e => getComputedStyle(e).backgroundColor);
        const snapshots = {};
        const backgrounds = {academic:'rgb(245, 242, 232)',dark:'rgb(26, 29, 36)',minimal:'rgb(255, 255, 255)',default:'rgb(255, 255, 255)','techne-red':'rgba(255, 255, 255, 0.94)','techne-orange':'rgba(255, 255, 255, 0.94)'};
        for (const name of ['academic', 'dark', 'minimal', 'default', 'techne-red', 'techne-orange']) {
            // Use the same Settings select handler users interact with.
            await page.evaluate(() => window.openSettingsDialog('themes'));
            await page.locator('#presentation-template-select').selectOption(name, {force:true});
            await expect.poll(() => page.evaluate(() => window.styleManager.getCurrentStyles().presentation)).toBe(name);
            await page.evaluate(() => window.closeSettingsDialog());
            await expect(slide).toHaveCSS('width', '864px');
            await expect(slide).toHaveCSS('height', '486px');
            // Color transitions continue after the template selection resolves.
            await expect(slide).toHaveCSS('background-color', backgrounds[name]);
            snapshots[name] = await slide.evaluate(e => {
                const c=getComputedStyle(e), inner=getComputedStyle(e.querySelector('.slide-content'));
                return {bg:c.backgroundColor, font:c.fontFamily, border:c.borderRadius, color:inner.color};
            });
            expect(await page.locator('#mode-switcher').evaluate(e => getComputedStyle(e).backgroundColor)).toBe(editorBackground);
        }
        expect(snapshots.academic.font).toMatch(/Georgia/);
        expect(snapshots.dark.bg).not.toBe(snapshots.minimal.bg);
        expect(snapshots.dark.color).not.toBe(snapshots.minimal.color);
        // A superseded request must not reset the latest dropdown selection.
        await page.evaluate(async () => {
            await window.openSettingsDialog('themes');
            const manager = window.styleManager;
            const originalApply = manager.applyPresentationTemplate;
            const originalLoad = manager.loadCSSFile;
            let releaseFirst;
            const pending = [];
            manager.loadCSSFile = function(file) {
                if (file.endsWith('/academic.css')) return new Promise(resolve => {
                    releaseFirst = () => resolve(originalLoad.call(this, file));
                });
                return originalLoad.call(this, file);
            };
            manager.applyPresentationTemplate = function(...args) {
                const promise = originalApply.apply(this, args);
                pending.push(promise);
                return promise;
            };
            try {
                const select = document.getElementById('presentation-template-select');
                select.value = 'academic';
                select.dispatchEvent(new Event('change'));
                await Promise.resolve();
                select.value = 'minimal';
                select.dispatchEvent(new Event('change'));
                await pending[1];
                releaseFirst();
                await pending[0];
            } finally {
                manager.applyPresentationTemplate = originalApply;
                manager.loadCSSFile = originalLoad;
            }
        });
        await expect(page.locator('#presentation-template-select')).toHaveValue('minimal');
        await page.evaluate(() => window.closeSettingsDialog());
        await page.evaluate(() => window.styleManager.applyPresentationTemplate('dark'));
        const cell=page.locator('#presentation-root .slide td').first();
        await expect(cell).toHaveCSS('color','rgb(255, 255, 255)');
        expect(await cell.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe('rgb(255, 255, 255)');
        await page.getByRole('button',{name:'Start presentation',exact:true}).click();
        await expect(page.locator('body')).toHaveClass(/is-presenting/);
        await expect(page.locator('#presentation-root .presentation-current-slide')).toHaveCSS('height','486px');
        await page.keyboard.press('Escape');
        await page.reload();
        await page.waitForFunction(() => window.styleManager && document.getElementById('presentation-template'));
        await expect.poll(() => page.evaluate(() => window.styleManager.getCurrentStyles().presentation)).toBe('dark');
        expect(await page.evaluate(async () => (await (window.electronAPI.settings?.loadStylePreferences() || window.electronAPI.invoke('load-style-preferences'))).preferences.presentationTemplate)).toBe('dark');
    } finally {
        await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
        await app.close().catch(()=>{});
        fs.rmSync(temporary,{recursive:true,force:true});
    }
});
