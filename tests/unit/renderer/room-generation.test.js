const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../../..');
function setup(gamification) {
  const world = { recordProgressEvent: jest.fn(), addRoom: jest.fn(), addCorridor: jest.fn(), addLoreFragment: jest.fn() };
  const context = {
    window: { appSettings: { gamification } }, console, setTimeout: jest.fn(),
    DataPersistence: function () { return new Proxy({}, { get: () => () => ({}) }); },
    WritingSession: function () {}, FocusTimer: function () {}, FlowState: function () {},
    LibraryWorldEngine: jest.fn(() => world), LibraryArchitectBridge: jest.fn(),
  };
  vm.createContext(context);
  const source = process.env.NIGHTOWL_ROOM_MANAGER_SOURCE || path.join(root, 'orchestrator/modules/gamification/GamificationManager.js');
  vm.runInContext(fs.readFileSync(source, 'utf8'), context);
  const Manager = context.window.GamificationManager;
  for (const method of ['getLevelDefinitions', 'saveResourceLedger', 'initializeXPSystem', 'initializeAudioContext']) Manager.prototype[method] = jest.fn();
  const manager = new Manager();
  manager.updateGamificationUI = jest.fn(); manager.awardXP = jest.fn();
  return { context, manager, world };
}

test.each([undefined, {}, { roomGeneration: false }, { roomGeneration: 'true' }, { roomGeneration: true, enabled: false }])('no implicit opt-in for %p', async settings => {
  const { context, manager, world } = setup(settings);
  expect(context.LibraryWorldEngine).not.toHaveBeenCalled();
  expect(context.LibraryArchitectBridge).not.toHaveBeenCalled();
  // Include an already-initialized engine to cover disabling during a session.
  manager.worldEngine = world;
  manager.architectBridge = { requestBlueprint: jest.fn(), applyBlueprint: jest.fn() };
  manager.handleLiveWordDelta(36428, 'A document switch must not generate rooms');
  manager.recordWorldEvent({ type: 'typing.milestone' });
  manager.spawnLibraryRoomFromSnippet('direct call');
  await manager.scheduleArchitectAutoBuild();
  expect(await manager.requestLibraryBlueprint()).toBeNull();
  expect(manager.applyLibraryBlueprint({ rooms: [{}] })).toBe(false);
  expect(world.addRoom).not.toHaveBeenCalled();
  expect(world.recordProgressEvent).not.toHaveBeenCalled();
  expect(manager.awardXP).not.toHaveBeenCalled();
  expect(manager.architectBridge.requestBlueprint).not.toHaveBeenCalled();
  expect(manager.architectBridge.applyBlueprint).not.toHaveBeenCalled();
  expect(manager.liveProgress.accumulatedWords).toBe(0);
});

test('explicit opt-in creates the engine; turning off stops work immediately', () => {
  const { context, manager, world } = setup({ roomGeneration: true });
  expect(context.LibraryWorldEngine).toHaveBeenCalledTimes(1);
  manager.recordWorldEvent = jest.fn(); manager.scheduleArchitectAutoBuild = jest.fn();
  manager.handleLiveWordDelta(30, 'A real writing milestone');
  expect(world.addRoom).toHaveBeenCalledTimes(1);
  context.window.appSettings.gamification.roomGeneration = false;
  manager.handleLiveWordDelta(36428, 'No more rooms');
  expect(world.addRoom).toHaveBeenCalledTimes(1);
});
