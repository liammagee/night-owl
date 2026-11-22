const { EventEmitter } = require('events');
const { trackWindowActivity, focusVisibleWindow } = require('../../../services/windowActivityService');

describe('native window activity', () => {
    function makeWindow() {
        const win = new EventEmitter();
        Object.assign(win, {
            webContents: Object.assign(new EventEmitter(), { send: jest.fn(), isDestroyed: () => false }),
            isDestroyed: () => false,
            isFocused: () => false,
            isVisible: () => true,
            isMinimized: () => false
        });
        return win;
    }

    test('publishes authoritative state on blur and after a renderer reload', () => {
        const win = makeWindow();
        trackWindowActivity(win);
        win.emit('blur');
        expect(win.webContents.send).toHaveBeenLastCalledWith('window-activity-changed', { focused: false, visible: true });
        win.isFocused = () => true;
        win.webContents.emit('did-finish-load');
        expect(win.webContents.send).toHaveBeenLastCalledWith('window-activity-changed', { focused: true, visible: true });
        win.isMinimized = () => true;
        win.emit('minimize');
        expect(win.webContents.send).toHaveBeenLastCalledWith('window-activity-changed', { focused: true, visible: false });
    });

    test('closed windows release subscriptions and destroyed contents are never messaged', () => {
        const win = makeWindow();
        trackWindowActivity(win);
        win.webContents.isDestroyed = () => true;
        win.emit('hide');
        expect(win.webContents.send).not.toHaveBeenCalled();
        win.emit('closed');
        expect(win.listenerCount('focus')).toBe(0);
        expect(win.webContents.listenerCount('did-finish-load')).toBe(0);
    });
});

describe('delayed presentation focus', () => {
    test('focuses a visible window without showing it again', () => {
        const win = { isDestroyed: () => false, isVisible: () => true, isMinimized: () => false, focus: jest.fn(), show: jest.fn() };
        expect(focusVisibleWindow(win)).toEqual({ success: true });
        expect(win.focus).toHaveBeenCalledTimes(1);
        expect(win.show).not.toHaveBeenCalled();
    });
    test('never reopens hidden, minimized, destroyed, or missing windows', () => {
        const win = { isDestroyed: () => false, isVisible: () => false, isMinimized: () => false, focus: jest.fn(), show: jest.fn() };
        expect(focusVisibleWindow(win).success).toBe(false);
        win.isVisible = () => true;
        win.isMinimized = () => true;
        expect(focusVisibleWindow(win).success).toBe(false);
        win.isDestroyed = () => true;
        expect(focusVisibleWindow(win).success).toBe(false);
        expect(focusVisibleWindow(null).success).toBe(false);
        expect(win.focus).not.toHaveBeenCalled();
        expect(win.show).not.toHaveBeenCalled();
    });
});
