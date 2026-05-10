// === Research Feed Store ===
// SQLite-backed cache of feed items + per-source configuration.
// Keeps a normalized shape across arxiv/reddit/bluesky/mastodon/google/x.

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { createDebugLogger } = require('../ipc/logging');

const debug = createDebugLogger('FeedStore');

class FeedStore {
    constructor() {
        this.db = null;
        this.dbPath = null;
        this.isInitialized = false;
    }

    async initialize(userDataPath) {
        const dir = path.join(userDataPath, 'research-feed');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        this.dbPath = path.join(dir, 'feed.db');
        this.db = new sqlite3.Database(this.dbPath);
        await this.createTables();
        this.isInitialized = true;
        debug('Initialized at', this.dbPath);
    }

    async createTables() {
        // Run sequentially: indices reference the table, so the CREATE TABLE
        // must finish before the CREATE INDEX statements fire. Promise.all
        // does not guarantee order on a single sqlite3 Database handle.
        const stmts = [
            `CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                external_id TEXT NOT NULL,
                url TEXT,
                title TEXT,
                author TEXT,
                summary TEXT,
                published_at TEXT,
                fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
                tags_json TEXT,
                raw_json TEXT,
                relevance_score REAL,
                relevance_reason TEXT,
                relevance_scored_at TEXT,
                relevance_context_hash TEXT,
                dismissed INTEGER DEFAULT 0,
                saved INTEGER DEFAULT 0,
                UNIQUE(source_id, external_id)
            )`,
            `CREATE INDEX IF NOT EXISTS idx_items_source ON items(source_id)`,
            `CREATE INDEX IF NOT EXISTS idx_items_published ON items(published_at DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_items_score ON items(relevance_score DESC)`,
            `CREATE TABLE IF NOT EXISTS sources (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                config_json TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                interval_ms INTEGER DEFAULT 900000,
                last_fetched_at TEXT,
                last_error TEXT,
                last_error_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`
        ];
        for (const sql of stmts) {
            await this.run(sql);
        }
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // ------------ sources ------------

    async upsertSource({ id, type, config, enabled = true, intervalMs }) {
        const existing = await this.get('SELECT id FROM sources WHERE id = ?', [id]);
        const cfg = JSON.stringify(config || {});
        if (existing) {
            await this.run(
                `UPDATE sources SET type=?, config_json=?, enabled=?, interval_ms=COALESCE(?, interval_ms) WHERE id=?`,
                [type, cfg, enabled ? 1 : 0, intervalMs ?? null, id]
            );
        } else {
            await this.run(
                `INSERT INTO sources (id, type, config_json, enabled, interval_ms) VALUES (?, ?, ?, ?, ?)`,
                [id, type, cfg, enabled ? 1 : 0, intervalMs ?? 900000]
            );
        }
        return this.getSource(id);
    }

    async getSource(id) {
        const row = await this.get('SELECT * FROM sources WHERE id = ?', [id]);
        return row ? this._inflateSource(row) : null;
    }

    async listSources() {
        const rows = await this.all('SELECT * FROM sources ORDER BY id');
        return rows.map((r) => this._inflateSource(r));
    }

    async deleteSource(id) {
        await this.run('DELETE FROM items WHERE source_id = ?', [id]);
        await this.run('DELETE FROM sources WHERE id = ?', [id]);
    }

    async setSourceEnabled(id, enabled) {
        await this.run('UPDATE sources SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
    }

    async recordSourceFetch(id, errorMessage = null) {
        const now = new Date().toISOString();
        if (errorMessage) {
            await this.run(
                'UPDATE sources SET last_fetched_at=?, last_error=?, last_error_at=? WHERE id=?',
                [now, errorMessage, now, id]
            );
        } else {
            await this.run(
                'UPDATE sources SET last_fetched_at=?, last_error=NULL, last_error_at=NULL WHERE id=?',
                [now, id]
            );
        }
    }

    _inflateSource(row) {
        let config = {};
        try { config = JSON.parse(row.config_json || '{}'); } catch (_) { /* ignore */ }
        return {
            id: row.id,
            type: row.type,
            config,
            enabled: row.enabled === 1,
            intervalMs: row.interval_ms,
            lastFetchedAt: row.last_fetched_at,
            lastError: row.last_error,
            lastErrorAt: row.last_error_at
        };
    }

    // ------------ items ------------

    async insertItems(sourceId, items) {
        if (!items || items.length === 0) return { inserted: 0 };
        let inserted = 0;
        for (const item of items) {
            const externalId = item.id || item.url;
            if (!externalId) continue;
            try {
                const result = await this.run(
                    `INSERT OR IGNORE INTO items
                     (source_id, external_id, url, title, author, summary, published_at, tags_json, raw_json)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        sourceId,
                        externalId,
                        item.url || null,
                        item.title || null,
                        item.author || null,
                        item.summary || null,
                        item.publishedAt || null,
                        JSON.stringify(item.tags || []),
                        JSON.stringify(item.raw || {})
                    ]
                );
                if (result.changes > 0) inserted++;
            } catch (err) {
                console.warn('[FeedStore] insertItem failed:', err.message);
            }
        }
        return { inserted };
    }

    async listItems({ sourceId, dismissed = false, saved, minScore, limit = 200, sort = 'recent' } = {}) {
        const where = [];
        const params = [];
        if (sourceId) { where.push('source_id = ?'); params.push(sourceId); }
        where.push(dismissed ? 'dismissed = 1' : 'dismissed = 0');
        if (saved === true) where.push('saved = 1');
        if (typeof minScore === 'number') {
            where.push('(relevance_score IS NULL OR relevance_score >= ?)');
            params.push(minScore);
        }
        const order = sort === 'score'
            ? 'COALESCE(relevance_score, -1) DESC, published_at DESC'
            : 'published_at DESC, fetched_at DESC';
        const sql = `SELECT * FROM items
                     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY ${order} LIMIT ?`;
        params.push(limit);
        const rows = await this.all(sql, params);
        return rows.map((r) => this._inflateItem(r));
    }

    async getItem(id) {
        const row = await this.get('SELECT * FROM items WHERE id = ?', [id]);
        return row ? this._inflateItem(row) : null;
    }

    async dismissItem(id, dismissed = true) {
        await this.run('UPDATE items SET dismissed = ? WHERE id = ?', [dismissed ? 1 : 0, id]);
    }

    async markSaved(id, saved = true) {
        await this.run('UPDATE items SET saved = ? WHERE id = ?', [saved ? 1 : 0, id]);
    }

    async setRelevance(id, { score, reason, contextHash }) {
        await this.run(
            `UPDATE items
             SET relevance_score = ?, relevance_reason = ?,
                 relevance_scored_at = CURRENT_TIMESTAMP, relevance_context_hash = ?
             WHERE id = ?`,
            [score, reason || null, contextHash || null, id]
        );
    }

    async listUnscored({ contextHash, limit = 20 } = {}) {
        const sql = contextHash
            ? `SELECT * FROM items
               WHERE dismissed = 0
                 AND (relevance_score IS NULL OR relevance_context_hash IS NOT ? )
               ORDER BY published_at DESC LIMIT ?`
            : `SELECT * FROM items WHERE dismissed = 0 AND relevance_score IS NULL
               ORDER BY published_at DESC LIMIT ?`;
        const params = contextHash ? [contextHash, limit] : [limit];
        const rows = await this.all(sql, params);
        return rows.map((r) => this._inflateItem(r));
    }

    async pruneOlderThan(days) {
        const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
        const result = await this.run(
            'DELETE FROM items WHERE saved = 0 AND COALESCE(published_at, fetched_at) < ?',
            [cutoff]
        );
        return result.changes || 0;
    }

    _inflateItem(row) {
        let tags = [];
        let raw = {};
        try { tags = JSON.parse(row.tags_json || '[]'); } catch (_) { /* ignore */ }
        try { raw = JSON.parse(row.raw_json || '{}'); } catch (_) { /* ignore */ }
        return {
            id: row.id,
            sourceId: row.source_id,
            externalId: row.external_id,
            url: row.url,
            title: row.title,
            author: row.author,
            summary: row.summary,
            publishedAt: row.published_at,
            fetchedAt: row.fetched_at,
            tags,
            raw,
            relevance: row.relevance_score == null ? null : {
                score: row.relevance_score,
                reason: row.relevance_reason,
                scoredAt: row.relevance_scored_at,
                contextHash: row.relevance_context_hash
            },
            dismissed: row.dismissed === 1,
            saved: row.saved === 1
        };
    }

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
        }
    }
}

let singleton = null;
function getFeedStore() {
    if (!singleton) singleton = new FeedStore();
    return singleton;
}

module.exports = { FeedStore, getFeedStore };
