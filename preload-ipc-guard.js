const ALLOWED_INVOKE_CHANNELS = new Set([
  'add-recent-file',
  'add-workspace-folder',
  'ai-chat',
  'ai-chat-stream',
  'ai-clear-conversation',
  'ai-get-conversation-history',
  'ai-restart-conversation',
  'batch-read-frontmatter',
  'browse-destination-folder',
  'browse-for-image',
  'browse-system-prompt-file',
  'change-working-directory',
  'check-docling-available',
  'check-file-exists',
  'check-pandoc-available',
  'choose-recording-location',
  'citations-add',
  'citations-bib-export-to-file',
  'citations-bib-import-from-file',
  'citations-bib-sync',
  'citations-delete',
  'citations-execute-sql',
  'citations-export',
  'citations-export-browser-capture-bundles',
  'citations-export-to-file',
  'citations-export-to-zotero',
  'citations-fetch-zotero-collections',
  'citations-format',
  'citations-get',
  'citations-get-by-id',
  'citations-get-by-key',
  'citations-get-capture-tools',
  'citations-get-last-sync-time',
  'citations-get-pending-captures',
  'citations-import-bib-to-db',
  'citations-import-doi',
  'citations-import-text',
  'citations-import-url',
  'citations-initialize',
  'citations-projects-add',
  'citations-projects-get',
  'citations-statistics',
  'citations-update',
  'citations-zotero-live-sync',
  'citations-zotero-sync',
  'close-speaker-notes-window',
  'collab-broadcast-cursor',
  'collab-broadcast-edit',
  'collab-get-status',
  'collab-start-server',
  'collab-stop-server',
  'convert-pdf-to-markdown',
  'convert-word-to-markdown',
  'copy-file',
  'copy-file-to',
  'copy-local-image-file',
  'create-file',
  'create-folder',
  'debug-log',
  'delete-file',
  'delete-item',
  'dialog-open-file',
  'embed-pdf-annotations',
  'example-handler',
  'export-pdf-with-template',
  'export-settings',
  'export-to-epub',
  'export-to-latex',
  'extract-notes-content',
  'extract-text-with-replacement',
  'feed:credential-info',
  'feed:delete-source',
  'feed:dismiss',
  'feed:import-chrome-tabs',
  'feed:list',
  'feed:list-credentials',
  'feed:list-sources',
  'feed:refresh-now',
  'feed:save-to-citations',
  'feed:score-now',
  'feed:set-credential',
  'feed:set-source-enabled',
  'feed:test-source',
  'feed:upsert-source',
  'feed:x-clear-session',
  'feed:x-open-login',
  'feed:x-status',
  'fetch-url-title',
  'focus-main-window',
  'generate-document-summaries',
  'generate-image',
  'generate-thumbnail',
  'generate-thumbnail-dialog',
  'get-available-ai-providers',
  'get-available-files',
  'get-current-ai-config',
  'get-current-file-content',
  'get-default-ai-provider',
  'get-file-context',
  'get-file-tree-signature',
  'get-folder-contents',
  'get-initial-theme',
  'get-markdown-files',
  'get-navigation-history',
  'get-pdf-templates',
  'get-provider-models',
  'get-recent-files',
  'get-recent-workspaces',
  'get-screen-sources',
  'get-settings',
  'get-settings-category',
  'get-tutor-core-status',
  'get-working-directory',
  'get-workspace-folders',
  'git-add-remote',
  'git-blame',
  'git-cherry-pick',
  'git-commit',
  'git-create-tag',
  'git-delete-tag',
  'git-diff',
  'git-diff-commit',
  'git-diff-hunks',
  'git-diff-lines',
  'git-discard',
  'git-fetch',
  'git-file-content',
  'git-find-repo',
  'git-get-branch',
  'git-list-branches',
  'git-list-remotes',
  'git-list-tags',
  'git-log',
  'git-log-graph',
  'git-mark-resolved',
  'git-merge-conflicts',
  'git-publish',
  'git-pull',
  'git-push',
  'git-push-tags',
  'git-push-to-remote',
  'git-remove-remote',
  'git-show',
  'git-stage',
  'git-stage-hunk',
  'git-stash-apply',
  'git-stash-drop',
  'git-stash-list',
  'git-stash-save',
  'git-status',
  'git-status-detailed',
  'git-status-summary',
  'git-switch-branch',
  'git-unstage',
  'global-replace',
  'global-search',
  'grammar-check-text',
  'import-pdf-as-markdown',
  'import-settings',
  'import-word-as-markdown',
  'import-zotero-bibtex',
  'library.append-internal-link',
  'list-directory-files',
  'load-style-file',
  'load-style-preferences',
  'load-user-styles',
  'move-file',
  'move-item',
  'open-external',
  'open-file',
  'open-file-path',
  'open-folder-in-finder',
  'open-speaker-notes-window',
  'paste-image-from-clipboard',
  'perform-export-docx',
  'perform-export-html',
  'perform-export-html-pandoc',
  'perform-export-pdf',
  'perform-export-pdf-pandoc',
  'perform-export-pptx',
  'perform-open-file',
  'perform-save',
  'perform-save-as',
  'perform-save-with-path',
  'performance:get-gpu-diagnostics',
  'performance:get-resource-diagnostics',
  'performance:start-trace',
  'performance:stop-trace',
  'read-file',
  'read-file-content',
  'read-file-content-only',
  'read-frontmatter-only',
  'recovery-clear',
  'recovery-load',
  'recovery-persist',
  'refresh-file-tree',
  'remove-workspace-folder',
  'rename-item',
  'reorder-workspace-folders',
  'request-file-tree',
  'reset-settings-category',
  'save-file',
  'save-image-data',
  'save-image-to-current-dir',
  'save-navigation-history',
  'save-style-preferences',
  'save-user-styles',
  'save-video-recording',
  'select-image-file',
  'send-chat-message',
  'send-chat-message-with-context',
  'send-chat-message-with-options',
  'set-current-file',
  'set-default-ai-provider',
  'set-settings',
  'show-confirm-dialog',
  'show-context-menu',
  'show-delete-confirm',
  'show-text-context-menu',
  'spell-add-word',
  'spell-check-words',
  'spell-get-dictionary',
  'spell-get-languages',
  'spell-get-suggestions',
  'spell-remove-word',
  'spell-set-languages',
  'static-site-generate',
  'static-site-preview',
  'summarize-text-to-notes',
  'switch-workspace',
  'terminal-exec',
  'terminal-kill',
  'terminal-resize',
  'terminal-spawn',
  'terminal-write',
  'test-ai-service',
  'trigger-export',
  'trigger-new-file',
  'tts-check-availability',
  'tts-generate-speech',
  'tts-get-settings',
  'tts-get-voices',
  'tts-test',
  'update-settings-category',
  'update-speaker-notes',
  'video-get-settings',
  'video-get-sources',
  'video-update-settings',
  'write-file'
]);

