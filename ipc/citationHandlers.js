// === Citation IPC Handlers ===
// Handles communication between renderer and citation service

const { ipcMain } = require('electron');
const CitationService = require('../services/citationService');
const axios = require('axios');
const cheerio = require('cheerio');

let citationService = null;

// Extract metadata from URL
async function extractUrlMetadata(url) {
    try {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const metadata = {};

        // Extract title
        metadata.title = $('title').first().text().trim() ||
                        $('meta[property="og:title"]').attr('content') ||
                        $('meta[name="title"]').attr('content') ||
                        $('h1').first().text().trim();

        // Extract description
        metadata.description = $('meta[property="og:description"]').attr('content') ||
                              $('meta[name="description"]').attr('content') ||
                              $('meta[name="abstract"]').attr('content');

        // Extract author
        metadata.author = $('meta[name="author"]').attr('content') ||
                         $('meta[property="article:author"]').attr('content') ||
                         $('meta[name="citation_author"]').attr('content');

        // Extract site name
        metadata.site_name = $('meta[property="og:site_name"]').attr('content') ||
                            $('meta[name="application-name"]').attr('content');

        // Extract publication date
        metadata.published_time = $('meta[property="article:published_time"]').attr('content') ||
                                 $('meta[name="citation_publication_date"]').attr('content') ||
                                 $('meta[name="pubdate"]').attr('content') ||
                                 $('time[datetime]').attr('datetime');

        // Extract DOI if present
        metadata.doi = $('meta[name="citation_doi"]').attr('content') ||
                      $('meta[name="doi"]').attr('content');

        // Extract journal information
        metadata.journal = $('meta[name="citation_journal_title"]').attr('content') ||
                          $('meta[name="citation_conference_title"]').attr('content');

        // Clean up the title
        if (metadata.title) {
            metadata.title = metadata.title.replace(/\s+/g, ' ').trim();
            // Remove site name from title if it's at the end
            if (metadata.site_name && metadata.title.endsWith(' - ' + metadata.site_name)) {
                metadata.title = metadata.title.replace(' - ' + metadata.site_name, '');
            }
        }

        console.log('[Citation Handlers] Extracted metadata:', metadata);
        return metadata;

    } catch (error) {
        console.error('[Citation Handlers] Error extracting URL metadata:', error.message);
        return {
            title: url,
            description: 'Failed to extract metadata from URL'
        };
    }
}

// Fetch metadata from DOI using CrossRef API
async function fetchDOIMetadata(doi) {
    try {
        console.log('[Citation Handlers] Fetching DOI metadata for:', doi);
        
        const response = await axios.get(`https://api.crossref.org/works/${doi}`, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json'
            }
        });

        const work = response.data.message;
        const metadata = {};

        // Extract title
        if (work.title && work.title.length > 0) {
            metadata.title = work.title[0];
        }

        // Extract authors
        if (work.author && work.author.length > 0) {
            const authors = work.author.map(author => {
                if (author.given && author.family) {
                    return `${author.given} ${author.family}`;
                } else if (author.family) {
                    return author.family;
                } else if (author.name) {
                    return author.name;
                }
                return '';
            }).filter(name => name).join(', ');
            metadata.authors = authors;
        }

        // Extract publication date
        if (work.published && work.published['date-parts'] && work.published['date-parts'][0]) {
            const dateParts = work.published['date-parts'][0];
            if (dateParts.length >= 1) {
                metadata.year = dateParts[0];
                if (dateParts.length >= 2 && dateParts.length >= 3) {
                    const month = dateParts[1].toString().padStart(2, '0');
                    const day = dateParts[2].toString().padStart(2, '0');
                    metadata.date = `${dateParts[0]}-${month}-${day}`;
                } else if (dateParts.length >= 2) {
                    const month = dateParts[1].toString().padStart(2, '0');
                    metadata.date = `${dateParts[0]}-${month}-01`;
                } else {
                    metadata.date = `${dateParts[0]}-01-01`;
                }
            }
        }

        // Extract journal information
        if (work['container-title'] && work['container-title'].length > 0) {
            metadata.journal = work['container-title'][0];
        }

        // Extract volume and issue
        if (work.volume) metadata.volume = work.volume;
        if (work.issue) metadata.issue = work.issue;

        // Extract pages
        if (work.page) {
            metadata.pages = work.page;
        } else if (work['article-number']) {
            metadata.pages = work['article-number'];
        }

        // Extract publisher
        if (work.publisher) {
            metadata.publisher = work.publisher;
        }

        // Extract abstract (if available)
        if (work.abstract) {
            metadata.abstract = work.abstract;
        }

        // Determine citation type based on work type
        const typeMap = {
            'journal-article': 'article',
            'book': 'book',
            'book-chapter': 'book',
            'proceedings-article': 'conference',
            'report': 'report',
            'thesis': 'thesis'
        };
        metadata.type = typeMap[work.type] || 'article';

        console.log('[Citation Handlers] Extracted DOI metadata:', metadata);
        return metadata;

    } catch (error) {
        console.error('[Citation Handlers] Error fetching DOI metadata:', error.message);
        throw new Error(`Failed to fetch DOI metadata: ${error.response?.status === 404 ? 'DOI not found' : error.message}`);
    }
}

