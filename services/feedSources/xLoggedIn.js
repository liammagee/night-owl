// === x.com adapter (logged-in browser session) ===
//
// X's free API tier no longer permits reading. Two non-paid options:
//   (a) Bluesky/Mastodon as substitutes (handled by other adapters).
//   (b) Reuse the user's existing logged-in cookie session in a hidden
//       Electron BrowserWindow.
//
// This file implements (b). The window is created with maximum sandboxing:
//   - contextIsolation: true, nodeIntegration: false, sandbox: true
//   - no preload script, no electronAPI exposure
//   - persistent session partition so cookies survive restarts
//   - webRequest filter pinning the window to x.com / twitter.com origins
//
// The window stays hidden during polling. When the user clicks "Connect X
// session" in the panel UI, we surface the window so they can log in once.
//
// FRAGILITY: x.com's DOM changes regularly. The selectors here will rot.
// All extraction failure paths emit a `feed:source-error` so the panel can
// surface a "re-authenticate or selectors broken" state without crashing.

const path = require('path');

const HOME_URL = 'https://x.com/home';
const LOGIN_URL = 'https://x.com/login';
const SESSION_PARTITION = 'persist:research-feed-x';
const POLL_TIMEOUT_MS = 25000;
const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

let pollWindow = null;
let visibleLoginWindow = null;
let pendingNavigation = null;

function getElectron() {
    try { return require('electron'); } catch (_) { return null; }
}

function configureSession(session) {
    if (session.__rfXConfigured) return;
    const allowed = /^(https?:\/\/)?([a-z0-9-]+\.)*(x\.com|twitter\.com|twimg\.com|t\.co)(\/|$|:)/i;
    session.webRequest.onBeforeRequest((details, cb) => {
        if (allowed.test(details.url) || details.url.startsWith('about:') || details.url.startsWith('data:')) {
            cb({ cancel: false });
        } else {
            cb({ cancel: true });
        }
    });
    session.setUserAgent(USER_AGENT);
    session.__rfXConfigured = true;
}

function ensurePollWindow() {
    if (pollWindow && !pollWindow.isDestroyed()) return pollWindow;
    const electron = getElectron();
    if (!electron) throw new Error('Electron not available');
    const { BrowserWindow, session } = electron;
    const ses = session.fromPartition(SESSION_PARTITION);
    configureSession(ses);
    pollWindow = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
            session: ses,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            preload: undefined,
            webSecurity: true,
            backgroundThrottling: false
        }
    });
    pollWindow.on('closed', () => { pollWindow = null; });
    return pollWindow;
}

async function loadAndWait(win, url) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            win.webContents.removeListener('did-finish-load', onLoad);
            win.webContents.removeListener('did-fail-load', onFail);
            clearTimeout(timer);
        };
        const onLoad = () => { cleanup(); resolve(); };
        const onFail = (_e, code, desc) => {
            if (code === -3) return; // user-aborted
            cleanup();
            reject(new Error(`x.com load failed: ${desc} (${code})`));
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('x.com load timeout'));
        }, POLL_TIMEOUT_MS);
        win.webContents.once('did-finish-load', onLoad);
        win.webContents.once('did-fail-load', onFail);
        win.loadURL(url);
    });
}