const ALLOWED_ON_CHANNELS = new Set([
  'ai-chat-stream-chunk',
  'change-layout',
  'citation-capture-request',
  'collab-peer-joined',
  'collab-peer-left',
  'collab-peer-renamed',
  'collab-remote-cursor',
  'collab-remote-edit',
  'context-menu-command',
  'current-file-changed-on-disk',
  'current-file-deleted-on-disk',
  'exit-presentation',
  'feed:items',
  'feed:scored',
  'feed:source-error',
  'file-opened',
  'first-slide',
  'format-text',
  'generate-ai-heading',
  'html-export-completed',
  'load-presentation-content',
  'load-presentation-file',
  'menu:close-tab',
  'new-file-created',
  'next-slide',
  'open-ai-settings-dialog',
  'open-editor-settings-dialog',
  'open-export-settings-dialog',
  'open-diagnostics',
  'open-settings',
  'open-settings-dialog',
  'open-style-settings',
  'previous-slide',
  'refresh-file-tree',
  'save-all-and-close',
  'set-theme',
  'settings-changed',
  'show-command-palette',
  'show-presentation-statistics',
  'speaker-notes-window-closed',
  'start-presentation',
  'switch-to-editor',
  'switch-to-network',
  'switch-to-presentation',
  'terminal-output',
  'theme-changed',
  'theme-updated',
  'toggle-ai-chat',
  'toggle-assistant-terminal',
  'toggle-gamification-panel',
  'toggle-presentation-mode',
  'toggle-preview-pane',
  'toggle-visual-markdown',
  'trigger-export-docx',
  'trigger-export-docx-refs',
  'trigger-export-html',
  'trigger-export-html-accessible',
  'trigger-export-html-pandoc',
  'trigger-export-pdf',
  'trigger-export-pdf-pandoc',
  'trigger-export-pptx',
  'trigger-generate-thumbnail',
  'trigger-import-pdf',
  'trigger-import-word',
  'trigger-save',
  'trigger-save-as',
  'update-speaker-notes',
  'zoom-in',
  'zoom-out',
  'reset-zoom'
]);

