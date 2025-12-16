/* Techne plugin manifest for NightOwl.
   - This manifest is shared with the portable Techne plugin loader.
*/

window.TECHNE_PLUGIN_MANIFEST = [
    {
        id: 'techne-backdrop',
        entry: 'plugins/techne-backdrop/plugin.js',
        enabledByDefault: true
    },
    {
        id: 'techne-presentations',
        entry: 'plugins/techne-presentations/plugin.js',
        enabledByDefault: true
    },
    {
        id: 'techne-markdown-renderer',
        entry: 'plugins/techne-markdown-renderer/plugin.js',
        enabledByDefault: true
    },
    {
        id: 'techne-network-diagram',
        entry: 'plugins/techne-network-diagram/plugin.js',
        enabledByDefault: true
    },
    {
        id: 'techne-circle',
        entry: 'plugins/techne-circle/plugin.js',
        enabledByDefault: false
    },
    {
        id: 'techne-maze',
        entry: 'plugins/techne-maze/plugin.js',
        enabledByDefault: true
    }
];
