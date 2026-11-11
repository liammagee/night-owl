const fs = require('fs');
const path = require('path');
const { createRendererActivity } = require('../../../orchestrator/modules/renderer-activity');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('owned visual work', () => {
  let activity, focused, motion, changeMotion;
  beforeEach(() => {
    jest.useFakeTimers();
    document.getElementById = nativeGetElementById;
    document.body.innerHTML = '<div id="techne-background"><div id="shapesLayer"><div class="shape"></div></div><div id="fauna-overlay"><canvas id="fauna-canvas"></canvas></div></div>';
    document.body.className = '';
    focused = true;
    jest.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    motion = { matches: false, addEventListener: jest.fn((_, fn) => { changeMotion = fn; }), removeEventListener: jest.fn() };
    window.matchMedia = jest.fn(() => motion);
    activity = createRendererActivity(window, document, { idleAfterMs: 1000 });
    window.nightowlRendererActivity = activity;
  });
  afterEach(() => {
    window.TechneBackdrop?.destroy();
    delete window.FaunaOverlay;
    activity?.dispose();
    delete window.matchMedia;
    delete window.nightowlRendererActivity;
    jest.useRealTimers(); jest.restoreAllMocks();
  });
  const input = () => window.dispatchEvent(new Event('pointermove'));
  const job = options => ({ name: 'decoration', start: jest.fn(), stop: jest.fn(), ...options });

  test('one deadline follows input and goes completely quiet at idle', () => {
    const work = job(); activity.trackVisualWork(work);
    expect(work.start).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(600); input();
    jest.advanceTimersByTime(600); expect(work.stop).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400); expect(work.stop).toHaveBeenCalledTimes(1);
    expect(activity.getDiagnostics().jobs[0].reason).toBe('idle');
    expect(jest.getTimerCount()).toBe(0);
    input(); expect(work.start).toHaveBeenCalledTimes(2);
    input(); expect(work.start).toHaveBeenCalledTimes(2);
  });
  test('hidden view and reduced motion prevent startup and can resume on change', () => {
    let visible = false;
    const work = job({ isEligible: () => visible }); activity.trackVisualWork(work);
    expect(work.start).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    visible = true; activity.refresh(); expect(work.start).toHaveBeenCalledTimes(1);
    motion.matches = true; changeMotion(); expect(work.stop).toHaveBeenCalledTimes(1);
    motion.matches = false; changeMotion(); expect(work.start).toHaveBeenCalledTimes(2);
    visible = false; activity.refresh(); expect(work.stop).toHaveBeenCalledTimes(2);
  });
  test('functional visual work does not stop just because interaction is idle', () => {
    const work = job({ decorative: false }); activity.trackVisualWork(work);
    jest.advanceTimersByTime(3000); expect(work.stop).not.toHaveBeenCalled();
    focused = false; window.dispatchEvent(new Event('blur'));
    expect(work.stop).toHaveBeenCalledTimes(1);
  });
  test('release and disposal cancel owners exactly once and never resume them', () => {
    const a = job(), b = job(); const release = activity.trackVisualWork(a); activity.trackVisualWork(b);
    release(); release(); activity.dispose(); input();
    expect(a.stop).toHaveBeenCalledTimes(1); expect(b.stop).toHaveBeenCalledTimes(1);
    expect(a.start).toHaveBeenCalledTimes(1); expect(b.start).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
  test('one failed decoration cannot keep another running at idle', () => {
    const bad = job({ start: () => { throw new Error('broken'); } }), good = job();
    activity.trackVisualWork(bad); activity.trackVisualWork(good);
    jest.advanceTimersByTime(1000); expect(good.stop).toHaveBeenCalledTimes(1);
    expect(activity.getDiagnostics().jobs[0]).toMatchObject({ running: false, reason: 'error' });
  });
  test('real backdrop owner cancels both RAF and fauna and releases ownership', () => {
    let next = 0; const frames = new Map();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { frames.set(++next, fn); return next; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id));
    const start = jest.fn(), stop = jest.fn();
    window.FaunaOverlay = jest.fn(() => ({ start, stop }));
    const source = fs.readFileSync(path.resolve(__dirname, '../../../plugins/techne-backdrop/techne-backdrop.js'), 'utf8');
    new Function(source)();
    expect(frames.size).toBe(1); expect(start).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    expect(frames.size).toBe(0); expect(stop).toHaveBeenCalledWith({ preserveFrame: true });
    expect(window.TechneBackdrop.getDiagnostics()).toMatchObject({ running: false, pendingFrame: false, faunaRunning: false });
    input(); expect(frames.size).toBe(1);
    window.TechneBackdrop.destroy();
    expect(frames.size).toBe(0); expect(activity.getDiagnostics().registeredJobs).toBe(0);
  });
});
