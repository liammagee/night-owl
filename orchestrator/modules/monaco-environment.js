(function () {
    const MONACO_BASE_PATH = './';
    const MONACO_VS_PATH = './vs';

    function resolveMonacoUrl(path) {
        return new URL(path, window.location.href).toString();
    }

    function createWorkerBootstrapUrl() {
        const baseUrl = resolveMonacoUrl(MONACO_BASE_PATH);
        const workerMainUrl = resolveMonacoUrl(`${MONACO_VS_PATH}/base/worker/workerMain.js`);
        const source = [
            `self.MonacoEnvironment = { baseUrl: ${JSON.stringify(baseUrl)} };`,
            `importScripts(${JSON.stringify(workerMainUrl)});`
        ].join('\n');

        return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    }

    function configureMonacoEnvironment() {
        const monacoEnvironment = {
            getWorkerUrl: function () {
                return createWorkerBootstrapUrl();
            }
        };

        window.MonacoEnvironment = monacoEnvironment;
        self.MonacoEnvironment = monacoEnvironment;

        if (typeof require !== 'undefined' && typeof require.config === 'function') {
            require.config({
                paths: { vs: MONACO_VS_PATH },
                'vs/nls': { availableLanguages: { '*': 'en' } }
            });
        }
    }

    window.configureMonacoEnvironment = configureMonacoEnvironment;
    configureMonacoEnvironment();
})();
