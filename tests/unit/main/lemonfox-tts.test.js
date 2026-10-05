const { ENDPOINTS, normalizeRequest, synthesizeSpeech } = require('../../../services/lemonfoxTts');

describe('Lemonfox provider service', () => {
  test('normalizes provider input and clamps unsafe values', () => {
    expect(normalizeRequest({ text: ' Hello ', speed: 99, response_format: 'exe', language: 'unknown', region: 'elsewhere' })).toEqual({
      input: 'Hello', voice: 'heart', language: 'en-us', speed: 4,
      response_format: 'mp3', word_timestamps: false, region: 'global'
    });
    expect(() => normalizeRequest({ text: 'x'.repeat(10001) })).toThrow('10,000');
  });

  test('preserves the requested raw audio format and fixed EU endpoint', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from('audio')
    }));
    const result = await synthesizeSpeech({ text: 'Hello', response_format: 'wav', region: 'eu' }, 'secret', { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(ENDPOINTS.eu, expect.objectContaining({ method: 'POST' }));
    expect(result).toMatchObject({ success: true, format: 'wav', audioData: Buffer.from('audio').toString('base64') });
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('elsewhere');
  });

  test('decodes timestamped JSON responses and does not echo provider bodies on failure', async () => {
    const timestamped = await synthesizeSpeech({ text: 'Hello', word_timestamps: true }, 'secret', {
      fetchImpl: async () => ({ ok: true, json: async () => ({ audio: 'YXVkaW8=', word_timestamps: [{ word: 'Hello' }] }) })
    });
    expect(timestamped).toMatchObject({ format: 'mp3', audioData: 'YXVkaW8=', timestamps: [{ word: 'Hello' }] });

    await expect(synthesizeSpeech({ text: 'private input' }, 'secret', {
      fetchImpl: async () => ({ ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'private input secret' })
    })).rejects.toThrow('Lemonfox request failed (401 Unauthorized).');
  });
});
