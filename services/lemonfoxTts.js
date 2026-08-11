'use strict';

const ENDPOINTS = Object.freeze({
  global: 'https://api.lemonfox.ai/v1/audio/speech',
  eu: 'https://eu-api.lemonfox.ai/v1/audio/speech'
});
const FORMATS = new Set(['mp3', 'opus', 'aac', 'flac', 'pcm', 'ogg', 'wav']);
const LANGUAGES = new Set(['en-us', 'en-gb', 'es', 'fr', 'it', 'pt-br', 'ja', 'zh', 'hi']);
const ENGLISH_VOICES = Object.freeze([
  'heart', 'bella', 'michael', 'alloy', 'aoede', 'kore', 'jessica', 'nicole', 'nova', 'river',
  'sarah', 'sky', 'echo', 'eric', 'fenrir', 'liam', 'onyx', 'puck', 'adam', 'santa',
  'alice', 'emma', 'isabella', 'lily', 'daniel', 'fable', 'george', 'lewis'
]);

function normalizeRequest(input = {}, defaults = {}) {
  const text = String(input.text ?? input.input ?? '').trim();
  if (!text) throw new Error('No text was provided for speech.');
  if (text.length > 10000) throw new Error('Speech text exceeds the 10,000 character limit.');
  const formatCandidate = String(input.response_format || defaults.response_format || 'mp3').toLowerCase();
  const languageCandidate = String(input.language || defaults.language || 'en-us').toLowerCase();
  const speedCandidate = Number(input.speed ?? defaults.speed ?? 1);
  const regionCandidate = String(input.region || defaults.region || 'global').toLowerCase();
  return {
    input: text,
    voice: String(input.voice || defaults.voice || 'heart').toLowerCase().slice(0, 80),
    language: LANGUAGES.has(languageCandidate) ? languageCandidate : 'en-us',
    speed: Math.min(4, Math.max(0.5, Number.isFinite(speedCandidate) ? speedCandidate : 1)),
    response_format: FORMATS.has(formatCandidate) ? formatCandidate : 'mp3',
    word_timestamps: Boolean(input.word_timestamps ?? defaults.word_timestamps),
    region: ENDPOINTS[regionCandidate] ? regionCandidate : 'global'
  };
}

function safeProviderError(response) {
  const status = Number(response?.status) || 0;
  const statusText = String(response?.statusText || '').replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80);
  return `Lemonfox request failed${status ? ` (${status}${statusText ? ` ${statusText}` : ''})` : ''}.`;
}

async function synthesizeSpeech(request, apiKey, options = {}) {
  if (!apiKey) throw new Error('Lemonfox is not configured. Add an API key in Speech settings.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Network requests are unavailable in this NightOwl build.');
  const normalized = normalizeRequest(request, options.defaults);
  const { region, ...body } = normalized;
  const response = await fetchImpl(ENDPOINTS[region], {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(safeProviderError(response));

  if (body.word_timestamps) {
    const payload = await response.json();
    const audioData = payload.audio || payload.audio_data || payload.audioData;
    if (typeof audioData !== 'string' || !audioData) throw new Error('Lemonfox returned no audio data.');
    return {
      success: true,
      audioData: audioData.replace(/^data:[^;]+;base64,/, ''),
      format: body.response_format,
      timestamps: payload.timestamps || payload.word_timestamps || payload.words || []
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('Lemonfox returned an empty audio response.');
  return { success: true, audioData: buffer.toString('base64'), format: body.response_format };
}

module.exports = {
  ENDPOINTS,
  ENGLISH_VOICES,
  FORMATS,
  LANGUAGES,
  normalizeRequest,
  safeProviderError,
  synthesizeSpeech
};
