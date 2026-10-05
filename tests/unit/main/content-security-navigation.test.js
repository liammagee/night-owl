const {
  hasExplicitScheme,
  installNavigationGuards,
  isAllowedExternalUrl,
  isTrustedAppNavigation
} = require('../../../services/contentSecurity');

describe('main-window navigation policy', () => {
  test('allowlists browser and mail protocols only', () => {
    expect(isAllowedExternalUrl('https://machinespirits.org/path')).toBe(true);
    expect(isAllowedExternalUrl('http://localhost:3000/path')).toBe(true);
    expect(isAllowedExternalUrl('mailto:hello@example.com')).toBe(true);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('data:text/html,unsafe')).toBe(false);
    expect(isAllowedExternalUrl('file:///workspace/private.md')).toBe(false);
    expect(isAllowedExternalUrl('/workspace/private.md')).toBe(false);
    expect(hasExplicitScheme('custom-protocol:value')).toBe(true);
    expect(hasExplicitScheme('C:\\workspace\\notes.md')).toBe(false);
  });

  test('recognizes only the loaded app document as trusted navigation', () => {
    const entry = 'file:///Applications/NightOwl.app/Contents/Resources/app.asar/index.html';

    expect(isTrustedAppNavigation(`${entry}#heading-one`, entry)).toBe(true);
    expect(isTrustedAppNavigation('file:///workspace/other.html', entry)).toBe(false);
    expect(isTrustedAppNavigation('https://machinespirits.org', entry)).toBe(false);
  });

  test('denies every popup and opens only allowlisted external URLs', async () => {
    const handlers = {};
    const webContents = {
      setWindowOpenHandler: jest.fn(handler => { handlers.open = handler; }),
      on: jest.fn((event, handler) => { handlers[event] = handler; })
    };
    const openExternal = jest.fn(() => Promise.resolve());
    const appEntryUrl = 'file:///Applications/NightOwl.app/Contents/Resources/app.asar/index.html';
    installNavigationGuards(webContents, { appEntryUrl, openExternal });

    expect(handlers.open({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(handlers.open({ url: 'https://machinespirits.org' })).toEqual({ action: 'deny' });
    await Promise.resolve();
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://machinespirits.org');

    const sameDocumentEvent = { preventDefault: jest.fn() };
    handlers['will-navigate'](sameDocumentEvent, `${appEntryUrl}#section`);
    expect(sameDocumentEvent.preventDefault).not.toHaveBeenCalled();

    const externalEvent = { preventDefault: jest.fn() };
    handlers['will-navigate'](externalEvent, 'mailto:hello@example.com');
    await Promise.resolve();
    expect(externalEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('mailto:hello@example.com');

    const fileEvent = { preventDefault: jest.fn() };
    handlers['will-navigate'](fileEvent, 'file:///workspace/untrusted.html');
    expect(fileEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledTimes(2);
  });
});
