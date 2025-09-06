// === Citation Manager ===
// Frontend citation management system

class CitationManager {
    constructor() {
        this.citations = [];
        this.projects = [];
        this.currentFilters = {};
        this.isInitialized = false;
        this.currentEditingId = null;
    }

    // Initialize the citation manager
    async initialize() {
        try {
            console.log('[Citation Manager] Initializing...');
            
            // Initialize the backend service
            const result = await window.electronAPI.invoke('citations-initialize');
            if (!result.success) {
                throw new Error(result.error);
            }

            // Set up event listeners
            this.setupEventListeners();
            
            // Load initial data
            await this.refreshCitations();
            await this.loadProjects();
            
            this.isInitialized = true;
            console.log('[Citation Manager] Initialized successfully');
            
        } catch (error) {
            console.error('[Citation Manager] Initialization failed:', error);
            this.showError('Failed to initialize citation manager: ' + error.message);
        }
    }

    // Set up event listeners for citation UI
    setupEventListeners() {
        // Tab button
        const showCitationsBtn = document.getElementById('show-citations-btn');
        if (showCitationsBtn) {
            showCitationsBtn.addEventListener('click', () => {
                this.showCitationsPanel();
            });
        }

        // Action buttons
        const addBtn = document.getElementById('add-citation-btn');
        const importBtn = document.getElementById('import-citation-btn');
        const refreshBtn = document.getElementById('refresh-citations-btn');
        
        if (addBtn) addBtn.addEventListener('click', () => this.showAddCitationModal());
        if (importBtn) importBtn.addEventListener('click', () => this.showImportModal());
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshCitations());

