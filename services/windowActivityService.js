/** Native focus/visibility is authoritative; DOM focus can stay on an editor. */
function trackWindowActivity(win) {
    const contents = win.webContents;
    const publish = () => {
        if (win.isDestroyed() || contents.isDestroyed()) return;
        contents.send('window-activity-changed', {
            focused: win.isFocused(),
            visible: win.isVisible() && !win.isMinimized()
        });
    };
    const events = ['focus', 'blur', 'show', 'hide', 'minimize', 'restore'];
    for (const event of events) win.on(event, publish);
    // The renderer may miss native events during startup or reload.
    contents.on('did-finish-load', publish);
    const dispose = () => {
        for (const event of events) win.removeListener(event, publish);
        contents.removeListener('did-finish-load', publish);
        win.removeListener('closed', dispose);
    };
    win.once('closed', dispose);
    return dispose;
}

// Presentation startup retries keyboard focus. They must never undo a user's
// Hide/Minimize action by showing the window again after a delayed request.
function focusVisibleWindow(win) {
    if (!win || win.isDestroyed()) return { success: false, error: 'Main window not available' };
    if (!win.isVisible() || win.isMinimized()) return { success: false, error: 'Main window is hidden or minimized' };
    win.focus();
    return { success: true };
}

module.exports = { trackWindowActivity, focusVisibleWindow };