// ===== EXPORT UTILITY FUNCTIONS =====

// Export to BibTeX format
function exportToBibTeX(citations) {
    return citations.map(citation => {
        const type = mapToBibTeXType(citation.citation_type);
        const key = generateCitationKey(citation);
        
        const fields = [];
        if (citation.title) fields.push(`  title = {${citation.title}}`);
        if (citation.authors) fields.push(`  author = {${citation.authors}}`);
        if (citation.publication_year) fields.push(`  year = {${citation.publication_year}}`);
        if (citation.journal) fields.push(`  journal = {${citation.journal}}`);
        if (citation.volume) fields.push(`  volume = {${citation.volume}}`);
        if (citation.issue) fields.push(`  number = {${citation.issue}}`);
        if (citation.pages) fields.push(`  pages = {${citation.pages}}`);
        if (citation.publisher) fields.push(`  publisher = {${citation.publisher}}`);
        if (citation.doi) fields.push(`  doi = {${citation.doi}}`);
        if (citation.url) fields.push(`  url = {${citation.url}}`);
        if (citation.abstract) fields.push(`  abstract = {${citation.abstract}}`);
        
        return `@${type}{${key},\n${fields.join(',\n')}\n}`;
    }).join('\n\n');
}

// Export to RIS format
function exportToRIS(citations) {
    return citations.map(citation => {
        const lines = [];
        lines.push(`TY  - ${mapToRISType(citation.citation_type)}`);
        if (citation.title) lines.push(`TI  - ${citation.title}`);
        if (citation.authors) {
            citation.authors.split(', ').forEach(author => {
                lines.push(`AU  - ${author}`);
            });
        }
        if (citation.publication_year) lines.push(`PY  - ${citation.publication_year}`);
        if (citation.journal) lines.push(`JO  - ${citation.journal}`);
        if (citation.volume) lines.push(`VL  - ${citation.volume}`);
        if (citation.issue) lines.push(`IS  - ${citation.issue}`);
        if (citation.pages) lines.push(`SP  - ${citation.pages.split('-')[0]}`);
        if (citation.pages && citation.pages.includes('-')) {
            lines.push(`EP  - ${citation.pages.split('-')[1]}`);
        }
        if (citation.publisher) lines.push(`PB  - ${citation.publisher}`);
        if (citation.doi) lines.push(`DO  - ${citation.doi}`);
        if (citation.url) lines.push(`UR  - ${citation.url}`);
        if (citation.abstract) lines.push(`AB  - ${citation.abstract}`);
        lines.push('ER  - ');
        
        return lines.join('\n');
    }).join('\n\n');
}

