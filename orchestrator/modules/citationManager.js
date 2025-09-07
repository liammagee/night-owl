// === Citation Manager ===
// Frontend citation management system

console.log('[Citation Manager] Script loading...');

class CitationManager {
    constructor() {
        this.citations = [];
        this.projects = [];
        this.currentFilters = {};
        this.isInitialized = false;
        this.currentEditingId = null;
        this.eventListenersSet = false;
        this.actionListenersSet = false;
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

            // Event listeners will be set up when DOM is ready
            
            // Load initial data
            await this.refreshCitations();
            await this.loadProjects();
            
            // Set up responsive button monitoring
            this.setupResponsiveButtons();
            
            this.isInitialized = true;
            console.log('[Citation Manager] Initialized successfully');
            
        } catch (error) {
            console.error('[Citation Manager] Initialization failed:', error);
            this.showError('Failed to initialize citation manager: ' + error.message);
        }
    }

    // Set up event listeners for citation UI
    setupEventListeners() {
        console.log('[Citation Manager] Setting up event listeners...');
        
        // Tab button
        const showCitationsBtn = document.getElementById('show-citations-btn');
        console.log('[Citation Manager] Show Citations Button found:', !!showCitationsBtn);
        
        // Only set up the main Citations button if it exists and doesn't already have our listener
        if (showCitationsBtn && !showCitationsBtn.hasAttribute('data-citation-listener')) {
            console.log('[Citation Manager] Adding click listener to Citations button');
            showCitationsBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Citations button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.showCitationsPanel();
            });
            showCitationsBtn.setAttribute('data-citation-listener', 'true');
        }
        
        // Prevent duplicate listener registration for other elements
        if (this.eventListenersSet) {
            console.log('[Citation Manager] Other event listeners already set, skipping');
            return;
        }
        
        this.eventListenersSet = true;
        console.log('[Citation Manager] Event listeners set up successfully');

        // Action buttons will be set up when panel is shown

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

        // Modal event listeners
        this.setupModalEventListeners();
    }

    // Set up action button event listeners (called when panel becomes visible)
    setupActionButtonListeners() {
        console.log('[Citation Manager] Setting up action button listeners...');
        
        // Prevent duplicate listener registration
        if (this.actionListenersSet) {
            console.log('[Citation Manager] Action listeners already set, skipping');
            return;
        }
        
        const addBtn = document.getElementById('add-citation-btn');
        const importBtn = document.getElementById('import-citation-btn');
        const exportBtn = document.getElementById('export-citations-btn');
        const selectAllBtn = document.getElementById('select-all-citations-btn');
        const exportToZoteroBtn = document.getElementById('export-to-zotero-btn');
        const liveSyncZoteroBtn = document.getElementById('live-sync-zotero-btn');
        const refreshBtn = document.getElementById('refresh-citations-btn');
        
        console.log('[Citation Manager] Add button found:', !!addBtn);
        console.log('[Citation Manager] Import button found:', !!importBtn);
        console.log('[Citation Manager] Export button found:', !!exportBtn);
        console.log('[Citation Manager] Export to Zotero button found:', !!exportToZoteroBtn);
        console.log('[Citation Manager] Live Sync Zotero button found:', !!liveSyncZoteroBtn);
        console.log('[Citation Manager] Refresh button found:', !!refreshBtn);
        
        if (addBtn) {
            console.log('[Citation Manager] Adding click listener to Add button');
            addBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Add button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.showAddCitationModal();
            });
        }
        if (importBtn) {
            console.log('[Citation Manager] Adding click listener to Import button');
            importBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Import button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.showImportModal();
            });
        }
        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Export button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.showExportModal();
            });
        }
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Select All button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.toggleSelectAll();
            });
        }
        if (exportToZoteroBtn) {
            exportToZoteroBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Export to Zotero button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.exportToZotero();
            });
        }
        if (liveSyncZoteroBtn) {
            liveSyncZoteroBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Live Sync Zotero button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.liveSyncWithZotero();
            });
        }
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Refresh button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.refreshCitations();
            });
        }
        
        this.actionListenersSet = true;
        console.log('[Citation Manager] Action button listeners set up successfully');
    }

    // Set up modal event listeners
    setupModalEventListeners() {
        // Citation modal events
        const citationModal = document.getElementById('citation-modal-overlay');
        const saveCitationBtn = document.getElementById('save-citation-btn');
        const cancelCitationBtn = document.getElementById('cancel-citation-btn');
        const browseFileBtn = document.getElementById('browse-file-btn');

        if (saveCitationBtn) saveCitationBtn.addEventListener('click', () => this.saveCitation());
        if (cancelCitationBtn) cancelCitationBtn.addEventListener('click', () => this.hideModal('citation-modal-overlay'));
        if (browseFileBtn) browseFileBtn.addEventListener('click', () => this.browseFile());

        // Import modal events
        const importModal = document.getElementById('import-modal-overlay');
        const importUrlBtn = document.getElementById('import-url-btn');
        const importDoiBtn = document.getElementById('import-doi-btn');
        const importZoteroBtn = document.getElementById('import-zotero-btn');
        const cancelImportBtn = document.getElementById('cancel-import-btn');

        if (importUrlBtn) importUrlBtn.addEventListener('click', () => this.importFromURL());
        if (importDoiBtn) importDoiBtn.addEventListener('click', () => this.importFromDOI());
        if (importZoteroBtn) importZoteroBtn.addEventListener('click', () => this.syncWithZotero());
        if (cancelImportBtn) cancelImportBtn.addEventListener('click', () => this.hideModal('import-modal-overlay'));

        // Zotero modal events
        const zoteroModal = document.getElementById('zotero-modal-overlay');
        const saveZoteroBtn = document.getElementById('save-zotero-btn');
        const cancelZoteroBtn = document.getElementById('cancel-zotero-btn');
        const configZoteroBtn = document.getElementById('config-zotero-btn');

        if (saveZoteroBtn) saveZoteroBtn.addEventListener('click', () => this.saveZoteroConfig());
        if (cancelZoteroBtn) cancelZoteroBtn.addEventListener('click', () => this.hideModal('zotero-modal-overlay'));
        if (configZoteroBtn) configZoteroBtn.addEventListener('click', () => this.showZoteroConfig());

        // Export modal events
        const exportModal = document.getElementById('export-modal');
        const previewExportBtn = document.getElementById('preview-export-btn');
        const downloadExportBtn = document.getElementById('download-export-btn');
        const cancelExportBtn = document.getElementById('cancel-export-btn');

        if (previewExportBtn) previewExportBtn.addEventListener('click', () => this.previewExport());
        if (downloadExportBtn) downloadExportBtn.addEventListener('click', () => this.downloadExport());
        if (cancelExportBtn) cancelExportBtn.addEventListener('click', () => this.hideModal('export-modal'));

        // Close modal when clicking backdrop
        [citationModal, importModal, zoteroModal, exportModal].forEach(modal => {
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.hideModal(modal.id);
                    }
                });
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const visibleModal = document.querySelector('.modal[style*="display: flex"]');
                if (visibleModal) {
                    this.hideModal(visibleModal.id);
                }
            }
        });
    }

    // Show the citations panel
    // Retry setting up Citations button if it wasn't available initially
    ensureCitationsButtonListener() {
        const showCitationsBtn = document.getElementById('show-citations-btn');
        if (showCitationsBtn && !showCitationsBtn.hasAttribute('data-citation-listener')) {
            console.log('[Citation Manager] Retrying Citations button listener setup');
            showCitationsBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Citations button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.showCitationsPanel();
            });
            showCitationsBtn.setAttribute('data-citation-listener', 'true');
        }
    }

    showCitationsPanel() {
        console.log('[Citation Manager] showCitationsPanel called');
        
        // Ensure button listener is set up (in case button wasn't available during initial setup)
        this.ensureCitationsButtonListener();
        
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

        // Set up action button event listeners now that panel is visible
        this.setupActionButtonListeners();

        // Update button states
        document.querySelectorAll('.pane-toggle-button').forEach(btn => {
            btn.classList.remove('active');
        });
        const showCitationsBtn = document.getElementById('show-citations-btn');
        if (showCitationsBtn) showCitationsBtn.classList.add('active');

        // Update title
        const title = document.getElementById('structure-pane-title');
        if (title) title.textContent = 'Citations';

        // Hide file tree specific buttons
        const changeDirBtn = document.getElementById('change-directory-btn');
        const newFolderBtn = document.getElementById('new-folder-btn');
        if (changeDirBtn) changeDirBtn.style.display = 'none';
        if (newFolderBtn) newFolderBtn.style.display = 'none';

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
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <input type="checkbox" class="citation-checkbox" value="${citation.id}" style="margin-top: 2px;">
                </div>
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
    showLoading(message = 'Loading...') {
        const loadingState = document.getElementById('citations-loading');
        const emptyState = document.getElementById('citations-empty');
        const listState = document.getElementById('citations-list');
        
        if (loadingState) {
            loadingState.style.display = 'block';
            // Update loading message if provided
            const loadingText = loadingState.querySelector('div');
            if (loadingText && message) {
                loadingText.textContent = message;
            }
        }
        if (emptyState) emptyState.style.display = 'none';
        if (listState) listState.style.display = 'none';
    }

    // Hide loading state
    hideLoading() {
        const loadingState = document.getElementById('citations-loading');
        const emptyState = document.getElementById('citations-empty');
        const listState = document.getElementById('citations-list');
        
        if (loadingState) loadingState.style.display = 'none';
        
        // Restore appropriate state based on data
        if (this.citations && this.citations.length > 0) {
            if (listState) listState.style.display = 'block';
        } else {
            if (emptyState) emptyState.style.display = 'block';
        }
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
        console.log('[Citation Manager] showAddCitationModal called');
        this.currentEditingId = null;
        this.populateCitationForm();
        this.showModal('citation-modal-overlay');
    }

    // Show import modal
    showImportModal() {
        this.showModal('import-modal-overlay');
    }

    // View citation details
    async viewCitation(id) {
        try {
            const result = await window.electronAPI.invoke('citations-get-by-id', id);
            if (result.success) {
                this.currentEditingId = id;
                this.populateCitationForm(result.citation);
                this.showModal('citation-modal-overlay');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error viewing citation:', error);
            this.showError('Failed to load citation: ' + error.message);
        }
    }

    // Edit citation
    editCitation(id) {
        this.viewCitation(id);
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

    // ===== MODAL MANAGEMENT =====

    // Show modal dialog
    showModal(modalId) {
        console.log('[Citation Manager] showModal called with modalId:', modalId);
        const modal = document.getElementById(modalId);
        console.log('[Citation Manager] Modal element found:', !!modal);
        if (modal) {
            console.log('[Citation Manager] Making modal visible');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            
            // Focus first input if it exists
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    // Hide modal dialog
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    // Populate citation form with data (or clear for new citation)
    populateCitationForm(citation = null) {
        const form = document.getElementById('citation-form');
        if (!form) return;

        // Update modal title
        const modalTitle = document.querySelector('#citation-modal-overlay .modal-title');
        if (modalTitle) {
            modalTitle.textContent = citation ? 'Edit Citation' : 'Add Citation';
        }

        // Update save button text
        const saveBtn = document.getElementById('save-citation-btn');
        if (saveBtn) {
            saveBtn.textContent = citation ? 'Update Citation' : 'Save Citation';
        }

        // Populate form fields
        const fields = {
            'citation-title': citation?.title || '',
            'citation-authors': citation?.authors || '',
            'citation-year': citation?.publication_year || '',
            'citation-date': citation?.publication_date || '',
            'citation-journal': citation?.journal || '',
            'citation-volume': citation?.volume || '',
            'citation-issue': citation?.issue || '',
            'citation-pages': citation?.pages || '',
            'citation-publisher': citation?.publisher || '',
            'citation-doi': citation?.doi || '',
            'citation-url': citation?.url || '',
            'citation-file-path': citation?.file_path || '',
            'citation-type': citation?.citation_type || 'article',
            'citation-abstract': citation?.abstract || '',
            'citation-notes': citation?.notes || '',
            'citation-tags': citation?.tags || ''
        };

        Object.entries(fields).forEach(([fieldId, value]) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = value;
            }
        });

        // Handle favorites checkbox
        const favoriteCheckbox = document.getElementById('citation-favorite');
        if (favoriteCheckbox) {
            favoriteCheckbox.checked = citation?.is_favorite || false;
        }
    }

    // Save citation from form
    async saveCitation() {
        const form = document.getElementById('citation-form');
        if (!form) return;

        try {
            // Collect form data
            const formData = new FormData(form);
            const citationData = {
                title: formData.get('title'),
                authors: formData.get('authors'),
                publication_year: formData.get('year') ? parseInt(formData.get('year')) : null,
                publication_date: formData.get('date') || null,
                journal: formData.get('journal') || null,
                volume: formData.get('volume') || null,
                issue: formData.get('issue') || null,
                pages: formData.get('pages') || null,
                publisher: formData.get('publisher') || null,
                doi: formData.get('doi') || null,
                url: formData.get('url') || null,
                file_path: formData.get('file_path') || null,
                citation_type: formData.get('type') || 'article',
                abstract: formData.get('abstract') || null,
                notes: formData.get('notes') || null,
                tags: formData.get('tags') || null,
                is_favorite: formData.get('favorite') === 'on'
            };

            // Validate required fields
            if (!citationData.title?.trim()) {
                throw new Error('Title is required');
            }

            let result;
            if (this.currentEditingId) {
                // Update existing citation
                result = await window.electronAPI.invoke('citations-update', this.currentEditingId, citationData);
            } else {
                // Add new citation
                result = await window.electronAPI.invoke('citations-add', citationData);
            }

            if (result.success) {
                this.hideModal('citation-modal-overlay');
                this.showSuccess(this.currentEditingId ? 'Citation updated successfully' : 'Citation added successfully');
                await this.refreshCitations();
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('[Citation Manager] Error saving citation:', error);
            this.showError('Failed to save citation: ' + error.message);
        }
    }

    // Browse for file
    async browseFile() {
        try {
            const result = await window.electronAPI.invoke('dialog-open-file', {
                title: 'Select Citation File',
                filters: [
                    { name: 'All Files', extensions: ['*'] },
                    { name: 'PDF Files', extensions: ['pdf'] },
                    { name: 'Documents', extensions: ['doc', 'docx', 'txt', 'rtf'] }
                ]
            });

            if (result.success && result.filePath) {
                const filePathField = document.getElementById('citation-file-path');
                if (filePathField) {
                    filePathField.value = result.filePath;
                }
            }
        } catch (error) {
            console.error('[Citation Manager] Error browsing file:', error);
            this.showError('Failed to browse file: ' + error.message);
        }
    }

    // ===== IMPORT FUNCTIONALITY =====

    // Import from URL
    async importFromURL() {
        const urlInput = document.getElementById('import-url');
        if (!urlInput?.value?.trim()) {
            this.showError('Please enter a URL');
            return;
        }

        try {
            const result = await window.electronAPI.invoke('citations-import-url', urlInput.value.trim());
            if (result.success) {
                this.hideModal('import-modal-overlay');
                this.showSuccess('Citation imported from URL successfully');
                await this.refreshCitations();
                urlInput.value = '';
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error importing from URL:', error);
            this.showError('Failed to import from URL: ' + error.message);
        }
    }

    // Import from DOI
    async importFromDOI() {
        const doiInput = document.getElementById('import-doi');
        if (!doiInput?.value?.trim()) {
            this.showError('Please enter a DOI');
            return;
        }

        try {
            const result = await window.electronAPI.invoke('citations-import-doi', doiInput.value.trim());
            if (result.success) {
                this.hideModal('import-modal-overlay');
                this.showSuccess('Citation imported from DOI successfully');
                await this.refreshCitations();
                doiInput.value = '';
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error importing from DOI:', error);
            this.showError('Failed to import from DOI: ' + error.message);
        }
    }

    // Show Zotero config modal
    showZoteroConfig() {
        this.hideModal('import-modal-overlay');
        this.showModal('zotero-modal-overlay');
        
        // Load saved credentials into the form
        this.loadZoteroCredentials();
    }
    
    // Load saved Zotero credentials into form fields
    loadZoteroCredentials() {
        const savedApiKey = localStorage.getItem('zotero-api-key');
        const savedUserId = localStorage.getItem('zotero-user-id');
        const savedCollectionId = localStorage.getItem('zotero-collection-id');
        
        const apiKeyField = document.getElementById('zotero-api-key');
        const userIdField = document.getElementById('zotero-user-id');
        const collectionField = document.getElementById('zotero-collection');
        
        if (apiKeyField && savedApiKey) {
            apiKeyField.value = savedApiKey;
        }
        
        if (userIdField && savedUserId) {
            userIdField.value = savedUserId;
        }
        
        if (collectionField && savedCollectionId) {
            collectionField.value = savedCollectionId;
        }
        
        console.log('[Citation Manager] Loaded saved Zotero credentials');
    }

    // Save Zotero configuration
    async saveZoteroConfig() {
        const apiKeyField = document.getElementById('zotero-api-key');
        const userIdField = document.getElementById('zotero-user-id');

        if (!apiKeyField?.value?.trim() || !userIdField?.value?.trim()) {
            this.showError('Please enter both API key and User ID');
            return;
        }

        try {
            // Store Zotero configuration (you might want to use electron-store or similar)
            localStorage.setItem('zotero-api-key', apiKeyField.value.trim());
            localStorage.setItem('zotero-user-id', userIdField.value.trim());

            this.hideModal('zotero-modal-overlay');
            this.showSuccess('Zotero configuration saved');
        } catch (error) {
            console.error('[Citation Manager] Error saving Zotero config:', error);
            this.showError('Failed to save Zotero configuration: ' + error.message);
        }
    }

    // Export selected citations to Zotero
    async exportToZotero() {
        try {
            // Get selected citations
            const selectedIds = this.getSelectedCitationIds();
            if (selectedIds.length === 0) {
                this.showError('Please select citations to export to Zotero');
                return;
            }

            // Get Zotero credentials
            const apiKey = localStorage.getItem('zotero-api-key');
            const userId = localStorage.getItem('zotero-user-id');
            const collectionId = localStorage.getItem('zotero-collection-id');

            if (!apiKey || !userId) {
                this.showError('Please configure your Zotero API credentials first');
                this.showZoteroConfig();
                return;
            }

            this.showLoading(`Exporting ${selectedIds.length} citations to Zotero...`);

            const result = await window.electronAPI.invoke('citations-export-to-zotero', selectedIds, apiKey, userId, collectionId);
            
            if (result.success) {
                this.hideLoading();
                const message = `Successfully exported ${result.exportedCount} of ${result.totalRequested} citations to Zotero`;
                if (result.errors && result.errors.length > 0) {
                    console.warn('[Citation Manager] Export errors:', result.errors);
                    this.showSuccess(message + ` (${result.errors.length} failed)`);
                } else {
                    this.showSuccess(message);
                }
            } else {
                this.hideLoading();
                this.showError('Export to Zotero failed: ' + result.error);
            }

        } catch (error) {
            this.hideLoading();
            console.error('[Citation Manager] Error exporting to Zotero:', error);
            this.showError('Export to Zotero failed: ' + error.message);
        }
    }

    // Live sync with Zotero (bidirectional)
    async liveSyncWithZotero() {
        try {
            // Get Zotero credentials
            const apiKey = localStorage.getItem('zotero-api-key');
            const userId = localStorage.getItem('zotero-user-id');
            const collectionId = localStorage.getItem('zotero-collection-id');

            if (!apiKey || !userId) {
                this.showError('Please configure your Zotero API credentials first');
                this.showZoteroConfig();
                return;
            }

            this.showLoading('Performing live sync with Zotero...');

            const result = await window.electronAPI.invoke('citations-zotero-live-sync', apiKey, userId, collectionId);
            
            if (result.success) {
                this.hideLoading();
                const messages = [];
                if (result.importedFromZotero > 0) {
                    messages.push(`Imported ${result.importedFromZotero} citations from Zotero`);
                }
                if (result.exportedToZotero > 0) {
                    messages.push(`Exported ${result.exportedToZotero} citations to Zotero`);
                }
                
                if (messages.length === 0) {
                    this.showSuccess('Live sync completed - no changes detected');
                } else {
                    this.showSuccess('Live sync completed: ' + messages.join(', '));
                }
                
                // Refresh citations to show any imported items
                await this.refreshCitations();
            } else {
                this.hideLoading();
                this.showError('Live sync failed: ' + result.error);
            }

        } catch (error) {
            this.hideLoading();
            console.error('[Citation Manager] Error with live sync:', error);
            this.showError('Live sync failed: ' + error.message);
        }
    }

    // Get IDs of selected citations
    getSelectedCitationIds() {
        const checkboxes = document.querySelectorAll('.citation-checkbox:checked');
        return Array.from(checkboxes).map(cb => parseInt(cb.value));
    }

    // Toggle select/deselect all citations
    toggleSelectAll() {
        const checkboxes = document.querySelectorAll('.citation-checkbox');
        const checkedBoxes = document.querySelectorAll('.citation-checkbox:checked');
        
        // If all are selected, deselect all; otherwise select all
        const shouldSelectAll = checkedBoxes.length !== checkboxes.length;
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = shouldSelectAll;
        });
        
        console.log(`[Citation Manager] ${shouldSelectAll ? 'Selected' : 'Deselected'} all citations`);
    }

    // Sync with Zotero
    async syncWithZotero() {
        try {
            // First, try to save the current form values
            const apiKeyField = document.getElementById('zotero-api-key');
            const userIdField = document.getElementById('zotero-user-id');
            
            // If form fields exist and have values, save them first
            if (apiKeyField?.value?.trim() && userIdField?.value?.trim()) {
                localStorage.setItem('zotero-api-key', apiKeyField.value.trim());
                localStorage.setItem('zotero-user-id', userIdField.value.trim());
            }
            
            // Also save collection ID if provided
            const collectionFieldForSave = document.getElementById('zotero-collection');
            if (collectionFieldForSave?.value?.trim()) {
                localStorage.setItem('zotero-collection-id', collectionFieldForSave.value.trim());
            }
            
            // Now get the credentials from localStorage
            const apiKey = localStorage.getItem('zotero-api-key');
            const userId = localStorage.getItem('zotero-user-id');

            if (!apiKey || !userId) {
                this.showError('Please enter your Zotero API Key and User ID first');
                return;
            }
            
            // Basic validation
            if (!userId.match(/^\d+$/)) {
                this.showError('User ID should be a number (found in your Zotero profile URL)');
                return;
            }

            // Get collection ID if specified
            const collectionField = document.getElementById('zotero-collection');
            const collectionId = collectionField?.value?.trim() || null;
            
            const result = await window.electronAPI.invoke('citations-zotero-sync', apiKey, userId, collectionId);
            if (result.success) {
                this.hideModal('zotero-modal-overlay');
                this.showSuccess('Zotero sync completed successfully');
                await this.refreshCitations();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error syncing with Zotero:', error);
            this.showError('Failed to sync with Zotero: ' + error.message);
        }
    }

    // ===== EXPORT FUNCTIONALITY =====

    // Show export modal
    showExportModal() {
        this.showModal('export-modal');
    }

    // Preview export
    async previewExport() {
        try {
            const format = document.getElementById('export-format').value;
            const selection = document.querySelector('input[name="export-selection"]:checked').value;
            
            // Get citation IDs based on selection
            let citationIds = [];
            if (selection === 'all') {
                const allCitations = await window.electronAPI.invoke('citations-get', {});
                if (allCitations.success) {
                    citationIds = allCitations.citations.map(c => c.id);
                }
            } else if (selection === 'filtered') {
                citationIds = this.citations.map(c => c.id);
            } else {
                // Selected citations - not implemented yet
                this.showError('Selected citations export not yet implemented');
                return;
            }

            if (citationIds.length === 0) {
                this.showError('No citations to export');
                return;
            }

            // Get preview (first 3 citations)
            const previewIds = citationIds.slice(0, 3);
            const result = await window.electronAPI.invoke('citations-export', previewIds, format);
            
            if (result.success) {
                const previewDiv = document.getElementById('export-preview');
                const previewContent = document.getElementById('export-preview-content');
                previewContent.value = result.content;
                previewDiv.style.display = 'block';
                
                // Update button text
                const downloadBtn = document.getElementById('download-export-btn');
                downloadBtn.textContent = `Download (${citationIds.length} citations)`;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error previewing export:', error);
            this.showError('Failed to preview export: ' + error.message);
        }
    }

    // Download export
    async downloadExport() {
        try {
            const format = document.getElementById('export-format').value;
            const selection = document.querySelector('input[name="export-selection"]:checked').value;
            const destination = document.querySelector('input[name="export-destination"]:checked').value;
            
            // Get citation IDs based on selection
            let citationIds = [];
            if (selection === 'all') {
                const allCitations = await window.electronAPI.invoke('citations-get', {});
                if (allCitations.success) {
                    citationIds = allCitations.citations.map(c => c.id);
                }
            } else if (selection === 'filtered') {
                citationIds = this.citations.map(c => c.id);
            } else {
                // Selected citations - not implemented yet
                this.showError('Selected citations export not yet implemented');
                return;
            }

            if (citationIds.length === 0) {
                this.showError('No citations to export');
                return;
            }

            // Export citations based on destination
            let result;
            if (destination === 'project') {
                // Save to project directory
                result = await window.electronAPI.invoke('citations-export-to-file', citationIds, format);
            } else {
                // Download to browser
                result = await window.electronAPI.invoke('citations-export', citationIds, format);
            }
            
            if (result.success) {
                if (destination === 'project') {
                    // File saved to project directory
                    this.hideModal('export-modal');
                    this.showSuccess(`Successfully saved ${citationIds.length} citations to ${result.filePath}`);
                } else {
                    // Create download
                    const blob = new Blob([result.content], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = result.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    this.hideModal('export-modal');
                    this.showSuccess(`Successfully exported ${citationIds.length} citations`);
                }
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error downloading export:', error);
            this.showError('Failed to download export: ' + error.message);
        }
    }

    // ===== RESPONSIVE BUTTON FUNCTIONALITY =====

    // Set up responsive button behavior - only show labels when sidebar is wide
    setupResponsiveButtons() {
        console.log('[Citation Manager] Setting up responsive button monitoring...');
        
        const citationsPanel = document.getElementById('citations-pane');
        const leftSidebar = document.getElementById('left-sidebar');
        
        if (!citationsPanel || !leftSidebar) {
            console.log('[Citation Manager] Required elements not found for responsive buttons');
            return;
        }

        // Function to update button style - only add labels when significantly wider
        const updateButtonStyle = () => {
            const sidebarWidth = leftSidebar.offsetWidth;
            
            // Only show labels when sidebar is widened beyond 350px
            if (sidebarWidth > 350) {
                if (!citationsPanel.classList.contains('sidebar-wide')) {
                    citationsPanel.classList.add('sidebar-wide');
                    console.log('[Citation Manager] Sidebar widened - showing button labels');
                }
            } else {
                if (citationsPanel.classList.contains('sidebar-wide')) {
                    citationsPanel.classList.remove('sidebar-wide');
                    console.log('[Citation Manager] Sidebar narrowed - hiding button labels');
                }
            }
        };

        // Initial check
        updateButtonStyle();

        // Monitor for sidebar resize using ResizeObserver
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                updateButtonStyle();
            });
            resizeObserver.observe(leftSidebar);
        } else {
            // Fallback for older browsers
            setInterval(updateButtonStyle, 1000);
        }
    }
}

// Create global instance
const citationManager = new CitationManager();

// Export for global access
window.citationManager = citationManager;

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[Citation Manager] DOM loaded, setting up event listeners');
        citationManager.setupEventListeners();
    });
} else {
    console.log('[Citation Manager] DOM already loaded, setting up event listeners');
    setTimeout(() => {
        citationManager.setupEventListeners();
    }, 100);
}