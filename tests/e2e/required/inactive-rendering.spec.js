const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { test, expect } = process.env.NIGHTOWL_PACKAGED_APP
    ? require('../fixtures/packaged-electron-app')
    : require('../fixtures/electron-app');

async function activate(electronApp, page) {
    await electronApp.evaluate(({ app }) => app.focus({ steal: true }));
    const win = await electronApp.browserWindow(page);
    await win.evaluate(win => { win.setFocusable(true); win.show(); win.focus(); });
}

async function deactivate(electronApp, page) {
    const main = await electronApp.browserWindow(page);
    // Prevent delayed startup focus requests from undoing native deactivation
    // during the sample; production window behavior is not changed.
    await main.evaluate(win => win.setFocusable(false));
    await electronApp.evaluate(async ({ app, BrowserWindow }) => {
        let helper = BrowserWindow.getAllWindows().find(w => w.__inactiveTestHelper);
        if (!helper) {
            helper = new BrowserWindow({ width: 260, height: 160, show: true, title: 'Inactive rendering test' });
            helper.__inactiveTestHelper = true;
            await helper.loadURL('about:blank');
        }
        app.focus({ steal: true });
        helper.show();
        helper.focus();
    });
}

test.beforeEach(async ({ electronApp, appPage }) => {
    await appPage.waitForFunction(() => window.nightowlRendererActivity && window.editor?.getModel
        && window.NightOwlWorkflows && typeof window.switchToMode === 'function');
    await activate(electronApp, appPage);
    await appPage.evaluate(() => window.switchToMode('editor'));
    await expect.poll(() => appPage.evaluate(() => window.nightowlRendererActivity.isActive())).toBe(true);
});

test.afterEach(async ({ electronApp, appPage }) => {
    await appPage.evaluate(() => {
        window.__activityGraph?.dispose();
        window.__activityConceptGraph?.destroy();
        window.__activityUnifiedGraph?.destroy();
        document.getElementById('activity-test-fixture')?.remove();
        document.getElementById('activity-test-style')?.remove();
    });
    await electronApp.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) if (w.__inactiveTestHelper) w.destroy();
    });
});

test('decorations and newly inserted pseudo-elements stop on native blur and resume', async ({ electronApp, appPage }) => {
    await appPage.evaluate(() => {
        const style = document.createElement('style');
        style.id = 'activity-test-style';
        style.textContent = `@keyframes activity-test-spin { to { transform: rotate(360deg); } }
            .activity-test-spin { animation: activity-test-spin 1s linear infinite !important; }
            .activity-test-paused { animation: activity-test-spin 1s linear infinite paused; }
            .activity-test-pseudo::before { content: 'test'; animation: activity-test-spin 1s linear infinite; }`;
        document.head.append(style);
        const fixture = document.createElement('div');
        fixture.id = 'activity-test-fixture';
        fixture.innerHTML = '<div class="activity-test-spin">spin</div><div class="activity-test-paused">paused</div>';
        document.body.append(fixture);
    });
    const playState = () => appPage.evaluate(() => getComputedStyle(document.querySelector('.activity-test-spin')).animationPlayState);
    await expect.poll(playState).toBe('running');
    await deactivate(electronApp, appPage);
    await expect.poll(playState).toBe('paused');
    const times = await appPage.evaluate(async () => {
        const fixture = document.getElementById('activity-test-fixture');
        fixture.insertAdjacentHTML('beforeend', '<div class="activity-test-pseudo"></div>');
        const anim = fixture.querySelector('.activity-test-spin').getAnimations()[0];
        const before = anim.currentTime;
        await new Promise(resolve => setTimeout(resolve, 250));
        return {
            before, after: anim.currentTime,
            pseudo: getComputedStyle(fixture.querySelector('.activity-test-pseudo'), '::before').animationPlayState
        };
    });
    expect(times.after).toBeCloseTo(times.before, 0);
    expect(times.pseudo).toBe('paused');
    await activate(electronApp, appPage);
    await expect.poll(playState).toBe('running');
    expect(await appPage.evaluate(() => getComputedStyle(document.querySelector('.activity-test-paused')).animationPlayState)).toBe('paused');
});

