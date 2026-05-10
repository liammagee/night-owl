// === Chrome tab reader + deterministic filter ===
// macOS-only for now. Reads every tab in every window of Google Chrome via
// AppleScript and applies a domain blocklist + title heuristic to drop
// personal/generic tabs before they land in the research feed.
//
// First time this runs, macOS prompts:
//   "<App> wants to control Google Chrome." → System Settings → Privacy &
//   Security → Automation. If denied, osascript exits with code 1 and a
//   permission error in stderr; we surface that as a friendly message.

const { execFile } = require('child_process');

const APPLESCRIPT = `
tell application "Google Chrome"
    set out to ""
    set windowList to every window
    repeat with w in windowList
        set tabList to tabs of w
        repeat with t in tabList
            set tabUrl to URL of t
            set tabTitle to title of t
            set out to out & tabUrl & character id 9 & tabTitle & character id 10
        end repeat
    end repeat
    return out
end tell
`;

// Conservative defaults. Anything matching one of these regexes is dropped.
// Users can override via config.blocklist (replaces) or config.extraBlocklist
// (appends).
const DEFAULT_BLOCKLIST = [
    '^chrome://',
    '^chrome-extension://',
    '^file://',
    '^about:',
    '^view-source:',
    '^https?://localhost',
    '^https?://127\\.0\\.0\\.1',
    'mail\\.google\\.com',
    'gmail\\.com',
    'calendar\\.google\\.com',
    'meet\\.google\\.com',
    'slack\\.com/client',
    'app\\.slack\\.com',
    'discord\\.com/channels',
    'web\\.whatsapp\\.com',
    'messages\\.google\\.com',
    'linkedin\\.com/(messaging|notifications|feed)',
    'twitter\\.com/messages',
    'x\\.com/(messages|notifications|home|i/)',
    'facebook\\.com',
    'instagram\\.com',
    'netflix\\.com',
    'amazon\\.com/(gp|dp|cart)',
    'github\\.com/notifications'
];

const GENERIC_TITLES = new Set([
    'new tab',
    'untitled',
    '',
    'google',
    'duckduckgo',
    'bing'
]);

function readChromeTabs({ appName = 'Google Chrome', timeoutMs = 8000 } = {}) {
    const script = APPLESCRIPT.replace('Google Chrome', appName);
    return new Promise((resolve, reject) => {
        execFile('osascript', ['-e', script], { timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) {
                if (err.code === 1 && /not allowed assistive access|not authorized/i.test(stderr || '')) {
                    return reject(new Error(
                        'macOS denied Automation access to Chrome. Grant it in System Settings → ' +
                        'Privacy & Security → Automation, then retry.'
                    ));
                }
                if (/Application isn't running/i.test(stderr || '')) {
                    return reject(new Error(`${appName} is not running.`));
                }
                return reject(new Error(`osascript failed: ${stderr?.trim() || err.message}`));
            }
            const tabs = stdout
                .split('\n')
                .map((line) => {
                    const tabIdx = line.indexOf('\t');
                    if (tabIdx < 0) return null;
                    const url = line.slice(0, tabIdx).trim();
                    const title = line.slice(tabIdx + 1).trim();
                    if (!url) return null;
                    return { url, title };
                })
                .filter(Boolean);
            resolve(tabs);
        });
    });
}

function buildBlocklistRegex(patterns) {
    if (!patterns || patterns.length === 0) return null;
    return new RegExp(patterns.join('|'), 'i');
}

function isHomepageOnly(url) {
    try {
        const u = new URL(url);
        // Strip the leading slash. Empty path / search / hash means we're
        // looking at the bare domain root — usually a "generic" tab.
        const tail = u.pathname.replace(/^\/+/, '') + (u.search || '') + (u.hash || '');
        return tail.length === 0;
    } catch (_) {
        return false;
    }
}

function passesFilter(tab, { blocklist, extraBlocklist, allowHomepages, allowGenericTitles } = {}) {
    const patterns = blocklist || DEFAULT_BLOCKLIST.concat(extraBlocklist || []);
    const re = buildBlocklistRegex(patterns);
    if (re && re.test(tab.url)) return false;
    if (!allowGenericTitles && GENERIC_TITLES.has((tab.title || '').toLowerCase())) return false;
    if (!allowHomepages && isHomepageOnly(tab.url)) return false;
    return true;
}

/**
 * Read tabs and apply the deterministic filter. AI relevance gating happens
 * elsewhere (it needs tutor-bridge).
 */
async function listFilteredTabs(filterOpts = {}, readerOpts = {}) {
    const tabs = await readChromeTabs(readerOpts);
    const kept = tabs.filter((t) => passesFilter(t, filterOpts));
    const dropped = tabs.length - kept.length;
    return { tabs: kept, total: tabs.length, dropped };
}

module.exports = {
    readChromeTabs,
    listFilteredTabs,
    passesFilter,
    isHomepageOnly,
    DEFAULT_BLOCKLIST,
    GENERIC_TITLES
};