// Export to CSV format
function exportToCSV(citations) {
    const headers = [
        'Title', 'Authors', 'Year', 'Journal', 'Volume', 'Issue', 'Pages', 
        'Publisher', 'DOI', 'URL', 'Type', 'Abstract', 'Notes', 'Tags'
    ];
    
    const csvRows = [headers.join(',')];
    
    citations.forEach(citation => {
        const row = [
            escapeCSV(citation.title || ''),
            escapeCSV(citation.authors || ''),
            citation.publication_year || '',
            escapeCSV(citation.journal || ''),
            citation.volume || '',
            citation.issue || '',
            citation.pages || '',
            escapeCSV(citation.publisher || ''),
            citation.doi || '',
            citation.url || '',
            citation.citation_type || '',
            escapeCSV(citation.abstract || ''),
            escapeCSV(citation.notes || ''),
            escapeCSV(citation.tags || '')
        ];
        csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
}

// Export to formatted text using citation styles
async function exportToFormattedText(citations, styleName, citationService) {
    const formattedCitations = [];
    
    for (const citation of citations) {
        try {
            const formatted = await citationService.formatCitation(citation.id, styleName);
            formattedCitations.push(formatted);
        } catch (error) {
            console.error(`Error formatting citation ${citation.id}:`, error);
            formattedCitations.push(`Error formatting: ${citation.title}`);
        }
    }
    
    return formattedCitations.join('\n\n');
}

// Utility functions
function mapToBibTeXType(citationType) {
    const typeMap = {
        'article': 'article',
        'book': 'book',
        'webpage': 'misc',
        'conference': 'inproceedings',
        'report': 'techreport',
        'thesis': 'phdthesis'
    };
    return typeMap[citationType] || 'misc';
}

function mapToRISType(citationType) {
    const typeMap = {
        'article': 'JOUR',
        'book': 'BOOK',
        'webpage': 'ELEC',
        'conference': 'CONF',
        'report': 'RPRT',
        'thesis': 'THES'
    };
    return typeMap[citationType] || 'GEN';
}

function generateCitationKey(citation) {
    let key = '';
    
    // Add first author's last name
    if (citation.authors) {
        const firstAuthor = citation.authors.split(',')[0].trim();
        const lastName = firstAuthor.split(' ').pop();
        key += lastName.replace(/[^a-zA-Z]/g, '');
    }
    
    // Add year
    if (citation.publication_year) {
        key += citation.publication_year;
    }
    
    // Add title words
    if (citation.title) {
        const titleWords = citation.title.split(' ')
            .filter(word => word.length > 3)
            .slice(0, 2)
            .map(word => word.replace(/[^a-zA-Z]/g, ''))
            .join('');
        key += titleWords;
    }
    
    return key || 'Citation' + Date.now();
}

function escapeCSV(value) {
    if (typeof value !== 'string') return value;
    
    // If the value contains comma, quote, or newline, wrap it in quotes and escape quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

// Initialize citation service
async function initializeCitationService(userDataPath) {
    try {
        if (!citationService) {
            citationService = new CitationService();
            await citationService.initialize(userDataPath);
            console.log('[Citation Handlers] Citation service initialized');
        }
    } catch (error) {
        console.error('[Citation Handlers] Failed to initialize citation service:', error);
        throw error;
    }
}

// Register all citation-related IPC handlers
function registerCitationHandlers(userDataPath) {
    console.log('[Citation Handlers] Registering citation IPC handlers...');

    // Initialize service
    ipcMain.handle('citations-initialize', async () => {
        try {
            await initializeCitationService(userDataPath);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ===== CITATION CRUD =====

    // Add citation
    ipcMain.handle('citations-add', async (event, citationData) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const result = await citationService.addCitation(citationData);
            return { success: true, citation: result };
        } catch (error) {
            console.error('[Citation Handlers] Error adding citation:', error);
            return { success: false, error: error.message };
        }
    });

    // Get citations with optional filtering
    ipcMain.handle('citations-get', async (event, filters = {}) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const citations = await citationService.getCitations(filters);
            return { success: true, citations };
        } catch (error) {
            console.error('[Citation Handlers] Error getting citations:', error);
            return { success: false, error: error.message };
        }
    });

    // Get citation by ID
    ipcMain.handle('citations-get-by-id', async (event, id) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const citation = await citationService.getCitationById(id);
            return { success: true, citation };
        } catch (error) {
            console.error('[Citation Handlers] Error getting citation:', error);
            return { success: false, error: error.message };
        }
    });

    // Update citation
    ipcMain.handle('citations-update', async (event, id, updates) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const result = await citationService.updateCitation(id, updates);
            return { success: true, result };
        } catch (error) {
            console.error('[Citation Handlers] Error updating citation:', error);
            return { success: false, error: error.message };
        }
    });

    // Delete citation
    ipcMain.handle('citations-delete', async (event, id) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const result = await citationService.deleteCitation(id);
            return { success: true, result };
        } catch (error) {
            console.error('[Citation Handlers] Error deleting citation:', error);
            return { success: false, error: error.message };
        }
    });

    // ===== PROJECTS =====

    // Add project
    ipcMain.handle('citations-projects-add', async (event, name, description) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const result = await citationService.addProject(name, description);
            return { success: true, project: result };
        } catch (error) {
            console.error('[Citation Handlers] Error adding project:', error);
            return { success: false, error: error.message };
        }
    });

    // Get projects
    ipcMain.handle('citations-projects-get', async (event) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const projects = await citationService.getProjects();
            return { success: true, projects };
        } catch (error) {
            console.error('[Citation Handlers] Error getting projects:', error);
            return { success: false, error: error.message };
        }
    });

    // ===== FORMATTING =====

    // Format citation
    ipcMain.handle('citations-format', async (event, citationId, styleName = 'APA') => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const formatted = await citationService.formatCitation(citationId, styleName);
            return { success: true, formatted };
        } catch (error) {
            console.error('[Citation Handlers] Error formatting citation:', error);
            return { success: false, error: error.message };
        }
    });

    // ===== IMPORT/EXPORT =====

    // Import from URL (web scraping)
    ipcMain.handle('citations-import-url', async (event, url) => {
        try {
            console.log('[Citation Handlers] Importing from URL:', url);
            
            // Extract metadata from URL
            const metadata = await extractUrlMetadata(url);
            
            const citationData = {
                title: metadata.title || 'Web Page',
                authors: metadata.author || metadata.site_name || '',
                url: url,
                citation_type: 'webpage',
                publication_date: metadata.published_time || new Date().toISOString().split('T')[0],
                abstract: metadata.description || '',
                journal: metadata.site_name || '',
                source: 'url'
            };
            
            if (!citationService) await initializeCitationService(userDataPath);
            const result = await citationService.addCitation(citationData);
            return { success: true, citation: result };
        } catch (error) {
            console.error('[Citation Handlers] Error importing from URL:', error);
            return { success: false, error: error.message };
        }
    });

    // Import from DOI
    ipcMain.handle('citations-import-doi', async (event, doi) => {
        try {
            console.log('[Citation Handlers] Importing from DOI:', doi);
            
            // Clean DOI (remove URL prefix if present)
            const cleanDoi = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '');
            
            // Fetch metadata from CrossRef
            const metadata = await fetchDOIMetadata(cleanDoi);
            
            const citationData = {
                title: metadata.title,
                authors: metadata.authors,
                publication_year: metadata.year,
                publication_date: metadata.date,
                journal: metadata.journal,
                volume: metadata.volume,
                issue: metadata.issue,
                pages: metadata.pages,
                publisher: metadata.publisher,
                doi: cleanDoi,
                citation_type: metadata.type || 'article',
                abstract: metadata.abstract || '',
                source: 'doi'
            };
            
            if (!citationService) await initializeCitationService(userDataPath);
            const result = await citationService.addCitation(citationData);
            return { success: true, citation: result };
        } catch (error) {
            console.error('[Citation Handlers] Error importing from DOI:', error);
            return { success: false, error: error.message };
        }
    });

    // Export citations
    ipcMain.handle('citations-export', async (event, citationIds, format = 'bibtex') => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            
            // Get citations
            const citations = [];
            for (const id of citationIds) {
                const citation = await citationService.getCitationById(id);
                if (citation) citations.push(citation);
            }

            if (citations.length === 0) {
                return { success: false, error: 'No citations found to export' };
            }

            let content = '';
            let filename = '';

            switch (format.toLowerCase()) {
                case 'bibtex':
                    content = exportToBibTeX(citations);
                    filename = 'citations.bib';
                    break;
                
                case 'ris':
                    content = exportToRIS(citations);
                    filename = 'citations.ris';
                    break;
                
                case 'csv':
                    content = exportToCSV(citations);
                    filename = 'citations.csv';
                    break;
                
                case 'json':
                    content = JSON.stringify(citations, null, 2);
                    filename = 'citations.json';
                    break;
                
                case 'apa':
                    content = await exportToFormattedText(citations, 'APA', citationService);
                    filename = 'citations_apa.txt';
                    break;
                
                case 'mla':
                    content = await exportToFormattedText(citations, 'MLA', citationService);
                    filename = 'citations_mla.txt';
                    break;
                
                case 'chicago':
                    content = await exportToFormattedText(citations, 'Chicago', citationService);
                    filename = 'citations_chicago.txt';
                    break;
                
                default:
                    return { success: false, error: `Export format '${format}' not supported` };
            }
            
            return { success: true, content, format, filename };
        } catch (error) {
            console.error('[Citation Handlers] Error exporting citations:', error);
            return { success: false, error: error.message };
        }
    });

    // Export citations to file in working directory
    ipcMain.handle('citations-export-to-file', async (event, citationIds, format = 'bibtex') => {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            
            if (!citationService) await initializeCitationService(userDataPath);
            
            // Get citations
            const citations = [];
            for (const id of citationIds) {
                const citation = await citationService.getCitationById(id);
                if (citation) citations.push(citation);
            }

            if (citations.length === 0) {
                return { success: false, error: 'No citations found to export' };
            }

            let content = '';
            let filename = '';

            switch (format.toLowerCase()) {
                case 'bibtex':
                    content = exportToBibTeX(citations);
                    filename = 'citations.bib';
                    break;
                
                case 'ris':
                    content = exportToRIS(citations);
                    filename = 'citations.ris';
                    break;
                
                case 'csv':
                    content = exportToCSV(citations);
                    filename = 'citations.csv';
                    break;
                
                case 'json':
                    content = JSON.stringify(citations, null, 2);
                    filename = 'citations.json';
                    break;
                
                case 'apa':
                    content = await exportToFormattedText(citations, 'APA', citationService);
                    filename = 'citations_apa.txt';
                    break;
                
                case 'mla':
                    content = await exportToFormattedText(citations, 'MLA', citationService);
                    filename = 'citations_mla.txt';
                    break;
                
                case 'chicago':
                    content = await exportToFormattedText(citations, 'Chicago', citationService);
                    filename = 'citations_chicago.txt';
                    break;
                
                default:
                    return { success: false, error: `Export format '${format}' not supported` };
            }
            
            // Save to current working directory
            const filePath = path.join(process.cwd(), filename);
            await fs.writeFile(filePath, content, 'utf8');
            
            console.log(`[Citation Handlers] Citations exported to ${filePath}`);
            return { success: true, format, filename, filePath };
        } catch (error) {
            console.error('[Citation Handlers] Error exporting citations to file:', error);
            return { success: false, error: error.message };
        }
    });

    // ===== STATISTICS =====

    // Get citation statistics
    ipcMain.handle('citations-statistics', async (event) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const stats = await citationService.getStatistics();
            return { success: true, statistics: stats };
        } catch (error) {
            console.error('[Citation Handlers] Error getting statistics:', error);
            return { success: false, error: error.message };
        }
    });

    // ===== ZOTERO INTEGRATION =====

    // Sync with Zotero
    ipcMain.handle('citations-zotero-sync', async (event, apiKey, userID, collectionID) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const result = await citationService.syncWithZotero(apiKey, userID, collectionID);
            return { success: true, result };
        } catch (error) {
            console.error('[Citation Handlers] Error syncing with Zotero:', error);
            return { success: false, error: error.message };
        }
    });

    // Export citations to Zotero
    ipcMain.handle('citations-export-to-zotero', async (event, citationIds, apiKey, userID, collectionID = null) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const result = await citationService.exportToZotero(citationIds, apiKey, userID, collectionID);
            return result;
        } catch (error) {
            console.error('[Citation Handlers] Error exporting to Zotero:', error);
            return { success: false, error: error.message };
        }
    });

    // Live sync with Zotero (bidirectional)
    ipcMain.handle('citations-zotero-live-sync', async (event, apiKey, userID, collectionID = null) => {
        try {
            console.log(`[Citation Handlers] Live sync requested with userID=${userID}, collectionID=${collectionID}`);
            if (!citationService) await initializeCitationService(userDataPath);
            
            // Get last sync time
            const lastSyncTime = await citationService.getLastSyncTime();
            console.log(`[Citation Handlers] Last sync time: ${lastSyncTime}`);
            
            // Perform live sync
            const result = await citationService.liveSyncWithZotero(apiKey, userID, collectionID, lastSyncTime);
            console.log(`[Citation Handlers] Live sync completed:`, result);
            return result;
        } catch (error) {
            console.error('[Citation Handlers] Error with live sync:', error);
            return { success: false, error: error.message };
        }
    });

    // Get last sync time
    ipcMain.handle('citations-get-last-sync-time', async (event) => {
        try {
            if (!citationService) await initializeCitationService(userDataPath);
            const lastSyncTime = await citationService.getLastSyncTime();
            return { success: true, lastSyncTime };
        } catch (error) {
            console.error('[Citation Handlers] Error getting last sync time:', error);
            return { success: false, error: error.message };
        }
    });

    // ===== ADVANCED/DEBUG FEATURES =====

    // Execute raw SQL query (for advanced users/debugging)
    ipcMain.handle('citations-execute-sql', async (event, sqlQuery) => {
        try {
            console.log(`[Citation Handlers] Executing raw SQL query: ${sqlQuery}`);
            if (!citationService) await initializeCitationService(userDataPath);
            
            const result = await citationService.executeRawSQL(sqlQuery);
            return { success: true, data: result };
        } catch (error) {
            console.error('[Citation Handlers] Error executing SQL:', error);
            return { success: false, error: error.message };
        }
    });

    console.log('[Citation Handlers] Citation IPC handlers registered successfully');
}

// Clean up on app quit
function cleanupCitationService() {
    if (citationService) {
        citationService.close();
        citationService = null;
    }
}

module.exports = {
    registerCitationHandlers,
    cleanupCitationService
};