const ALLOWED_SEND_CHANNELS = new Set([
  'citations-capture-ready',
  'save-layout',
  'saves-completed-close'
]);

const PREFIX_CAPABILITIES = Object.freeze([
  ['citations-', 'citations'],
  ['collab-', 'collaboration'],
  ['feed:', 'feed'],
  ['git-', 'git'],
  ['performance:', 'performance'],
  ['spell-', 'spellcheck'],
  ['static-site-', 'publishing'],
  ['terminal-', 'terminal'],
  ['tts-', 'speech'],
  ['video-', 'video']
]);

const CAPABILITY_CHANNELS = Object.freeze({
  ai: new Set([
    'ai-chat', 'ai-chat-stream', 'ai-clear-conversation', 'ai-get-conversation-history',
    'ai-restart-conversation', 'extract-notes-content', 'generate-document-summaries',
    'get-available-ai-providers', 'get-current-ai-config', 'get-default-ai-provider',
    'get-provider-models', 'get-tutor-core-status', 'grammar-check-text',
    'send-chat-message', 'send-chat-message-with-context', 'send-chat-message-with-options',
    'set-default-ai-provider', 'summarize-text-to-notes', 'test-ai-service'
  ]),
  documents: new Set([
    'browse-destination-folder', 'check-docling-available', 'check-pandoc-available',
    'convert-pdf-to-markdown', 'convert-word-to-markdown', 'embed-pdf-annotations',
    'export-pdf-with-template', 'export-to-epub', 'export-to-latex',
    'get-pdf-templates', 'import-pdf-as-markdown', 'import-word-as-markdown',
    'perform-export-docx', 'perform-export-html',
    'perform-export-html-pandoc', 'perform-export-pdf', 'perform-export-pdf-pandoc',
    'perform-export-pptx', 'trigger-export'
  ]),
  files: new Set([
    'add-recent-file', 'batch-read-frontmatter', 'check-file-exists', 'copy-file',
    'copy-file-to', 'create-file', 'create-folder', 'delete-file', 'delete-item',
    'dialog-open-file', 'extract-text-with-replacement', 'get-current-file-content', 'get-file-context',
    'get-file-tree-signature', 'get-folder-contents', 'get-markdown-files',
    'list-directory-files', 'move-file', 'move-item', 'open-file', 'open-file-path',
    'perform-open-file', 'perform-save', 'perform-save-as', 'perform-save-with-path',
    'read-file', 'read-file-content', 'read-file-content-only',
    'read-frontmatter-only', 'refresh-file-tree', 'rename-item', 'request-file-tree',
    'save-file', 'set-current-file', 'write-file'
  ]),
  images: new Set([
    'browse-for-image', 'copy-local-image-file', 'generate-image', 'generate-thumbnail',
    'generate-thumbnail-dialog', 'paste-image-from-clipboard', 'save-image-data',
    'save-image-to-current-dir', 'select-image-file'
  ]),
  navigation: new Set([
    'fetch-url-title', 'get-navigation-history', 'open-external', 'open-folder-in-finder',
    'save-navigation-history'
  ]),
  presentation: new Set([
    'choose-recording-location', 'close-speaker-notes-window', 'focus-main-window',
    'get-screen-sources', 'open-speaker-notes-window', 'save-video-recording',
    'update-speaker-notes'
  ]),
  recovery: new Set(['recovery-clear', 'recovery-load', 'recovery-persist']),
  search: new Set(['global-replace', 'global-search']),
  settings: new Set([
    'browse-system-prompt-file', 'export-settings', 'get-initial-theme', 'get-settings',
    'get-settings-category', 'import-settings', 'load-style-file',
    'load-style-preferences', 'load-user-styles', 'reset-settings-category',
    'save-style-preferences', 'save-user-styles', 'set-settings',
    'update-settings-category'
  ]),
  workspace: new Set([
    'add-workspace-folder', 'change-working-directory', 'get-available-files',
    'get-recent-files', 'get-recent-workspaces', 'get-working-directory',
    'get-workspace-folders', 'remove-workspace-folder', 'reorder-workspace-folders',
    'switch-workspace'
  ])
});

