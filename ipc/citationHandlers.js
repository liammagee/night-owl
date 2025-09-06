// === Citation IPC Handlers ===
// Handles communication between renderer and citation service

const { ipcMain } = require('electron');
const CitationService = require('../services/citationService');

let citationService = null;

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
            // TODO: Implement URL metadata extraction
            // For now, return basic URL citation
            const citationData = {
                title: 'Web Page', // Will be extracted from URL
                url: url,
                citation_type: 'webpage',
                publication_date: new Date().toISOString().split('T')[0]
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
            // TODO: Implement DOI lookup using CrossRef API
            console.log('[Citation Handlers] DOI import not yet implemented:', doi);
            return { success: false, error: 'DOI import not yet implemented' };
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

            // TODO: Implement various export formats
            if (format === 'bibtex') {
                const bibtex = citations.map(citation => {
                    const type = citation.citation_type === 'article' ? 'article' : 'misc';
                    const key = citation.title.replace(/\s+/g, '').substring(0, 20) + citation.publication_year;
                    
                    return `@${type}{${key},
  title = {${citation.title}},
  author = {${citation.authors || 'Unknown'}},
  year = {${citation.publication_year || 'n.d.'}},
  journal = {${citation.journal || ''}},
  volume = {${citation.volume || ''}},
  number = {${citation.issue || ''}},
  pages = {${citation.pages || ''}},
  doi = {${citation.doi || ''}},
  url = {${citation.url || ''}}
}`;
                }).join('\n\n');
                
                return { success: true, content: bibtex, format: 'bibtex' };
            }
            
            return { success: false, error: 'Export format not supported yet' };
        } catch (error) {
            console.error('[Citation Handlers] Error exporting citations:', error);
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