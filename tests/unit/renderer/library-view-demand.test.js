const fs = require('fs');
const path = require('path');

test('hidden library updates defer graph loading and visibility renders the latest state once', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../orchestrator/modules/gamification/world/LibraryExplorerView.js'), 'utf8');
  new Function(source)();
  let resized, visible = false;
  const previousObserver = global.ResizeObserver;
  global.ResizeObserver = class { constructor(callback) { resized = callback; } observe() {} };
  try {
    const view = new window.LibraryExplorerView({});
    const container = {
      getClientRects: () => visible ? [{}] : [],
      get clientWidth() { return visible ? 800 : 0; },
      get clientHeight() { return visible ? 600 : 0; },
      classList: { remove: jest.fn() }
    };
    view.container = container;
    view.ensureContainer = () => container;
    for (const name of ['renderMaze', 'renderAnchors', 'renderRooms', 'renderLore', 'renderLinkSuggestions', 'setStatus', 'renderPulse', 'attachKeyboardAndMouse', 'clearNodeDetails']) view[name] = jest.fn();
    view.render({ revision: 1 });
    view.render({ revision: 2 });
    expect(view.renderMaze).not.toHaveBeenCalled();
    visible = true; resized();
    expect(view.renderMaze).toHaveBeenCalledTimes(1);
    expect(view.renderMaze).toHaveBeenCalledWith({ revision: 2 });
    resized(); expect(view.renderMaze).toHaveBeenCalledTimes(1);
    visible = false; resized(); view.render({ revision: 3 });
    expect(view.renderMaze).toHaveBeenCalledTimes(1);
    visible = true; resized();
    expect(view.renderMaze).toHaveBeenLastCalledWith({ revision: 3 });
  } finally { global.ResizeObserver = previousObserver; delete window.LibraryExplorerView; }
});