        // Search and filters
        const searchInput = document.getElementById('citations-search-input');
        const typeFilter = document.getElementById('citations-type-filter');
        const projectFilter = document.getElementById('citations-project-filter');
        const clearFilters = document.getElementById('clear-citation-filters');

        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => this.applyFilters(), 300));
        }
        if (typeFilter) typeFilter.addEventListener('change', () => this.applyFilters());
        if (projectFilter) projectFilter.addEventListener('change', () => this.applyFilters());
        if (clearFilters) clearFilters.addEventListener('click', () => this.clearFilters());
    }

    // Show the citations panel
    showCitationsPanel() {
        // Hide other panels
        const panels = ['file-tree-view', 'search-pane', 'statistics-pane', 'citations-pane'];
        panels.forEach(panelId => {
            const panel = document.getElementById(panelId);
            if (panel) panel.style.display = 'none';
        });

        // Show citations panel
        const citationsPane = document.getElementById('citations-pane');
        const structureList = document.getElementById('structure-list');
        if (citationsPane) citationsPane.style.display = 'flex';
        if (structureList) structureList.style.display = 'none';

        // Update button states
        document.querySelectorAll('.pane-toggle-button').forEach(btn => {
            btn.classList.remove('active');
        });
        const showCitationsBtn = document.getElementById('show-citations-btn');
        if (showCitationsBtn) showCitationsBtn.classList.add('active');

        // Update title
        const title = document.getElementById('structure-pane-title');
        if (title) title.textContent = 'Citations';

        // Initialize if not already done
        if (!this.isInitialized) {
            this.initialize();
        }
    }

    // Load citations with filters
    async refreshCitations() {
        try {
            this.showLoading();
            
            const result = await window.electronAPI.invoke('citations-get', this.currentFilters);
            if (!result.success) {
                throw new Error(result.error);
            }

            this.citations = result.citations;
            this.renderCitations();
            this.updateStatistics();
            
        } catch (error) {
            console.error('[Citation Manager] Error refreshing citations:', error);
            this.showError('Failed to load citations: ' + error.message);
        }
    }

    // Load projects for filter dropdown
    async loadProjects() {
        try {
            const result = await window.electronAPI.invoke('citations-projects-get');
            if (result.success) {
                this.projects = result.projects;
                this.updateProjectFilter();
            }
        } catch (error) {
            console.error('[Citation Manager] Error loading projects:', error);
        }
    }

    // Update project filter dropdown
    updateProjectFilter() {
        const projectFilter = document.getElementById('citations-project-filter');
        if (!projectFilter) return;

        // Keep the "All Projects" option
        projectFilter.innerHTML = '<option value="">All Projects</option>';
        
        this.projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            projectFilter.appendChild(option);
        });
    }

    // Apply current filters
    async applyFilters() {
        const searchInput = document.getElementById('citations-search-input');
        const typeFilter = document.getElementById('citations-type-filter');
        const projectFilter = document.getElementById('citations-project-filter');

        this.currentFilters = {};
        
        if (searchInput && searchInput.value.trim()) {
            this.currentFilters.search = searchInput.value.trim();
        }
        if (typeFilter && typeFilter.value) {
            this.currentFilters.type = typeFilter.value;
        }
        if (projectFilter && projectFilter.value) {
            this.currentFilters.project_id = projectFilter.value;
        }

        await this.refreshCitations();
    }

    // Clear all filters
    clearFilters() {
        const searchInput = document.getElementById('citations-search-input');
        const typeFilter = document.getElementById('citations-type-filter');
        const projectFilter = document.getElementById('citations-project-filter');

        if (searchInput) searchInput.value = '';
        if (typeFilter) typeFilter.value = '';
        if (projectFilter) projectFilter.value = '';

        this.currentFilters = {};
        this.refreshCitations();
    }

    // Render citations list
    renderCitations() {
        const citationsContainer = document.getElementById('citations-list');
        const emptyState = document.getElementById('citations-empty');
        const loadingState = document.getElementById('citations-loading');

        if (!citationsContainer) return;

        loadingState.style.display = 'none';

        if (this.citations.length === 0) {
            citationsContainer.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        citationsContainer.style.display = 'block';
        citationsContainer.innerHTML = '';

        this.citations.forEach(citation => {
            const citationElement = this.createCitationElement(citation);
            citationsContainer.appendChild(citationElement);
        });
    }

    // Create citation list item element
    createCitationElement(citation) {
        const div = document.createElement('div');
        div.className = 'citation-item';
        div.style.cssText = `
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 8px;
            background: white;
            cursor: pointer;
            transition: all 0.2s;
        `;

        const typeIcon = this.getCitationTypeIcon(citation.citation_type);
        const year = citation.publication_year ? `(${citation.publication_year})` : '';
        const authors = citation.authors ? citation.authors : 'Unknown Author';
        
        div.innerHTML = `
            <div style="display: flex; justify-content: between; align-items: flex-start; gap: 8px;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <span style="font-size: 14px;">${typeIcon}</span>
                        <span style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: 600;">
                            ${citation.citation_type}
                        </span>
                        ${citation.is_favorite ? '<span style="color: gold;">⭐</span>' : ''}
                    </div>
                    
                    <div style="font-weight: 600; margin-bottom: 4px; line-height: 1.3; font-size: 13px;">
                        ${citation.title}
                    </div>
                    
                    <div style="font-size: 12px; color: #666; margin-bottom: 6px;">
                        ${authors} ${year}
                    </div>
                    
                    ${citation.journal ? `<div style="font-size: 11px; color: #888; margin-bottom: 4px;">${citation.journal}</div>` : ''}
                    ${citation.tags ? `<div style="font-size: 10px;"><span style="color: #666;">Tags:</span> ${citation.tags}</div>` : ''}
                </div>
                
                <div class="citation-actions" style="display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s;">
                    <button class="citation-action-btn" onclick="citationManager.editCitation(${citation.id})" 
                            title="Edit" style="padding: 2px 4px; font-size: 10px; border: 1px solid #ddd; background: white; border-radius: 3px;">✏️</button>
                    <button class="citation-action-btn" onclick="citationManager.copyCitation(${citation.id})" 
                            title="Copy Citation" style="padding: 2px 4px; font-size: 10px; border: 1px solid #ddd; background: white; border-radius: 3px;">📋</button>
                    <button class="citation-action-btn" onclick="citationManager.deleteCitation(${citation.id})" 
                            title="Delete" style="padding: 2px 4px; font-size: 10px; border: 1px solid #ddd; background: white; border-radius: 3px;">🗑️</button>
                </div>
            </div>
        `;

        // Show actions on hover
        div.addEventListener('mouseenter', () => {
            const actions = div.querySelector('.citation-actions');
            if (actions) actions.style.opacity = '1';
            div.style.backgroundColor = '#f8f9fa';
        });

        div.addEventListener('mouseleave', () => {
            const actions = div.querySelector('.citation-actions');
            if (actions) actions.style.opacity = '0';
            div.style.backgroundColor = 'white';
        });

        // Click to view/edit
        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('citation-action-btn')) {
                this.viewCitation(citation.id);
            }
        });

        return div;
    }

    // Get icon for citation type
    getCitationTypeIcon(type) {
        const icons = {
            article: '📄',
            book: '📚',
            webpage: '🌐',
            report: '📊',
            thesis: '🎓',
            conference: '🎤',
            default: '📝'
        };
        return icons[type] || icons.default;
    }

    // Update statistics display
    updateStatistics() {
        const statsDiv = document.getElementById('citations-stats');
        if (!statsDiv) return;

        const total = this.citations.length;
        const filtered = this.currentFilters && Object.keys(this.currentFilters).length > 0;
        
        statsDiv.textContent = filtered ? `${total} filtered` : `${total} total`;
    }

    // Show loading state
    showLoading() {
        const loadingState = document.getElementById('citations-loading');
        const emptyState = document.getElementById('citations-empty');
        const listState = document.getElementById('citations-list');
        
        if (loadingState) loadingState.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';
        if (listState) listState.style.display = 'none';
    }

    // Show error message
    showError(message) {
        if (window.showNotification) {
            window.showNotification(message, 'error');
        } else {
            alert(message);
        }
    }

    // Show success message
    showSuccess(message) {
        if (window.showNotification) {
            window.showNotification(message, 'success');
        }
    }

    // ===== CITATION ACTIONS =====

    // Show add citation modal
    showAddCitationModal() {
        // TODO: Implement add citation modal
        console.log('[Citation Manager] Add citation modal not yet implemented');
        this.showError('Add citation modal not yet implemented. Coming soon!');
    }

    // Show import modal
    showImportModal() {
        // TODO: Implement import modal
        console.log('[Citation Manager] Import modal not yet implemented');
        this.showError('Import modal not yet implemented. Coming soon!');
    }

    // View citation details
    viewCitation(id) {
        // TODO: Implement citation detail view
        console.log('[Citation Manager] View citation:', id);
        this.showError('Citation detail view not yet implemented. Coming soon!');
    }

    // Edit citation
    editCitation(id) {
        // TODO: Implement edit citation
        console.log('[Citation Manager] Edit citation:', id);
        this.showError('Edit citation not yet implemented. Coming soon!');
    }

    // Copy citation to clipboard
    async copyCitation(id) {
        try {
            const result = await window.electronAPI.invoke('citations-format', id, 'APA');
            if (result.success) {
                navigator.clipboard.writeText(result.formatted);
                this.showSuccess('Citation copied to clipboard');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error copying citation:', error);
            this.showError('Failed to copy citation: ' + error.message);
        }
    }

    // Delete citation
    async deleteCitation(id) {
        if (!confirm('Are you sure you want to delete this citation?')) return;

        try {
            const result = await window.electronAPI.invoke('citations-delete', id);
            if (result.success) {
                this.showSuccess('Citation deleted');
                await this.refreshCitations();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error deleting citation:', error);
            this.showError('Failed to delete citation: ' + error.message);
        }
    }

    // ===== UTILITY METHODS =====

    // Debounce function for search input
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Create global instance
const citationManager = new CitationManager();

// Export for global access
window.citationManager = citationManager;

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[Citation Manager] DOM loaded, ready to initialize');
    });
} else {
    console.log('[Citation Manager] DOM already loaded, ready to initialize');
}