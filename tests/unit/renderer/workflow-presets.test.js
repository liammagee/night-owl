const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/workflow-presets.js');

describe('focused workflow presets', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('projects through canonical panes and restores the exact custom layout', async () => {
    const { createPresetController } = require(modulePath);
    let state = {
      mode: 'network',
      activeRightPane: 'chat',
      panes: { sidebar: false, editor: true, right: false }
    };
    const store = { getState: () => state };
    const panes = {
      hydrate: jest.fn(nextPanes => { state = { ...state, panes: { ...nextPanes } }; }),
      show: jest.fn(pane => { state = { ...state, activeRightPane: pane, panes: { ...state.panes, right: true } }; })
    };
    const switchMode = jest.fn(async mode => { state = { ...state, mode }; });
    const changes = [];
    const controller = createPresetController({ store, panes, switchMode, onChange: change => changes.push(change) });

    await controller.apply('writing');
    expect(switchMode).toHaveBeenCalledWith('editor');
    expect(state).toEqual({
      mode: 'editor', activeRightPane: 'preview', panes: { sidebar: false, editor: true, right: true }
    });
    expect(controller.getState()).toMatchObject({ activeId: 'writing', canRestore: true });

    await controller.apply('research');
    expect(controller.getState().customSnapshot).toEqual({
      mode: 'network', activeRightPane: 'chat', panes: { sidebar: false, editor: true, right: false }
    });

    await controller.restore();
    expect(state).toEqual({
      mode: 'network', activeRightPane: 'chat', panes: { sidebar: false, editor: true, right: false }
    });
    expect(controller.getState()).toMatchObject({ activeId: null, canRestore: false });
    expect(changes.map(change => change.activeId)).toEqual(['writing', 'research', null]);
  });

  test('defines focused actions for writing, research, presentation, and labelling', () => {
    const { PRESETS } = require(modulePath);
    expect(Object.keys(PRESETS)).toEqual(['writing', 'research', 'presentation', 'labelling']);
    expect(PRESETS.writing.actions).toContain('ai.rewriteSelection');
    expect(PRESETS.research.actions).toContain('view.citations');
    expect(PRESETS.presentation.actions).toContain('presentation.preflight');
    expect(PRESETS.labelling.actions).toContain('records.saveNext');
  });
});
