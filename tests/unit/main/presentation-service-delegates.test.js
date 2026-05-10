describe('presentation service delegates', () => {
  beforeEach(() => {
    jest.resetModules();
    delete global.window;
  });

  test('app-level TTS service delegates to the plugin implementation in CommonJS', () => {
    const appTts = require('../../../services/ttsService.js');
    const pluginTts = require('../../../plugins/techne-presentations/ttsService.js');

    expect(appTts).toBe(pluginTts);
    expect(typeof appTts.speak).toBe('function');
  });

  test('app-level video recording service delegates to the plugin implementation in CommonJS', () => {
    const appVideo = require('../../../services/videoRecordingService.js');
    const pluginVideo = require('../../../plugins/techne-presentations/videoRecordingService.js');

    expect(appVideo).toBe(pluginVideo);
    expect(typeof appVideo.initializeRecording).toBe('function');
  });
});
