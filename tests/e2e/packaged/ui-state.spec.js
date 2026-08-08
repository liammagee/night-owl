'use strict';

const { test, expect } = require('../fixtures/packaged-electron-app');

test('@packaged @ui-state packaged modes share the same live pane state', async ({ appPage }) => {
  await appPage.waitForFunction(() => (
    Boolean(window.editor?.getValue) &&
    typeof window.switchToMode === 'function' &&
    Boolean(window.NightOwlUIState)
  ), undefined, { timeout: 30 * 1000 });

  const presentationStyles = await appPage.evaluate(() => (
    Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(link => ({ id: link.id, href: link.getAttribute('href') || '' }))
      .filter(link => link.href.includes('preview-presentation.css'))
  ));
  expect(presentationStyles).toEqual([{
    id: 'nightowl-presentations-preview-css',
    href: 'plugins/techne-presentations/preview-presentation.css'
  }]);

  const snapshots = await appPage.evaluate(() => {
    const store = window.NightOwlUIState;
    window.switchToMode('editor');
    store.dispatch({
      type: 'HYDRATE_PANES',
      panes: { sidebar: false, editor: true, right: true }
    });
    store.dispatch({ type: 'SHOW_RIGHT_PANE', pane: 'chat' });

    return ['network', 'circle', 'editor'].map(mode => {
      window.switchToMode(mode);
      return {
        requested: mode,
        currentMode: window.currentMode,
        state: store.getState(),
        activeViews: Array.from(document.querySelectorAll('.content-view.active'), element => element.id)
      };
    });
  });

  for (const snapshot of snapshots) {
    expect(snapshot.currentMode).toBe(snapshot.requested);
    expect(snapshot.state.mode).toBe(snapshot.requested);
    expect(snapshot.state.panes).toEqual({ sidebar: false, editor: true, right: true });
    expect(snapshot.state.activeRightPane).toBe('chat');
    expect(snapshot.activeViews).toEqual([`${snapshot.requested}-content`]);
  }

  const resources = await appPage.evaluate(() => window.NightOwlPerformance.getResourceDiagnostics());
  expect(resources).toMatchObject({
    success: true,
    handlers: {
      feed: { active: expect.any(Number) },
      file: { watcher: expect.any(Number) },
      terminal: { activeProcesses: expect.any(Number) }
    },
    renderer: {
      activeRegistries: expect.any(Number),
      activeResources: expect.any(Number)
    }
  });
});