function toMethodName(channel, prefix = '') {
  const source = prefix && channel.startsWith(prefix) ? channel.slice(prefix.length) : channel;
  return source.replace(/[-:.]+([a-z0-9])/g, (_match, letter) => letter.toUpperCase());
}

function getInvokeContract(channel) {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) return null;
  for (const [prefix, capability] of PREFIX_CAPABILITIES) {
    if (channel.startsWith(prefix)) {
      return { channel, capability, method: toMethodName(channel, prefix) };
    }
  }
  for (const [capability, channels] of Object.entries(CAPABILITY_CHANNELS)) {
    if (channels.has(channel)) {
      return { channel, capability, method: toMethodName(channel) };
    }
  }
  return { channel, capability: 'app', method: toMethodName(channel) };
}

function validateSerializable(value, path = 'payload', depth = 0, seen = new WeakSet()) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object') {
    throw new TypeError(`${path} contains unsupported ${typeof value} data`);
  }
  if (depth > 20) throw new TypeError(`${path} exceeds the maximum nesting depth`);
  if (seen.has(value)) throw new TypeError(`${path} contains a circular reference`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSerializable(item, `${path}[${index}]`, depth + 1, seen));
    seen.delete(value);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must contain plain objects only`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new TypeError(`${path} contains a blocked property`);
    }
    validateSerializable(child, `${path}.${key}`, depth + 1, seen);
  }
  seen.delete(value);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label, options = {}) {
  if (typeof value !== 'string' || (options.nonEmpty && value.trim() === '')) {
    throw new TypeError(`${label} must be${options.nonEmpty ? ' a non-empty' : ''} string`);
  }
  if (options.maxLength && value.length > options.maxLength) {
    throw new TypeError(`${label} exceeds ${options.maxLength} characters`);
  }
}

const ARGUMENT_VALIDATORS = Object.freeze({
  'collab-start-server': (args) => {
    const input = requireObject(args[0], 'options');
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
      throw new TypeError('options.port must be an integer from 1 to 65535');
    }
  },
  'feed:set-credential': (args) => {
    const input = requireObject(args[0], 'credential');
    requireString(input.sourceId, 'credential.sourceId', { nonEmpty: true, maxLength: 200 });
    requireString(input.name, 'credential.name', { nonEmpty: true, maxLength: 200 });
    requireString(input.value, 'credential.value', { maxLength: 65536 });
  },
  'extract-text-with-replacement': (args) => {
    const input = requireObject(args[0], 'request');
    for (const key of ['originalFilePath', 'textToReplace', 'replacementText', 'newFilePath', 'newFileContent']) {
      requireString(input[key], `request.${key}`, { nonEmpty: key !== 'newFileContent' });
    }
  },
  'git-stage': (args) => {
    const input = requireObject(args[0], 'request');
    requireString(input.repoRoot, 'request.repoRoot', { nonEmpty: true });
    if (!Array.isArray(input.paths) || input.paths.some(item => typeof item !== 'string')) {
      throw new TypeError('request.paths must be an array of strings');
    }
  },
  'open-external': (args) => requireString(args[0], 'target', { nonEmpty: true, maxLength: 16384 }),
  'save-file': (args) => {
    const input = requireObject(args[0], 'file');
    requireString(input.filePath, 'file.filePath', { nonEmpty: true });
    requireString(input.content, 'file.content');
  },
  'terminal-exec': (args) => {
    const input = requireObject(args[0], 'request');
    requireString(input.command, 'request.command', { nonEmpty: true, maxLength: 65536 });
    if (input.cwd != null) requireString(input.cwd, 'request.cwd', { nonEmpty: true });
  },
  'terminal-kill': (args) => {
    if (args[0] != null) requireObject(args[0], 'request');
  },
  'terminal-resize': (args) => {
    const input = requireObject(args[0], 'request');
    if (!Number.isInteger(input.cols) || input.cols < 1 || input.cols > 1000) {
      throw new TypeError('request.cols must be an integer from 1 to 1000');
    }
    if (!Number.isInteger(input.rows) || input.rows < 1 || input.rows > 1000) {
      throw new TypeError('request.rows must be an integer from 1 to 1000');
    }
  },
  'terminal-spawn': (args) => {
    const input = args[0] == null ? {} : requireObject(args[0], 'request');
    if (input.cwd != null) requireString(input.cwd, 'request.cwd', { nonEmpty: true });
  },
  'terminal-write': (args) => {
    const input = requireObject(args[0], 'request');
    requireString(input.data, 'request.data', { maxLength: 1048576 });
  },
  'write-file': (args) => {
    if (typeof args[0] === 'string') {
      requireString(args[0], 'filePath', { nonEmpty: true });
      requireString(args[1], 'content');
      return;
    }
    const input = requireObject(args[0], 'file');
    requireString(input.filePath, 'file.filePath', { nonEmpty: true });
    requireString(input.content, 'file.content');
  }
});

function validateInvokeArgs(channel, args) {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    throw new Error(`[ipc-contract] Unknown invoke channel: ${String(channel)}`);
  }
  validateSerializable(args, `${channel} arguments`);
  try {
    ARGUMENT_VALIDATORS[channel]?.(args);
  } catch (error) {
    throw new TypeError(`[ipc-contract] Invalid payload for ${channel}: ${error.message}`);
  }
}

function createCapabilityApi(ipcRenderer, options = {}) {
  const api = {
    isElectron: true,
    platform: options.platform || process.platform,
    events: {},
    signals: {}
  };

  for (const channel of ALLOWED_INVOKE_CHANNELS) {
    const contract = getInvokeContract(channel);
    if (!api[contract.capability]) api[contract.capability] = {};
    if (api[contract.capability][contract.method]) {
      throw new Error(`[ipc-contract] Duplicate capability method: ${contract.capability}.${contract.method}`);
    }
    api[contract.capability][contract.method] = (...args) => {
      validateInvokeArgs(channel, args);
      return ipcRenderer.invoke(channel, ...args);
    };
  }

  for (const channel of ALLOWED_ON_CHANNELS) {
    const method = toMethodName(channel);
    api.events[method] = (listener) => {
      if (typeof listener !== 'function') {
        throw new TypeError('[preload] IPC listener must be a function');
      }
      const subscription = (event, ...args) => listener(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    };
  }

  for (const channel of ALLOWED_SEND_CHANNELS) {
    const method = toMethodName(channel);
    api.signals[method] = (...args) => {
      validateSerializable(args, `${channel} arguments`);
      return ipcRenderer.send(channel, ...args);
    };
  }

  for (const value of Object.values(api)) {
    if (value && typeof value === 'object') Object.freeze(value);
  }
  return Object.freeze(api);
}

module.exports = {
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_ON_CHANNELS,
  ALLOWED_SEND_CHANNELS,
  ARGUMENT_VALIDATORS,
  CAPABILITY_CHANNELS,
  createCapabilityApi,
  getInvokeContract,
  toMethodName,
  validateInvokeArgs,
  validateSerializable
};