const EXTRACTOR_SCRIPT = `
(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    // Wait up to 12s for at least one article to render.
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
        if (document.querySelector('article')) break;
        await sleep(400);
    }
    // Detect a redirect-to-login.
    if (location.pathname.startsWith('/i/flow/login') || location.pathname === '/login') {
        return { needsLogin: true, items: [] };
    }
    const articles = Array.from(document.querySelectorAll('article')).slice(0, 40);
    const items = [];
    for (const a of articles) {
        try {
            const timeEl = a.querySelector('time');
            const permalinkAnchor = timeEl && timeEl.closest('a');
            const permalink = permalinkAnchor && permalinkAnchor.getAttribute('href');
            if (!permalink) continue;
            const url = 'https://x.com' + permalink;
            const idMatch = permalink.match(/status\\/(\\d+)/);
            if (!idMatch) continue;
            const externalId = idMatch[1];
            const datetime = timeEl.getAttribute('datetime') || null;
            // Display name + handle live in spans near the top of each article.
            const userBlock = a.querySelector('[data-testid="User-Name"]');
            let displayName = '';
            let handle = '';
            if (userBlock) {
                const spans = userBlock.querySelectorAll('span');
                for (const s of spans) {
                    const t = (s.textContent || '').trim();
                    if (!displayName && t && !t.startsWith('@') && !t.match(/^\\d/)) displayName = t;
                    if (!handle && t.startsWith('@')) handle = t;
                }
            }
            const textEl = a.querySelector('[data-testid="tweetText"]');
            const text = textEl ? textEl.textContent.trim() : '';
            items.push({
                id: externalId,
                url,
                title: text.slice(0, 140) || (displayName ? \`Post by \${displayName}\` : 'Post'),
                summary: text.slice(0, 600),
                author: displayName ? \`\${displayName} \${handle}\`.trim() : handle,
                publishedAt: datetime,
                tags: [],
                raw: { handle, displayName, scrapedFrom: 'home' }
            });
        } catch (_) { /* skip malformed */ }
    }
    return { needsLogin: false, items };
})();
`;

async function fetch({ config = {} } = {}) {
    if (config.disabled) return { items: [], skipped: 'disabled' };
    if (pendingNavigation) return { items: [], skipped: 'busy' };
    pendingNavigation = true;
    try {
        const win = ensurePollWindow();
        await loadAndWait(win, HOME_URL);
        // Give the SPA a moment to mount.
        await new Promise((r) => setTimeout(r, 1500));
        const result = await win.webContents.executeJavaScript(EXTRACTOR_SCRIPT, true);
        if (result?.needsLogin) {
            const err = new Error('x.com session not logged in');
            err.code = 'X_NEEDS_LOGIN';
            throw err;
        }
        return { items: result?.items || [] };
    } finally {
        pendingNavigation = false;
    }
}

async function openLoginWindow() {
    const electron = getElectron();
    if (!electron) throw new Error('Electron not available');
    const { BrowserWindow, session } = electron;
    if (visibleLoginWindow && !visibleLoginWindow.isDestroyed()) {
        visibleLoginWindow.show();
        visibleLoginWindow.focus();
        return;
    }
    const ses = session.fromPartition(SESSION_PARTITION);
    configureSession(ses);
    visibleLoginWindow = new BrowserWindow({
        show: true,
        width: 1024,
        height: 768,
        title: 'Connect x.com session — log in here',
        webPreferences: {
            session: ses,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            preload: undefined,
            webSecurity: true
        }
    });
    visibleLoginWindow.on('closed', () => { visibleLoginWindow = null; });
    visibleLoginWindow.loadURL(LOGIN_URL);
}

async function getStatus() {
    // Light probe: load home, see if redirected to login. Reuses pollWindow.
    try {
        const win = ensurePollWindow();
        await loadAndWait(win, HOME_URL);
        await new Promise((r) => setTimeout(r, 1000));
        const path = await win.webContents.executeJavaScript('window.location.pathname', true);
        if (path.startsWith('/i/flow/login') || path === '/login') {
            return { state: 'logged-out' };
        }
        return { state: 'logged-in' };
    } catch (err) {
        return { state: 'error', message: err.message };
    }
}

async function clearSession() {
    const electron = getElectron();
    if (!electron) return;
    const ses = electron.session.fromPartition(SESSION_PARTITION);
    await ses.clearStorageData();
    if (pollWindow && !pollWindow.isDestroyed()) {
        pollWindow.close();
        pollWindow = null;
    }
    if (visibleLoginWindow && !visibleLoginWindow.isDestroyed()) {
        visibleLoginWindow.close();
        visibleLoginWindow = null;
    }
}

module.exports = { fetch, openLoginWindow, getStatus, clearSession, SESSION_PARTITION };
