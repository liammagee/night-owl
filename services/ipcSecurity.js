const {
  ALLOWED_SEND_CHANNELS,
  ALLOWED_INVOKE_CHANNELS,
  validateInvokeArgs,
  validateSerializable
} = require('../preload-ipc-guard');

function getSenderUrl(event) {
  return String(event?.senderFrame?.url || event?.sender?.getURL?.() || '');
}

function createTrustedSenderValidator(options = {}) {
  return function isTrustedSender(event) {
    const mainWindow = options.getMainWindow?.();
    const speakerNotesWindow = options.getSpeakerNotesWindow?.();
    const sender = event?.sender;
    const trustedWindow = [mainWindow, speakerNotesWindow].find(window => (
      window?.webContents && window.webContents === sender
    ));
    if (!trustedWindow) return false;

    // A subframe shares its owning WebContents. Reject it even when the outer
    // NightOwl window is trusted so embedded preview content cannot reach IPC.
    if (event.senderFrame && sender?.mainFrame && event.senderFrame !== sender.mainFrame) {
      return false;
    }

    const url = getSenderUrl(event);
    if (!url) return false;
    if (trustedWindow === speakerNotesWindow) return url.startsWith('data:text/html');
    return url === options.appEntryUrl || url.startsWith(`${options.appEntryUrl}#`);
  };
}

function installIpcMainGuard(ipcMain, options = {}) {
  if (!ipcMain?.handle || !ipcMain?.on) {
    throw new TypeError('ipcMain.handle and ipcMain.on are required');
  }
  if (ipcMain.__nightOwlSecurityInstalled) return ipcMain.__nightOwlSecurityInstalled;

  const isTrustedSender = options.isTrustedSender || createTrustedSenderValidator(options);
  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);
  const originalRemoveListener = ipcMain.removeListener?.bind(ipcMain);
  const listenerWrappers = new Map();

  ipcMain.handle = (channel, handler) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      throw new Error(`[ipc-security] Handler is not declared in the preload contract: ${channel}`);
    }
    return originalHandle(channel, async (event, ...args) => {
      if (!isTrustedSender(event)) {
        throw new Error(`[ipc-security] Rejected unexpected sender for ${channel}`);
      }
      validateInvokeArgs(channel, args);
      return handler(event, ...args);
    });
  };

  ipcMain.on = (channel, listener) => {
    if (!ALLOWED_SEND_CHANNELS.has(channel)) {
      throw new Error(`[ipc-security] Signal is not declared in the preload contract: ${channel}`);
    }
    const wrapped = (event, ...args) => {
      if (!isTrustedSender(event)) return;
      validateSerializable(args, `${channel} arguments`);
      return listener(event, ...args);
    };
    if (!listenerWrappers.has(channel)) listenerWrappers.set(channel, new Map());
    listenerWrappers.get(channel).set(listener, wrapped);
    return originalOn(channel, wrapped);
  };

  if (originalRemoveListener) {
    ipcMain.removeListener = (channel, listener) => {
      const wrapped = listenerWrappers.get(channel)?.get(listener) || listener;
      listenerWrappers.get(channel)?.delete(listener);
      return originalRemoveListener(channel, wrapped);
    };
  }

  const installation = Object.freeze({
    isTrustedSender,
    restore() {
      ipcMain.handle = originalHandle;
      ipcMain.on = originalOn;
      if (originalRemoveListener) ipcMain.removeListener = originalRemoveListener;
      delete ipcMain.__nightOwlSecurityInstalled;
    }
  });
  Object.defineProperty(ipcMain, '__nightOwlSecurityInstalled', {
    configurable: true,
    value: installation
  });
  return installation;
}

module.exports = {
  createTrustedSenderValidator,
  getSenderUrl,
  installIpcMainGuard
};