test('all graph simulations stop and resume across repeated native focus changes', async ({ electronApp, appPage }) => {
    await appPage.evaluate(async () => {
        if (!window.UnifiedNetworkVisualization) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'plugins/techne-network-diagram/unified-network.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.append(script);
            });
        }
        if (!document.getElementById('network-canvas')) {
            const fixture = document.createElement('div');
            fixture.id = 'activity-test-fixture';
            fixture.innerHTML = '<div id="network-canvas" style="width:400px;height:300px"></div>';
            document.body.append(fixture);
        }
        window.__activityTicks = 0;
        window.__activityGraph = window.createNetworkVisualization({
            nodes: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }],
            links: [{ source: 'a', target: 'b' }]
        });
        window.__activityGraph.simulation.alphaDecay(0).on('tick.activity-test', () => window.__activityTicks++);
        const graph = new window.GraphView();
        graph.width = 400;
        graph.height = 300;
        graph.svg = window.d3.select('#network-canvas').append('svg');
        graph.g = graph.svg.append('g');
        graph.nodes = [{ id: 'a', name: 'a', type: 'file' }, { id: 'b', name: 'b', type: 'file' }];
        graph.links = [{ source: 'a', target: 'b', type: 'reference' }];
        graph.createForceSimulation();
        window.__activityConceptGraph = graph;
        window.__activityConceptTicks = 0;
        graph.simulation.alphaDecay(0).on('tick.activity-test', () => window.__activityConceptTicks++);
        const unified = new window.UnifiedNetworkVisualization();
        unified.width = 400;
        unified.height = 300;
        unified.nodes = [{ id: 'a', type: 'file' }, { id: 'b', type: 'file' }];
        unified.links = [{ source: 'a', target: 'b' }];
        unified.createSimulation();
        window.__activityUnifiedGraph = unified;
        window.__activityUnifiedTicks = 0;
        unified.simulation.alphaDecay(0).on('tick.activity-test', () => window.__activityUnifiedTicks++);
    });
    await expect.poll(() => appPage.evaluate(() => window.__activityTicks)).toBeGreaterThan(2);
    await expect.poll(() => appPage.evaluate(() => window.__activityConceptTicks)).toBeGreaterThan(2);
    await expect.poll(() => appPage.evaluate(() => window.__activityUnifiedTicks)).toBeGreaterThan(2);
    for (let i = 0; i < 2; i++) {
        await deactivate(electronApp, appPage);
        await expect.poll(() => appPage.evaluate(() => window.nightowlRendererActivity.isActive())).toBe(false);
        const count = await appPage.evaluate(() => window.__activityTicks);
        const conceptCount = await appPage.evaluate(() => window.__activityConceptTicks);
        const unifiedCount = await appPage.evaluate(() => window.__activityUnifiedTicks);
        const later = await appPage.evaluate(async () => {
            await new Promise(resolve => setTimeout(resolve, 250));
            return window.__activityTicks;
        });
        expect(later).toBe(count);
        expect(await appPage.evaluate(() => window.__activityConceptTicks)).toBe(conceptCount);
        expect(await appPage.evaluate(() => window.__activityUnifiedTicks)).toBe(unifiedCount);
        await activate(electronApp, appPage);
        await expect.poll(() => appPage.evaluate(() => window.__activityTicks)).toBeGreaterThan(count);
        await expect.poll(() => appPage.evaluate(() => window.__activityConceptTicks)).toBeGreaterThan(conceptCount);
        await expect.poll(() => appPage.evaluate(() => window.__activityUnifiedTicks)).toBeGreaterThan(unifiedCount);
    }
});

test('file polling stops while inactive, autosave still writes, and polling resumes on return', async ({ electronApp, appPage }) => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nightowl-inactive-save-'));
    const filePath = path.join(temporary, 'background.md');
    await fs.writeFile(filePath, '# Original\n');
    try {
        await appPage.evaluate(async target => {
            window.appSettings.autoSave = { enabled: true, interval: 150 };
            await window.openFileInEditor(target, '# Original\n');
            window.switchStructureView('file');
            await window.renderFileTree();
        }, filePath);
        await expect.poll(() => appPage.evaluate(() => window.NightOwlWorkflows.fileTree.getSnapshot().pollActive)).toBe(true);
        await deactivate(electronApp, appPage);
        await expect.poll(() => appPage.evaluate(() => window.NightOwlWorkflows.fileTree.getSnapshot().pollActive)).toBe(false);
        await appPage.evaluate(() => {
            window.editor.setValue('# Saved while inactive\n');
            window.scheduleAutoSave();
        });
        await expect.poll(() => fs.readFile(filePath, 'utf8')).toBe('# Saved while inactive\n');
        await activate(electronApp, appPage);
        await expect.poll(() => appPage.evaluate(() => window.NightOwlWorkflows.fileTree.getSnapshot().pollActive)).toBe(true);
    } finally {
        await fs.rm(temporary, { recursive: true, force: true });
    }
});

test('visible presentation keeps running without focus and pauses when hidden', async ({ electronApp, appPage }) => {
    await appPage.evaluate(async () => {
        await window.openFileInEditor('/virtual-workspace/activity-slides.md', '# Activity test\n\nA visible delivery slide.');
        window.switchToMode('presentation');
    });
    await deactivate(electronApp, appPage);
    await expect.poll(() => appPage.evaluate(() => window.nightowlRendererActivity.isActive())).toBe(false);
    await activate(electronApp, appPage);
    await appPage.waitForFunction(() => Boolean(window.NightOwlPresentationTools));
    await appPage.evaluate(() => window.NightOwlPresentationTools.startPresentation());
    await expect(appPage.locator('.presentation-shell')).toHaveAttribute('data-presentation-mode', 'delivery');
    await deactivate(electronApp, appPage);
    await expect.poll(() => appPage.evaluate(() => window.nightowlRendererActivity.isActive())).toBe(true);
    const nativeWindow = await electronApp.browserWindow(appPage);
    await nativeWindow.evaluate(win => win.hide());
    await expect.poll(() => appPage.evaluate(() => window.nightowlRendererActivity.isActive())).toBe(false);
    // Delivery startup retries focus at 100, 300, and 600 ms. A delayed retry
    // must not reopen the hidden presentation or start its animations again.
    await appPage.evaluate(() => new Promise(resolve => setTimeout(resolve, 800)));
    expect(await nativeWindow.evaluate(win => win.isVisible())).toBe(false);
    expect(await appPage.evaluate(() => window.nightowlRendererActivity.isActive())).toBe(false);
    await activate(electronApp, appPage);
    await expect.poll(() => appPage.evaluate(() => window.nightowlRendererActivity.isActive())).toBe(true);
});
