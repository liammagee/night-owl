// Presentation TTS service delegate.
// The canonical browser implementation lives with the techne-presentations
// plugin because that package is synced into the app during install.
(function () {
  const pluginServicePath = '../plugins/techne-presentations/ttsService.js';
  const pluginBrowserSrc = 'plugins/techne-presentations/ttsService.js';

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = require(pluginServicePath);
    return;
  }

  if (typeof window === 'undefined' || window.ttsService || typeof document === 'undefined') {
    return;
  }

  if (document.querySelector(`script[src="${pluginBrowserSrc}"], script[data-nightowl-service-delegate="tts"]`)) {
    return;
  }

  const script = document.createElement('script');
  script.src = pluginBrowserSrc;
  script.async = false;
  script.dataset.nightowlServiceDelegate = 'tts';
  document.head.appendChild(script);
})();
