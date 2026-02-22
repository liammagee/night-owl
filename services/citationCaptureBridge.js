const http = require('http');

const DEFAULT_CAPTURE_HOST = '127.0.0.1';
const DEFAULT_CAPTURE_PORT = 27124;
const MAX_CAPTURE_BODY_BYTES = 1024 * 1024; // 1MB

function normalizeString(value) {
    if (typeof value !== 'string') return '';
    return value.trim();
}

function sanitizeHttpUrl(value) {
    const input = normalizeString(value);
    if (!input) return '';
    if (/^https?:\/\//i.test(input)) return input;
    if (/^www\./i.test(input)) return `https://${input}`;
    return '';
}

function parseQueryPayload(urlObj) {
    if (!urlObj || !urlObj.searchParams) return {};
    return {
        text: urlObj.searchParams.get('text') || '',
        selection: urlObj.searchParams.get('selection') || '',
        title: urlObj.searchParams.get('title') || '',
        url: urlObj.searchParams.get('url') || '',
        source: urlObj.searchParams.get('source') || ''
    };
}

function parseBodyPayload(rawBody) {
    const body = normalizeString(rawBody);
    if (!body) return {};

    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {
        // Fall through to URL-encoded parser
    }

    try {
        const params = new URLSearchParams(body);
        return {
            text: params.get('text') || '',
            selection: params.get('selection') || '',
            title: params.get('title') || '',
            url: params.get('url') || '',
            source: params.get('source') || ''
        };
    } catch (_) {
        return {};
    }
}

function normalizeCapturePayload(input = {}) {
    const text = normalizeString(input.text);
    const selection = normalizeString(input.selection);
    const pageTitle = normalizeString(input.title);
    const pageUrl = sanitizeHttpUrl(input.url);
    const source = normalizeString(input.source) || 'browser';

    const segments = [];
    const addSegment = (value) => {
        const normalized = normalizeString(value);
        if (!normalized) return;
        if (segments.includes(normalized)) return;
        segments.push(normalized);
    };

    addSegment(text);
    addSegment(selection);

    if (segments.length === 0) {
        addSegment(pageTitle);
    }
    if (segments.length === 0) {
        addSegment(pageUrl);
    } else if (pageUrl && !segments.some(segment => segment.includes(pageUrl))) {
        addSegment(pageUrl);
    }

    return {
        rawText: segments.join('\n\n').trim(),
        pageUrl: pageUrl || null,
        pageTitle: pageTitle || null,
        source,
        receivedAt: new Date().toISOString()
    };
}

function createJsonResponse(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(payload));
}

function readRequestBody(req, maxBytes = MAX_CAPTURE_BODY_BYTES) {
    return new Promise((resolve, reject) => {
        let body = '';
        let bytesRead = 0;

        req.on('data', chunk => {
            bytesRead += chunk.length;
            if (bytesRead > maxBytes) {
                reject(new Error(`Request body exceeds ${maxBytes} bytes`));
                req.destroy();
                return;
            }
            body += chunk.toString('utf8');
        });

        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function createCitationCaptureServer(options = {}) {
    const host = normalizeString(options.host) || DEFAULT_CAPTURE_HOST;
    const requestedPort = Number.isInteger(options.port) ? options.port : DEFAULT_CAPTURE_PORT;
    const onCapture = typeof options.onCapture === 'function' ? options.onCapture : () => {};
    const logger = options.logger || console;

    let server = null;
    let boundPort = requestedPort;

    async function handleCaptureRequest(req, res, requestUrl) {
        let payloadInput = parseQueryPayload(requestUrl);

        if (req.method === 'POST') {
            let bodyPayload = {};
            try {
                const rawBody = await readRequestBody(req);
                bodyPayload = parseBodyPayload(rawBody);
            } catch (error) {
                createJsonResponse(res, 413, {
                    success: false,
                    error: error.message
                });
                return;
            }
            payloadInput = { ...payloadInput, ...bodyPayload };
        }

        const payload = normalizeCapturePayload(payloadInput);
        if (!payload.rawText) {
            createJsonResponse(res, 400, {
                success: false,
                error: 'No citation text provided'
            });
            return;
        }

        const captureId = `capture-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

        try {
            await Promise.resolve(onCapture({ ...payload, captureId }));
            createJsonResponse(res, 200, {
                success: true,
                captureId,
                message: 'Citation capture received'
            });
        } catch (error) {
            logger.error('[Citation Capture Bridge] Capture callback failed:', error);
            createJsonResponse(res, 500, {
                success: false,
                error: error.message || 'Capture callback failed'
            });
        }
    }

    function requestHandler(req, res) {
        const method = req.method || 'GET';
        const requestUrl = new URL(req.url || '/', `http://${host}:${boundPort}`);

        if (method === 'OPTIONS') {
            createJsonResponse(res, 204, { success: true });
            return;
        }

        if (requestUrl.pathname === '/health') {
            createJsonResponse(res, 200, {
                success: true,
                service: 'citation-capture-bridge',
                host,
                port: boundPort
            });
            return;
        }

        if ((method === 'GET' || method === 'POST') && requestUrl.pathname === '/capture') {
            handleCaptureRequest(req, res, requestUrl);
            return;
        }

        createJsonResponse(res, 404, {
            success: false,
            error: 'Route not found'
        });
    }

    return {
        start() {
            if (server) {
                return Promise.resolve({ host, port: boundPort });
            }

            server = http.createServer(requestHandler);
            return new Promise((resolve, reject) => {
                server.once('error', (error) => {
                    server = null;
                    reject(error);
                });

                server.listen(requestedPort, host, () => {
                    const address = server.address();
                    if (address && typeof address === 'object') {
                        boundPort = address.port;
                    }
                    resolve({ host, port: boundPort });
                });
            });
        },

        stop() {
            return new Promise((resolve) => {
                if (!server) {
                    resolve();
                    return;
                }
                const activeServer = server;
                server = null;
                activeServer.close(() => resolve());
            });
        },

        isRunning() {
            return !!server;
        },

        getAddress() {
            return { host, port: boundPort };
        }
    };
}

module.exports = {
    DEFAULT_CAPTURE_HOST,
    DEFAULT_CAPTURE_PORT,
    parseQueryPayload,
    parseBodyPayload,
    normalizeCapturePayload,
    createCitationCaptureServer
};
