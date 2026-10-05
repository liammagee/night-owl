const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');

test('packaged app includes the template engine and every built-in template asset', () => {
    const config = require('../../../package.json');
    expect(config.build.files).toContain('styles/**/*');
    for (const file of ['style-manager.js', 'style-settings-ui.js', ...['default','academic','minimal','dark','techne-red','techne-orange'].map(name => `templates/presentations/${name}.css`)]) {
        expect(fs.statSync(path.join(root, 'styles', file)).size).toBeGreaterThan(0);
    }
});
