// === Credential Store ===
// Wraps Electron safeStorage so source adapters can persist API keys / OAuth
// tokens without ever putting them in plaintext on disk.
//
// On macOS this round-trips through Keychain Services. On Windows, DPAPI.
// On Linux, libsecret/kwallet — and if neither is available the platform
// falls back to a basic-encryption mode we surface to the caller via the
// `protected` flag so the UI can warn the user.

const path = require('path');
const fs = require('fs');

class CredentialStore {
    constructor() {
        this.baseDir = null;
        this.safeStorage = null;
    }

    async initialize(userDataPath) {
        // Lazy-require electron so this module is testable in plain Node.
        try {
            this.safeStorage = require('electron').safeStorage;
        } catch (_) {
            this.safeStorage = null;
        }
        this.baseDir = path.join(userDataPath, 'research-feed', 'credentials');
        if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
    }

    isAvailable() {
        return Boolean(this.safeStorage && this.safeStorage.isEncryptionAvailable());
    }

    /**
     * On Linux without libsecret/kwallet, Electron falls back to an in-memory
     * "basic" encryption that does not survive an OS keychain change. We
     * surface this so the UI can warn the user before they save real secrets.
     */
    backendInfo() {
        if (!this.safeStorage) return { available: false, backend: 'none' };
        if (typeof this.safeStorage.getSelectedStorageBackend === 'function') {
            const backend = this.safeStorage.getSelectedStorageBackend();
            const protectedBackend = backend !== 'basic_text' && backend !== 'unknown';
            return {
                available: this.safeStorage.isEncryptionAvailable(),
                backend,
                protected: protectedBackend
            };
        }
        return {
            available: this.safeStorage.isEncryptionAvailable(),
            backend: process.platform === 'darwin' ? 'keychain' :
                     process.platform === 'win32' ? 'dpapi' : 'unknown',
            protected: this.safeStorage.isEncryptionAvailable()
        };
    }

    _filePath(sourceId, name) {
        const safeSource = sourceId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.baseDir, `${safeSource}__${safeName}.bin`);
    }

    async set(sourceId, name, value) {
        if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) {
            throw new Error('Encryption is not available on this platform.');
        }
        const buf = this.safeStorage.encryptString(String(value));
        await fs.promises.writeFile(this._filePath(sourceId, name), buf);
    }

    async get(sourceId, name) {
        const fp = this._filePath(sourceId, name);
        if (!fs.existsSync(fp)) return null;
        if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) {
            return null;
        }
        const buf = await fs.promises.readFile(fp);
        try {
            return this.safeStorage.decryptString(buf);
        } catch (err) {
            console.warn('[CredentialStore] decrypt failed for', sourceId, name, err.message);
            return null;
        }
    }

    async delete(sourceId, name) {
        const fp = this._filePath(sourceId, name);
        if (fs.existsSync(fp)) await fs.promises.unlink(fp);
    }

    async list(sourceId) {
        if (!fs.existsSync(this.baseDir)) return [];
        const files = await fs.promises.readdir(this.baseDir);
        const prefix = sourceId.replace(/[^a-zA-Z0-9_-]/g, '_') + '__';
        return files
            .filter((f) => f.startsWith(prefix) && f.endsWith('.bin'))
            .map((f) => f.slice(prefix.length, -4));
    }
}

let singleton = null;
function getCredentialStore() {
    if (!singleton) singleton = new CredentialStore();
    return singleton;
}

module.exports = { CredentialStore, getCredentialStore };
