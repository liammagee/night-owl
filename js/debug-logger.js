/**
 * Debug Logger
 * Centralized logging utility with toggleable verbosity levels.
 * Set window.DEBUG_LEVEL to control output:
 *   0 = errors only
 *   1 = errors + warnings
 *   2 = errors + warnings + info (default)
 *   3 = all (including verbose debug)
 *
 * Also filters out noisy module prefixes by default.
 * Set window.DEBUG_VERBOSE = true to see all logs.
 */

(function() {
    'use strict';

    // Default to warn level (errors + warnings only)
    // Set to 2 for info, 3 for full debug
    const DEFAULT_LEVEL = typeof window !== 'undefined' && window.DEBUG_LEVEL !== undefined
        ? window.DEBUG_LEVEL
        : 1; // Warnings + Errors only by default

    let currentLevel = DEFAULT_LEVEL;

    // Prefixes to filter out unless verbose mode is enabled
    const NOISY_PREFIXES = [
        '[Mode Switching]',
        '[Visual Markdown]',
        '[Preview]',
        '[PreviewZoom]',
        '[FileHandlers]',
        '[Settings]',
        '[Plugins]',
        '[TechnePlugins]',
        '[Collaboration]',
        '[Internal Links]',
        '[Decoration]',
        '[Widget]',
        '[Statistics]',
        '[Graph]',
        '[Circle]',
        '[Network]',
        '[Autosave]',
        '[Export]',
        '[Kanban]',
        '[Formatting]',
        '[Navigation]',
        '[Structure]',
        '[Search]'
    ];

    // Store original console methods
    const originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        info: console.info.bind(console)
    };

    // Check if a message should be filtered
    function shouldFilter(args) {
        if (window.DEBUG_VERBOSE) return false;
        if (currentLevel >= 3) return false; // Don't filter at debug level

        const firstArg = args[0];
        if (typeof firstArg !== 'string') return false;

        return NOISY_PREFIXES.some(prefix => firstArg.startsWith(prefix));
    }

    // Override console.log to filter noisy messages
    console.log = function(...args) {
        if (!shouldFilter(args)) {
            originalConsole.log(...args);
        }
    };

    // Keep original for explicit use
    console.logAlways = originalConsole.log;

    const LEVELS = {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    };

    // Throttle repeated messages
    const messageThrottle = new Map();
    const THROTTLE_MS = 1000;

    function shouldLog(level) {
        return level <= currentLevel;
    }

    function throttled(key) {
        const now = Date.now();
        const last = messageThrottle.get(key);
        if (last && now - last < THROTTLE_MS) {
            return true; // Skip this message
        }
        messageThrottle.set(key, now);
        return false;
    }

    // Clean up old throttle entries periodically
    setInterval(() => {
        const now = Date.now();
        for (const [key, time] of messageThrottle) {
            if (now - time > THROTTLE_MS * 10) {
                messageThrottle.delete(key);
            }
        }
    }, 30000);

    const logger = {
        get level() { return currentLevel; },
        set level(val) { currentLevel = val; },

        LEVELS,

        error(...args) {
            if (shouldLog(LEVELS.ERROR)) {
                console.error(...args);
            }
        },

        warn(...args) {
            if (shouldLog(LEVELS.WARN)) {
                console.warn(...args);
            }
        },

        info(...args) {
            if (shouldLog(LEVELS.INFO)) {
                console.log(...args);
            }
        },

        debug(...args) {
            if (shouldLog(LEVELS.DEBUG)) {
                console.log(...args);
            }
        },

        // Throttled versions - won't repeat the same message within THROTTLE_MS
        debugThrottled(key, ...args) {
            if (shouldLog(LEVELS.DEBUG) && !throttled(key)) {
                console.log(...args);
            }
        },

        infoThrottled(key, ...args) {
            if (shouldLog(LEVELS.INFO) && !throttled(key)) {
                console.log(...args);
            }
        },

        // Group related logs
        group(label) {
            if (shouldLog(LEVELS.DEBUG)) {
                console.group(label);
            }
        },

        groupEnd() {
            if (shouldLog(LEVELS.DEBUG)) {
                console.groupEnd();
            }
        },

        // For timing operations
        time(label) {
            if (shouldLog(LEVELS.DEBUG)) {
                console.time(label);
            }
        },

        timeEnd(label) {
            if (shouldLog(LEVELS.DEBUG)) {
                console.timeEnd(label);
            }
        }
    };

    // Expose globally
    window.DebugLogger = logger;

    // Shorthand
    window.dbg = logger;

})();
