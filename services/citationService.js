// === Citation Management Service ===
// Handles local citation database and Zotero integration

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

class CitationService {
    constructor() {
        this.db = null;
        this.dbPath = null;
        this.isInitialized = false;
    }

    // Initialize the citation database
    async initialize(userDataPath) {
        try {
            // Create citations directory if it doesn't exist
            const citationsDir = path.join(userDataPath, 'citations');
            if (!fs.existsSync(citationsDir)) {
                fs.mkdirSync(citationsDir, { recursive: true });
            }

            this.dbPath = path.join(citationsDir, 'citations.db');
            
            // Open database connection
            this.db = new sqlite3.Database(this.dbPath);
            
            // Create tables
            await this.createTables();
            
            this.isInitialized = true;
            console.log('[Citation Service] Initialized successfully');
            
        } catch (error) {
            console.error('[Citation Service] Initialization failed:', error);
            throw error;
        }
    }

    // Create database tables
    async createTables() {
        return new Promise((resolve, reject) => {
            const tables = [
                // Main citations table
                `CREATE TABLE IF NOT EXISTS citations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    authors TEXT,
                    publication_year INTEGER,
                    publication_date TEXT,
                    journal TEXT,
                    volume TEXT,
                    issue TEXT,
                    pages TEXT,
                    publisher TEXT,
                    doi TEXT,
                    url TEXT,
                    file_path TEXT,
                    citation_type TEXT NOT NULL DEFAULT 'article',
                    abstract TEXT,
                    notes TEXT,
                    zotero_key TEXT UNIQUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_sync_at DATETIME,
                    source TEXT NOT NULL DEFAULT 'manual',
                    sync_version INTEGER DEFAULT 1,
                    tags TEXT,
                    is_favorite BOOLEAN DEFAULT FALSE,
                    read_status TEXT DEFAULT 'unread'
                )`,

                // Projects table for organizing citations
                `CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,

                // Junction table for citation-project relationships
                `CREATE TABLE IF NOT EXISTS citation_projects (
                    citation_id INTEGER,
                    project_id INTEGER,
                    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (citation_id, project_id),
                    FOREIGN KEY (citation_id) REFERENCES citations(id) ON DELETE CASCADE,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                )`,

                // Quick notes table
                `CREATE TABLE IF NOT EXISTS quick_notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    citation_id INTEGER,
                    content TEXT NOT NULL,
                    page_number TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (citation_id) REFERENCES citations(id) ON DELETE CASCADE
                )`,

                // Citation formats table for different output styles
                `CREATE TABLE IF NOT EXISTS citation_styles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    template TEXT NOT NULL,
                    description TEXT,
                    is_default BOOLEAN DEFAULT FALSE
                )`
            ];

            let completed = 0;
            tables.forEach((sql, index) => {
                this.db.run(sql, (err) => {
                    if (err) {
                        console.error(`[Citation Service] Error creating table ${index}:`, err);
                        reject(err);
                        return;
                    }
                    completed++;
                    if (completed === tables.length) {
                        // Run migrations for existing databases
                        this.runMigrations().then(() => {
                            this.insertDefaultStyles().then(() => {
                                resolve();
                            }).catch(reject);
                        }).catch(reject);
                    }
                });
            });
        });
    }

    // Run database migrations for new fields
    async runMigrations() {
        try {
            console.log('[Citation Service] Running database migrations...');
            
            // Migration 1: Add source tracking fields
            const migrations = [
                'ALTER TABLE citations ADD COLUMN last_modified_at DATETIME',
                'ALTER TABLE citations ADD COLUMN last_sync_at DATETIME',
                'ALTER TABLE citations ADD COLUMN source TEXT DEFAULT "manual"',
                'ALTER TABLE citations ADD COLUMN sync_version INTEGER DEFAULT 1'
            ];

            for (const migration of migrations) {
                await new Promise((resolve, reject) => {
                    this.db.run(migration, (err) => {
                        if (err) {
                            // Ignore "duplicate column" errors for existing databases
                            if (err.message.includes('duplicate column name')) {
                                console.log(`[Citation Service] Migration skipped (column exists): ${migration}`);
                                resolve();
                            } else {
                                console.error('[Citation Service] Migration error:', err);
                                reject(err);
                            }
                        } else {
                            console.log(`[Citation Service] Migration completed: ${migration}`);
                            resolve();
                        }
                    });
                });
            }

            // Set default values for existing citations
            await new Promise((resolve, reject) => {
                this.db.run(`UPDATE citations SET 
                    source = COALESCE(source, 'manual'),
                    last_modified_at = COALESCE(last_modified_at, updated_at, CURRENT_TIMESTAMP),
                    sync_version = COALESCE(sync_version, 1)
                    WHERE source IS NULL OR source = '' OR last_modified_at IS NULL`, (err) => {
                    if (err) {
                        console.error('[Citation Service] Error setting default values:', err);
                        reject(err);
                    } else {
                        console.log('[Citation Service] Set default values for existing citations');
                        resolve();
                    }
                });
            });

            console.log('[Citation Service] All migrations completed successfully');
            
        } catch (error) {
            console.error('[Citation Service] Migration failed:', error);
            throw error;
        }
    }

    // Insert default citation styles
    async insertDefaultStyles() {
        const defaultStyles = [
            {
                name: 'APA',
                template: '{authors} ({year}). {title}. {journal}, {volume}({issue}), {pages}. {doi}',
                description: 'American Psychological Association style',
                is_default: true
            },
            {
                name: 'MLA',
                template: '{authors}. "{title}." {journal}, vol. {volume}, no. {issue}, {year}, pp. {pages}.',
                description: 'Modern Language Association style',
                is_default: false
            },
            {
                name: 'Chicago',
                template: '{authors}. "{title}." {journal} {volume}, no. {issue} ({year}): {pages}.',
                description: 'Chicago Manual of Style',
                is_default: false
            }
        ];

        for (const style of defaultStyles) {
            await this.addCitationStyle(style);
        }
    }

    // ===== CITATION CRUD OPERATIONS =====

    // Add a new citation
    async addCitation(citationData) {
        try {
            console.log('[Citation Service] Adding citation:', citationData);
            
            // Check for existing citation to prevent duplicates
            const existing = await this.findExistingCitation(citationData);
            if (existing) {
                console.log(`[Citation Service] Citation already exists: ${citationData.title}`);

                const updates = {};
                const preferNewValue = (field, options = {}) => {
                    const newValue = citationData[field];
                    if (newValue === undefined || newValue === null || newValue === '') {
                        return;
                    }

                    const existingValue = existing[field];
                    const { replaceIfPlaceholder = false, placeholderValues = [] } = options;
                    const normalizedExisting = typeof existingValue === 'string'
                        ? existingValue.trim().toLowerCase()
                        : existingValue;
                    const normalizedPlaceholders = placeholderValues
                        .map(value => typeof value === 'string' ? value.trim().toLowerCase() : value)
                        .filter(value => value !== undefined && value !== null && value !== '');

                    const isPlaceholder = replaceIfPlaceholder &&
                        normalizedPlaceholders.includes(normalizedExisting);

                    if (!existingValue || isPlaceholder) {
                        updates[field] = newValue;
                    }
                };

                preferNewValue('title', {
                    replaceIfPlaceholder: true,
                    placeholderValues: ['Web Page', 'Untitled citation', existing?.url || '']
                });
                preferNewValue('authors');
                preferNewValue('publication_year');
                preferNewValue('publication_date');
                preferNewValue('journal');
                preferNewValue('volume');
                preferNewValue('issue');
                preferNewValue('pages');
                preferNewValue('publisher');
                preferNewValue('doi');
                preferNewValue('url');
                preferNewValue('file_path');
                preferNewValue('abstract');
                preferNewValue('notes');
                preferNewValue('tags');
                preferNewValue('citation_type');

                if (citationData.source && (!existing.source || existing.source === 'manual')) {
                    updates.source = citationData.source;
                }

                if (Object.keys(updates).length > 0) {
                    await this.updateCitation(existing.id, updates);
                    return { ...existing, ...updates };
                }

                return existing; // Return existing instead of creating duplicate
            }

            const {
                title, authors, publication_year, publication_date, journal,
                volume, issue, pages, publisher, doi, url, file_path,
                citation_type = 'article', abstract, notes, tags, zotero_key,
                source = 'manual'
            } = citationData;

            // Wrap the database operation in a Promise
            return new Promise((resolve, reject) => {
                const sql = `
                    INSERT INTO citations (
                        title, authors, publication_year, publication_date, journal,
                        volume, issue, pages, publisher, doi, url, file_path,
                        citation_type, abstract, notes, tags, zotero_key,
                        source, last_modified_at, sync_version
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
                `;

                const params = [
                    title, authors, publication_year, publication_date, journal,
                    volume, issue, pages, publisher, doi, url, file_path,
                    citation_type, abstract, notes, tags, zotero_key, source
                ];

                console.log('[Citation Service] Executing SQL with params:', params);

                this.db.run(sql, params, function(err) {
                    if (err) {
                        console.error('[Citation Service] Error adding citation:', err);
                        reject(err);
                    } else {
                        console.log('[Citation Service] Citation added with ID:', this.lastID);
                        resolve({ id: this.lastID, ...citationData });
                    }
                });
            });
        } catch (err) {
            console.error('[Citation Service] Error in addCitation:', err);
            throw err;
        }
    }

    // Get all citations with optional filtering
    async getCitations(filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM citations WHERE 1=1';
            const params = [];

            // Apply filters
            if (filters.search) {
                sql += ' AND (title LIKE ? OR authors LIKE ? OR journal LIKE ?)';
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            if (filters.type) {
                sql += ' AND citation_type = ?';
                params.push(filters.type);
            }

            if (filters.tags) {
                sql += ' AND tags LIKE ?';
                params.push(`%${filters.tags}%`);
            }

            if (filters.project_id) {
                sql = `
                    SELECT c.* FROM citations c
                    JOIN citation_projects cp ON c.id = cp.citation_id
                    WHERE cp.project_id = ?
                `;
                params.unshift(filters.project_id);
            }

            // Add ordering
            sql += ' ORDER BY updated_at DESC';

            if (filters.limit) {
                sql += ' LIMIT ?';
                params.push(filters.limit);
            }

            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('[Citation Service] Error fetching citations:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get citation by ID
    async getCitationById(id) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM citations WHERE id = ?', [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Update citation
    async updateCitation(id, updates) {
        return new Promise((resolve, reject) => {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const params = [...Object.values(updates), id];
            
            const sql = `UPDATE citations SET ${setClause}, updated_at = CURRENT_TIMESTAMP, last_modified_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1 WHERE id = ?`;

            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('[Citation Service] Error updating citation:', err);
                    reject(err);
                } else {
                    resolve({ id, changes: this.changes });
                }
            });
        });
    }

    // Delete citation
    async deleteCitation(id) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM citations WHERE id = ?', [id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id, deleted: this.changes > 0 });
                }
            });
        });
    }

    // ===== PROJECT OPERATIONS =====

    async addProject(name, description = '') {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT INTO projects (name, description) VALUES (?, ?)';
            this.db.run(sql, [name, description], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, name, description });
                }
            });
        });
    }

    async getProjects() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM projects ORDER BY name', (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // ===== CITATION FORMATTING =====

    async formatCitation(citationId, styleName = 'APA') {
        try {
            const citation = await this.getCitationById(citationId);
            if (!citation) throw new Error('Citation not found');

            const style = await this.getCitationStyle(styleName);
            if (!style) throw new Error('Citation style not found');

            return this.applyCitationStyle(citation, style);
        } catch (error) {
            console.error('[Citation Service] Error formatting citation:', error);
            throw error;
        }
    }

    applyCitationStyle(citation, style) {
        let formatted = style.template;
        
        // Replace template variables
        const replacements = {
            '{authors}': citation.authors || 'Unknown Author',
            '{year}': citation.publication_year || 'n.d.',
            '{title}': citation.title,
            '{journal}': citation.journal || '',
            '{volume}': citation.volume || '',
            '{issue}': citation.issue || '',
            '{pages}': citation.pages || '',
            '{publisher}': citation.publisher || '',
            '{doi}': citation.doi ? `https://doi.org/${citation.doi}` : '',
            '{url}': citation.url || ''
        };

        Object.entries(replacements).forEach(([placeholder, value]) => {
            formatted = formatted.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        });

        // Clean up extra spaces and punctuation
        formatted = formatted.replace(/\s+/g, ' ')
                           .replace(/\s*,\s*,/g, ',')
                           .replace(/\s*\.\s*\./g, '.')
                           .replace(/,\s*\./g, '.')
                           .trim();

        return formatted;
    }

    // ===== CITATION STYLES =====

    async addCitationStyle(style) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR IGNORE INTO citation_styles (name, template, description, is_default)
                VALUES (?, ?, ?, ?)
            `;
            this.db.run(sql, [style.name, style.template, style.description, style.is_default], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, ...style });
                }
            });
        });
    }

    async getCitationStyle(name) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM citation_styles WHERE name = ?', [name], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // ===== SYNC CONFLICT RESOLUTION =====

    /**
     * Resolve sync conflicts between local and external sources
     * Strategy: Most recent modification wins (last-write-wins)
     */
    async resolveSyncConflict(localCitation, externalCitation, externalSource) {
        console.log(`[Citation Service] Resolving sync conflict for citation "${localCitation.title}"`);
        
        const localModTime = new Date(localCitation.last_modified_at || localCitation.updated_at);
        const externalModTime = new Date(externalCitation.dateModified || externalCitation.updated_at || new Date());
        
        console.log(`[Citation Service] Local modified: ${localModTime}, External modified: ${externalModTime}`);
        
        // Determine which version wins
        if (externalModTime > localModTime) {
            console.log(`[Citation Service] External version is newer - updating local citation`);
            return {
                action: 'update_local',
                winner: 'external',
                data: {
                    ...externalCitation,
                    source: externalSource,
                    last_sync_at: new Date().toISOString(),
                    sync_version: (localCitation.sync_version || 1) + 1
                }
            };
        } else {
            console.log(`[Citation Service] Local version is newer - will push to external`);
            return {
                action: 'update_external', 
                winner: 'local',
                data: localCitation
            };
        }
    }

    /**
     * Smart sync method that handles conflicts
     */
    async smartSync(citations, externalSource = 'zotero') {
        const results = {
            conflicts_resolved: 0,
            local_updated: 0,
            external_updated: 0,
            added_to_local: 0,
            added_to_external: 0,
            errors: []
        };

        for (const externalCitation of citations) {
            try {
                // Find existing citation by zotero_key or DOI/title match
                const existing = await this.findExistingCitation(externalCitation);
                
                if (existing) {
                    // Conflict resolution needed
                    const resolution = await this.resolveSyncConflict(existing, externalCitation, externalSource);
                    results.conflicts_resolved++;
                    
                    if (resolution.action === 'update_local') {
                        await this.updateCitation(existing.id, resolution.data);
                        results.local_updated++;
                        console.log(`[Citation Service] Updated local citation: ${existing.title}`);
                    } else if (resolution.action === 'update_external') {
                        // Mark for external update (caller handles this)
                        results.external_updated++;
                        console.log(`[Citation Service] Local version newer, external should be updated: ${existing.title}`);
                    }
                } else {
                    // Add new citation from external source
                    await this.addCitation({
                        ...externalCitation,
                        source: externalSource,
                        last_sync_at: new Date().toISOString()
                    });
                    results.added_to_local++;
                    console.log(`[Citation Service] Added new citation from ${externalSource}: ${externalCitation.title}`);
                }
            } catch (error) {
                console.error(`[Citation Service] Error processing citation:`, error);
                results.errors.push({
                    citation: externalCitation.title || 'Unknown',
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Find existing citation by multiple matching strategies
     */
    async findExistingCitation(externalCitation) {
        // Strategy 1: Match by zotero_key
        if (externalCitation.zotero_key) {
            const byZoteroKey = await this.getCitationByField('zotero_key', externalCitation.zotero_key);
            if (byZoteroKey) return byZoteroKey;
        }

        // Strategy 2: Match by DOI
        if (externalCitation.doi) {
            const byDOI = await this.getCitationByField('doi', externalCitation.doi);
            if (byDOI) return byDOI;
        }

        // Strategy 3: Match by title + authors (fuzzy)
        if (externalCitation.title) {
            const byTitle = await this.getCitationByTitleAndAuthors(
                externalCitation.title, 
                externalCitation.authors
            );
            if (byTitle) return byTitle;
        }

        return null;
    }

    /**
     * Get citation by field value
     */
    async getCitationByField(field, value) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM citations WHERE ${field} = ? LIMIT 1`,
                [value],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || null);
                }
            );
        });
    }

    /**
     * Get citation by title and authors (fuzzy matching)
     */
    async getCitationByTitleAndAuthors(title, authors) {
        return new Promise((resolve, reject) => {
            // First try exact title match
            this.db.get(
                'SELECT * FROM citations WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) LIMIT 1',
                [title],
                (err, exactMatch) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (exactMatch) {
                        resolve(exactMatch);
                        return;
                    }
                    
                    // If no exact match, try fuzzy matching with higher threshold
                    const normalizedTitle = title.toLowerCase().trim();
                    
                    this.db.all(
                        'SELECT * FROM citations WHERE LOWER(title) LIKE ?',
                        [`%${normalizedTitle.substring(0, 50)}%`],
                        (err, rows) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            // Find best match with stricter criteria
                            let bestMatch = null;
                            let bestScore = 0;
                            
                            for (const row of rows) {
                                const score = this.calculateSimilarity(normalizedTitle, row.title.toLowerCase());
                                if (score > 0.85 && score > bestScore) { // Increased threshold to 85%
                                    bestMatch = row;
                                    bestScore = score;
                                }
                            }
                            
                            resolve(bestMatch);
                        }
                    );
                }
            );
        });
    }

    /**
     * Calculate string similarity (simple Jaccard similarity)
     */
    calculateSimilarity(str1, str2) {
        const words1 = new Set(str1.split(/\s+/));
        const words2 = new Set(str2.split(/\s+/));
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        return intersection.size / union.size;
    }

    // ===== ZOTERO INTEGRATION =====

    async syncWithZotero(zoteroAPIKey, userID, collectionID = null, lastSyncTime = null) {
        try {
            console.log('[Citation Service] Starting Zotero sync...');
            console.log('[Citation Service] User ID:', userID);
            console.log('[Citation Service] Collection ID:', collectionID || 'None (syncing entire library)');
            console.log('[Citation Service] Last sync time:', lastSyncTime || 'None (full sync)');
            
            const axios = require('axios');
            let apiUrl = `https://api.zotero.org/users/${userID}/items`;
            
            // If collection ID is provided, sync specific collection
            if (collectionID) {
                apiUrl = `https://api.zotero.org/users/${userID}/collections/${collectionID}/items`;
            }

            // Add query parameters
            const params = new URLSearchParams();
            params.append('format', 'json');
            
            // If we have a last sync time, only get items modified since then
            if (lastSyncTime) {
                // Convert ISO timestamp to Zotero API format (Unix timestamp)
                const sinceTimestamp = Math.floor(new Date(lastSyncTime).getTime() / 1000);
                params.append('since', sinceTimestamp.toString());
            }
            
            apiUrl += '?' + params.toString();
            console.log('[Citation Service] API URL:', apiUrl);

            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${zoteroAPIKey}`,
                    'Zotero-API-Version': '3'
                },
                timeout: 30000
            });

            const zoteroItems = response.data;
            console.log(`[Citation Service] Retrieved ${zoteroItems.length} items from Zotero API`);

            // Debug: show modification dates of all items (or first 5)
            if (zoteroItems.length > 0) {
                console.log('[Citation Service] DEBUG: Item modification dates:');
                zoteroItems.slice(0, 5).forEach((item, index) => {
                    if (item.data) {
                        console.log(`[Citation Service] DEBUG: Item ${index + 1}: "${item.data.title?.substring(0, 40)}..." modified: ${item.data.dateModified} version: ${item.version}`);
                    }
                });
                if (zoteroItems.length > 5) {
                    console.log(`[Citation Service] DEBUG: ... and ${zoteroItems.length - 5} more items`);
                }
            }

            let syncedCount = 0;
            let updatedCount = 0;

            for (const item of zoteroItems) {
                const data = item.data;
                
                // Skip items without titles
                if (!data.title) {
                    console.log(`[Citation Service] Skipping item without title: ${item.key}`);
                    continue;
                }
                
                console.log(`[Citation Service] Processing item: ${data.title} (${item.key})`);

                // Map Zotero item to our citation format
                const citationData = {
                    title: data.title,
                    authors: this.formatZoteroAuthors(data.creators),
                    publication_year: data.date ? this.extractYearFromDate(data.date) : null,
                    publication_date: data.date || null,
                    journal: data.publicationTitle || data.journalAbbreviation || null,
                    volume: data.volume || null,
                    issue: data.issue || null,
                    pages: data.pages || null,
                    publisher: data.publisher || null,
                    doi: data.DOI || null,
                    url: data.url || null,
                    citation_type: this.mapZoteroItemType(data.itemType),
                    abstract: data.abstractNote || null,
                    notes: data.extra || null,
                    tags: data.tags ? data.tags.map(tag => tag.tag).join(', ') : null,
                    zotero_key: item.key,
                    source: 'zotero'
                };

                // Check if citation already exists
                const existing = await this.getCitationByZoteroKey(item.key);
                
                if (existing) {
                    // Update existing citation
                    console.log(`[Citation Service] Updating existing citation: ${data.title}`);
                    await this.updateCitation(existing.id, citationData);
                    updatedCount++;
                } else {
                    // Add new citation
                    console.log(`[Citation Service] Adding new citation: ${data.title}`);
                    await this.addCitation(citationData);
                    syncedCount++;
                }
            }

            console.log(`[Citation Service] Zotero sync completed: ${syncedCount} new, ${updatedCount} updated`);
            return { 
                success: true, 
                synced: syncedCount, 
                updated: updatedCount, 
                total: zoteroItems.length 
            };

        } catch (error) {
            console.error('[Citation Service] Zotero sync failed:', error);
            
            let errorMessage = 'Zotero sync failed: ';
            
            if (error.response) {
                // HTTP error response from Zotero API
                const status = error.response.status;
                const data = error.response.data;
                
                console.error('[Citation Service] HTTP Status:', status);
                console.error('[Citation Service] Response data:', data);
                
                switch (status) {
                    case 400:
                        errorMessage += 'Invalid request. Please check your User ID and Collection ID (if specified).';
                        break;
                    case 403:
                        errorMessage += 'Access forbidden. Please check your API key permissions.';
                        break;
                    case 404:
                        errorMessage += 'User or collection not found. Please verify your User ID and Collection ID.';
                        break;
                    default:
                        errorMessage += `HTTP ${status} error from Zotero API.`;
                }
            } else if (error.code === 'ECONNABORTED') {
                errorMessage += 'Request timeout. Please check your internet connection.';
            } else {
                errorMessage += error.message;
            }
            
            throw new Error(errorMessage);
        }
    }

    // Get citation by Zotero key
    async getCitationByZoteroKey(zoteroKey) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM citations WHERE zotero_key = ?', [zoteroKey], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Format Zotero authors array to string
    formatZoteroAuthors(creators) {
        if (!creators || !Array.isArray(creators)) return '';
        
        const authors = creators
            .filter(creator => creator.creatorType === 'author' || creator.creatorType === 'editor')
            .map(creator => {
                if (creator.firstName && creator.lastName) {
                    return `${creator.firstName} ${creator.lastName}`;
                } else if (creator.lastName) {
                    return creator.lastName;
                } else if (creator.name) {
                    return creator.name;
                }
                return '';
            })
            .filter(name => name);
            
        return authors.join(', ');
    }

    // Extract year from various date formats
    extractYearFromDate(dateString) {
        if (!dateString) return null;
        
        const yearMatch = dateString.match(/\b(\d{4})\b/);
        return yearMatch ? parseInt(yearMatch[1]) : null;
    }

    // Map Zotero item types to our citation types
    mapZoteroItemType(zoteroType) {
        const typeMap = {
            'journalArticle': 'article',
            'book': 'book',
            'bookSection': 'book',
            'conferencePaper': 'conference',
            'webpage': 'webpage',
            'report': 'report',
            'thesis': 'thesis',
            'manuscript': 'article',
            'magazineArticle': 'article',
            'newspaperArticle': 'article'
        };
        
        return typeMap[zoteroType] || 'article';
    }

    // Fetch collections from Zotero
    async fetchZoteroCollections(zoteroAPIKey, userID) {
        console.log('[Citation Service] Fetching Zotero collections...');
        
        try {
            const axios = require('axios');
            const apiUrl = `https://api.zotero.org/users/${userID}/collections`;
            
            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${zoteroAPIKey}`,
                    'Zotero-API-Version': '3'
                },
                timeout: 15000
            });

            const collections = response.data.map(collection => ({
                key: collection.key,
                name: collection.data.name,
                parentCollection: collection.data.parentCollection || null,
                itemCount: collection.meta.numItems || 0
            }));

            console.log(`[Citation Service] Found ${collections.length} collections`);
            return { success: true, collections };
            
        } catch (error) {
            console.error('[Citation Service] Failed to fetch Zotero collections:', error);
            
            let errorMessage = 'Failed to fetch Zotero collections: ';
            if (error.response) {
                const status = error.response.status;
                switch (status) {
                    case 403:
                        errorMessage += 'Access denied. Please check your API key permissions.';
                        break;
                    case 404:
                        errorMessage += 'User not found. Please verify your User ID.';
                        break;
                    default:
                        errorMessage += `HTTP ${status} error from Zotero API.`;
                }
            } else if (error.code === 'ECONNABORTED') {
                errorMessage += 'Request timeout. Please check your internet connection.';
            } else {
                errorMessage += error.message;
            }
            
            return { success: false, error: errorMessage };
        }
    }

    // ===== UTILITY METHODS =====

    async getStatistics() {
        return new Promise((resolve, reject) => {
            const queries = {
                total: 'SELECT COUNT(*) as count FROM citations',
                byType: 'SELECT citation_type, COUNT(*) as count FROM citations GROUP BY citation_type',
                recent: 'SELECT COUNT(*) as count FROM citations WHERE created_at > datetime("now", "-30 days")'
            };

            const results = {};
            let completed = 0;

            Object.entries(queries).forEach(([key, sql]) => {
                this.db.all(sql, (err, rows) => {
                    if (err) {
                        console.error(`[Citation Service] Error in query ${key}:`, err);
                        results[key] = key === 'total' ? { count: 0 } : [];
                    } else {
                        results[key] = key === 'total' || key === 'recent' ? rows[0] : rows;
                    }
                    
                    completed++;
                    if (completed === Object.keys(queries).length) {
                        resolve(results);
                    }
                });
            });
        });
    }

    // Export citations to Zotero
    async exportToZotero(citationIds, zoteroAPIKey, userID, collectionID = null) {
        console.log('[Citation Service] Starting export to Zotero...', { citationIds, collectionID });
        
        try {
            const axios = require('axios');
            const citations = await this.getCitations({ ids: citationIds });
            
            if (!citations || citations.length === 0) {
                throw new Error('No citations found to export');
            }

            let exportedCount = 0;
            const errors = [];

            for (const citation of citations) {
                try {
                    const zoteroItem = this.convertToZoteroFormat(citation);
                    
                    // Create item in Zotero
                    let apiUrl = `https://api.zotero.org/users/${userID}/items`;
                    console.log(`[Citation Service] Sending to Zotero:`, JSON.stringify(zoteroItem, null, 2));
                    
                    const response = await axios.post(apiUrl, [zoteroItem], {
                        headers: {
                            'Authorization': `Bearer ${zoteroAPIKey}`,
                            'Content-Type': 'application/json',
                            'Zotero-API-Version': '3'
                        },
                        timeout: 30000
                    });

                    console.log(`[Citation Service] Zotero response status: ${response.status}`, response.data);

                    // Check for successful creation (201 for created, 200 for modified)
                    if ((response.status === 200 || response.status === 201) && response.data && response.data.successful) {
                        // Get the first successful item - Zotero returns an object with numeric keys
                        const successfulKeys = Object.keys(response.data.successful);
                        if (successfulKeys.length > 0) {
                            const firstSuccessKey = successfulKeys[0];
                            const createdItemKey = response.data.success[firstSuccessKey]; // Use the success object for the key
                            console.log(`[Citation Service] Created Zotero item with key: ${createdItemKey}`);
                            
                            // If collection specified, add to collection
                            if (collectionID) {
                                try {
                                    await this.addItemToZoteroCollection(createdItemKey, collectionID, zoteroAPIKey, userID);
                                    console.log(`[Citation Service] Added item to collection ${collectionID}`);
                                } catch (collectionError) {
                                    console.error(`[Citation Service] Failed to add item to collection:`, collectionError.message);
                                }
                            }
                            
                            // Update local citation with Zotero key and sync info
                            await this.updateCitation(citation.id, {
                                zotero_key: createdItemKey,
                                last_sync_at: new Date().toISOString()
                            });
                            
                            exportedCount++;
                            console.log(`[Citation Service] Successfully exported citation: ${citation.title}`);
                        } else {
                            throw new Error(`No successful items in response: ${JSON.stringify(response.data)}`);
                        }
                    } else {
                        throw new Error(`Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`);
                    }

                } catch (error) {
                    console.error(`[Citation Service] Failed to export citation "${citation.title}":`, error.message);
                    errors.push({ title: citation.title, error: error.message });
                }
            }

            return {
                success: true,
                exportedCount,
                totalRequested: citations.length,
                errors
            };

        } catch (error) {
            console.error('[Citation Service] Export to Zotero failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Add item to Zotero collection
    async addItemToZoteroCollection(itemKey, collectionID, zoteroAPIKey, userID) {
        const axios = require('axios');
        console.log(`[Citation Service] Adding item ${itemKey} to collection ${collectionID}`);
        
        // Get the current item to update its collections
        const getItemUrl = `https://api.zotero.org/users/${userID}/items/${itemKey}`;
        const getResponse = await axios.get(getItemUrl, {
            headers: {
                'Authorization': `Bearer ${zoteroAPIKey}`,
                'Zotero-API-Version': '3'
            }
        });
        
        const item = getResponse.data;
        if (!item.data.collections) {
            item.data.collections = [];
        }
        
        // Add collection if not already present
        if (!item.data.collections.includes(collectionID)) {
            item.data.collections.push(collectionID);
            
            // Update the item with the new collections
            const updateUrl = `https://api.zotero.org/users/${userID}/items/${itemKey}`;
            await axios.put(updateUrl, item, {
                headers: {
                    'Authorization': `Bearer ${zoteroAPIKey}`,
                    'Content-Type': 'application/json',
                    'Zotero-API-Version': '3',
                    'If-Unmodified-Since-Version': item.version.toString()
                }
            });
            
            console.log(`[Citation Service] Successfully added item to collection`);
        } else {
            console.log(`[Citation Service] Item already in collection`);
        }
    }

    // Convert our citation format to Zotero item format
    convertToZoteroFormat(citation) {
        const creators = [];
        
        // Parse authors
        if (citation.authors) {
            const authorList = citation.authors.split(',').map(a => a.trim());
            authorList.forEach(author => {
                const parts = author.split(' ');
                if (parts.length >= 2) {
                    creators.push({
                        creatorType: 'author',
                        firstName: parts.slice(0, -1).join(' '),
                        lastName: parts[parts.length - 1]
                    });
                } else {
                    creators.push({
                        creatorType: 'author',
                        name: author
                    });
                }
            });
        }

        const zoteroItem = {
            itemType: this.mapCitationTypeToZotero(citation.citation_type) || 'journalArticle',
            title: citation.title || '',
            creators,
            abstractNote: citation.abstract || '',
            publicationTitle: citation.journal || '',
            volume: citation.volume || '',
            issue: citation.issue || '',
            pages: citation.pages || '',
            date: citation.publication_date || citation.publication_year || '',
            DOI: citation.doi || '',
            url: citation.url || '',
            extra: citation.notes || '',
            publisher: citation.publisher || ''
        };

        // Remove empty fields
        Object.keys(zoteroItem).forEach(key => {
            if (zoteroItem[key] === '' || zoteroItem[key] === null) {
                delete zoteroItem[key];
            }
        });

        return zoteroItem;
    }

    // Map our citation types to Zotero item types
    mapCitationTypeToZotero(citationType) {
        const typeMap = {
            'journal': 'journalArticle',
            'book': 'book',
            'chapter': 'bookSection',
            'conference': 'conferencePaper',
            'thesis': 'thesis',
            'website': 'webpage',
            'report': 'report',
            'other': 'document'
        };
        return typeMap[citationType] || 'journalArticle';
    }

    // Live sync with Zotero - compare timestamps and sync changes both ways
    async liveSyncWithZotero(zoteroAPIKey, userID, collectionID = null, lastSyncTime = null) {
        console.log('[Citation Service] Starting live sync with Zotero...');
        console.log(`[Citation Service] Parameters: userID=${userID}, collectionID=${collectionID}, lastSyncTime=${lastSyncTime}`);
        
        try {
            const syncResults = {
                importedFromZotero: 0,
                exportedToZotero: 0,
                conflicts: [],
                errors: []
            };

            // Check if database is empty - if so, force full sync
            const allCitations = await this.getCitations({});
            console.log(`[Citation Service] Current database has ${allCitations.length} citations`);
            
            let effectiveLastSyncTime = lastSyncTime;
            if (allCitations.length === 0) {
                console.log('[Citation Service] Database is empty, forcing full sync (ignoring lastSyncTime)');
                effectiveLastSyncTime = null;
            }

            // Step 1: Import from Zotero (items modified since last sync)
            console.log('[Citation Service] Step 1: Importing from Zotero...');
            const zoteroSyncResult = await this.syncWithZotero(zoteroAPIKey, userID, collectionID, effectiveLastSyncTime);
            if (zoteroSyncResult.success) {
                syncResults.importedFromZotero = zoteroSyncResult.synced || 0;
                console.log(`[Citation Service] Imported ${syncResults.importedFromZotero} items from Zotero`);
            }

            // Step 2: Export local changes to Zotero (BEFORE updating sync time)
            console.log('[Citation Service] Step 2: Getting local changes...');
            const localChanges = await this.getLocalChangesAfter(lastSyncTime);
            console.log(`[Citation Service] Found ${localChanges.length} local changes to export`);
            
            if (localChanges.length > 0) {
                console.log('[Citation Service] Step 3: Exporting to Zotero...');
                const exportResult = await this.exportToZotero(
                    localChanges.map(c => c.id), 
                    zoteroAPIKey, 
                    userID, 
                    collectionID
                );
                if (exportResult.success) {
                    syncResults.exportedToZotero = exportResult.exportedCount;
                    syncResults.errors = exportResult.errors;
                    console.log(`[Citation Service] Successfully exported ${exportResult.exportedCount} citations to Zotero`);
                } else {
                    console.error('[Citation Service] Failed to export to Zotero:', exportResult.error);
                    syncResults.errors.push(exportResult.error);
                }
            } else {
                console.log('[Citation Service] No local changes to export');
            }

            // Update last sync timestamp AFTER both import and export are complete
            // Use a very conservative timestamp (1 hour ago) to avoid missing items due to timing/timezone issues
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const conservativeTime = oneHourAgo.toISOString();
            await this.updateLastSyncTime(conservativeTime);
            console.log(`[Citation Service] Set conservative sync time to ${conservativeTime} (1 hour ago)`);
            const currentTime = new Date().toISOString(); // Keep for return value

            return {
                success: true,
                ...syncResults,
                lastSyncTime: currentTime
            };

        } catch (error) {
            console.error('[Citation Service] Live sync failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get local changes after a specific timestamp
    async getLocalChangesAfter(timestamp) {
        return new Promise((resolve, reject) => {
            let sql, params;

            if (!timestamp) {
                // If no timestamp, return citations that haven't been synced yet
                // (citations without zotero_key or with source != 'zotero')
                sql = `
                    SELECT * FROM citations 
                    WHERE (zotero_key IS NULL OR zotero_key = '') 
                    AND (source IS NULL OR source != 'zotero')
                    ORDER BY COALESCE(last_modified_at, updated_at) DESC
                `;
                params = [];
                console.log(`[Citation Service] Searching for unsynced citations with SQL: ${sql}`);
            } else {
                // Return citations modified after the timestamp
                sql = `
                    SELECT * FROM citations 
                    WHERE COALESCE(last_modified_at, updated_at) > ? 
                    AND (source IS NULL OR source != 'zotero')
                    ORDER BY COALESCE(last_modified_at, updated_at) DESC
                `;
                params = [timestamp];
                console.log(`[Citation Service] Searching for changes after ${timestamp} with SQL: ${sql}`);
            }
            
            // First, let's see all citations for debugging
            this.db.all('SELECT id, title, source, zotero_key, last_modified_at, updated_at FROM citations LIMIT 10', [], (err, allRows) => {
                if (!err) {
                    console.log(`[Citation Service] DEBUG: Sample of all citations in database:`, allRows.map(r => ({
                        id: r.id,
                        title: r.title?.substring(0, 50) + '...',
                        source: r.source,
                        zotero_key: r.zotero_key,
                        last_modified_at: r.last_modified_at,
                        updated_at: r.updated_at
                    })));
                }
            });
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('[Citation Service] Error getting local changes:', err);
                    reject(err);
                } else {
                    console.log(`[Citation Service] Found ${rows.length} local changes after ${timestamp || 'never'}`);
                    if (rows.length > 0) {
                        console.log(`[Citation Service] Sample local changes:`, rows.slice(0, 3).map(r => ({
                            id: r.id,
                            title: r.title?.substring(0, 50) + '...',
                            source: r.source,
                            zotero_key: r.zotero_key
                        })));
                    }
                    resolve(rows);
                }
            });
        });
    }

    // Update last sync timestamp in database
    async updateLastSyncTime(timestamp) {
        return new Promise((resolve, reject) => {
            // Create a simple key-value table for storing sync metadata
            const createSyncTable = `
                CREATE TABLE IF NOT EXISTS sync_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            `;
            
            this.db.run(createSyncTable, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const updateSql = `
                    INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) 
                    VALUES (?, ?, datetime('now'))
                `;
                
                this.db.run(updateSql, ['last_zotero_sync', timestamp], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    // Get last sync timestamp
    async getLastSyncTime() {
        return new Promise((resolve) => {
            const sql = `SELECT value FROM sync_metadata WHERE key = ?`;
            this.db.get(sql, ['last_zotero_sync'], (err, row) => {
                if (err || !row) {
                    resolve(null);
                } else {
                    resolve(row.value);
                }
            });
        });
    }

    // Execute raw SQL query (for advanced users/debugging)
    async executeRawSQL(sqlQuery) {
        return new Promise((resolve, reject) => {
            console.log(`[Citation Service] Executing raw SQL: ${sqlQuery}`);
            
            // Safety check - only allow SELECT statements for now
            const trimmedQuery = sqlQuery.trim().toLowerCase();
            if (!trimmedQuery.startsWith('select')) {
                reject(new Error('Only SELECT queries are allowed for security reasons'));
                return;
            }
            
            this.db.all(sqlQuery, [], (err, rows) => {
                if (err) {
                    console.error('[Citation Service] SQL execution error:', err);
                    reject(err);
                } else {
                    console.log(`[Citation Service] SQL query returned ${rows.length} rows`);
                    resolve(rows);
                }
            });
        });
    }

    // Close database connection
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('[Citation Service] Error closing database:', err);
                } else {
                    console.log('[Citation Service] Database connection closed');
                }
            });
        }
    }
}

module.exports = CitationService;
