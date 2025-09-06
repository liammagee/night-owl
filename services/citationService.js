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
                        this.insertDefaultStyles().then(() => {
                            resolve();
                        }).catch(reject);
                    }
                });
            });
        });
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
        return new Promise((resolve, reject) => {
            const {
                title, authors, publication_year, publication_date, journal,
                volume, issue, pages, publisher, doi, url, file_path,
                citation_type = 'article', abstract, notes, tags, zotero_key
            } = citationData;

            const sql = `
                INSERT INTO citations (
                    title, authors, publication_year, publication_date, journal,
                    volume, issue, pages, publisher, doi, url, file_path,
                    citation_type, abstract, notes, tags, zotero_key
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                title, authors, publication_year, publication_date, journal,
                volume, issue, pages, publisher, doi, url, file_path,
                citation_type, abstract, notes, tags, zotero_key
            ];

            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('[Citation Service] Error adding citation:', err);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, ...citationData });
                }
            });
        });
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
            
            const sql = `UPDATE citations SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

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

    // ===== ZOTERO INTEGRATION =====

    async syncWithZotero(zoteroAPIKey, userID, collectionID = null) {
        // TODO: Implement Zotero API integration
        // This will fetch citations from Zotero and sync with local database
        console.log('[Citation Service] Zotero sync not yet implemented');
        return { message: 'Zotero integration coming soon' };
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