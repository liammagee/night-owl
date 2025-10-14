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
        this.lastNightowlSync = 0; // Timestamp to throttle sync
        this.currentCitationSource = 'manual'; // Track the source of the current citation being created/edited
        this.quickCaptureProcessing = false;
        this.quickCaptureStatusTimeout = null;
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
        
        // Note: Citations button click handler is now managed by renderer.js through switchStructureView
        // This integrates properly with the standard pane management system
        
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
        const yearFilter = document.getElementById('citations-year-filter');
        const sortBy = document.getElementById('citations-sort-by');
        const clearFilters = document.getElementById('clear-citation-filters');

        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => this.applyFilters(), 300));
        }
        if (typeFilter) typeFilter.addEventListener('change', () => this.applyFilters());
        if (projectFilter) projectFilter.addEventListener('change', () => this.applyFilters());
        if (yearFilter) yearFilter.addEventListener('change', () => this.applyFilters());
        if (sortBy) sortBy.addEventListener('change', () => this.applyFilters());
        if (clearFilters) clearFilters.addEventListener('click', () => this.clearFilters());

        // Advanced SQL controls
        const sqlToggle = document.getElementById('citations-advanced-toggle');
        const sqlExecute = document.getElementById('citations-sql-execute');
        const sqlInput = document.getElementById('citations-sql-input');

        if (sqlToggle) {
            sqlToggle.addEventListener('click', () => this.toggleSqlPanel());
        }
        if (sqlExecute) {
            sqlExecute.addEventListener('click', () => this.executeSqlQuery());
        }
        if (sqlInput) {
            // Support Ctrl+Enter to execute query
            sqlInput.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    this.executeSqlQuery();
                }
            });
        }

        // Modal event listeners
        this.setupModalEventListeners();

        // Quick capture controls
        this.setupQuickCapture();
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
        const deleteSelectedBtn = document.getElementById('delete-selected-citations-btn');
        const exportToZoteroBtn = document.getElementById('export-to-zotero-btn');
        const liveSyncZoteroBtn = document.getElementById('live-sync-zotero-btn');
        const refreshBtn = document.getElementById('refresh-citations-btn');
        
        console.log('[Citation Manager] Add button found:', !!addBtn);
        console.log('[Citation Manager] Import button found:', !!importBtn);
        console.log('[Citation Manager] Export button found:', !!exportBtn);
        console.log('[Citation Manager] Delete Selected button found:', !!deleteSelectedBtn);
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
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', (e) => {
                console.log('[Citation Manager] Delete Selected button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.deleteSelectedCitations();
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

    setupQuickCapture() {
        const wrapper = document.getElementById('citation-quick-capture-wrapper');
        const quickInput = document.getElementById('citation-quick-capture');
        const quickButton = document.getElementById('citation-quick-capture-btn');

        if (!quickInput || quickInput.dataset.listenersAttached === 'true') {
            return;
        }

        quickInput.dataset.listenersAttached = 'true';

        const scheduleProcess = (trigger) => {
            if (!quickInput.value.trim()) {
                this.setQuickStatus('');
                return;
            }
            this.handleQuickCaptureInput(quickInput.value, trigger);
        };

        quickInput.addEventListener('drop', (event) => {
            event.preventDefault();
            const droppedText = event.dataTransfer?.getData('text/plain') || event.dataTransfer?.getData('text');
            if (droppedText) {
                quickInput.value = droppedText;
                this.setQuickStatus('Ready — press Enter or click Add to capture.');
            }
        });

        quickInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                if (event.metaKey || event.ctrlKey || !quickInput.value.includes('\n')) {
                    event.preventDefault();
                    scheduleProcess('enter');
                }
            }
        });

        if (wrapper) {
            const addDrag = () => wrapper.classList.add('drag-over');
            const removeDrag = () => wrapper.classList.remove('drag-over');

            ['dragenter', 'dragover'].forEach(evt => {
                wrapper.addEventListener(evt, (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    addDrag();
                });
            });

            ['dragleave', 'drop'].forEach(evt => {
                wrapper.addEventListener(evt, (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeDrag();
                });
            });
        }

        if (quickButton) {
            quickButton.addEventListener('click', (event) => {
                event.preventDefault();
                scheduleProcess('button');
            });
        }

        quickInput.addEventListener('paste', () => {
            this.setQuickStatus('Press Enter or click Add to capture.');
        });
    }

    async handleQuickCaptureInput(rawText, trigger = 'manual') {
        const quickInput = document.getElementById('citation-quick-capture');
        const cleaned = (rawText || '').trim();

        if (!cleaned || this.quickCaptureProcessing) {
            if (!cleaned) {
                this.setQuickStatus('');
            } else {
                this.setQuickStatus('Still working on previous capture…', 'warning');
            }
            return;
        }

        const markdownMatch = cleaned.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i);
        const doiRegex = /\b10\.\d{4,9}\/[^\s"<>]+/i;
        const doiMatch = cleaned.match(doiRegex);
        const urlRegex = /(https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+)/i;
        let urlMatch = markdownMatch ? markdownMatch[2] : null;

        if (!urlMatch) {
            const plainUrlMatch = cleaned.match(urlRegex);
            if (plainUrlMatch) {
                urlMatch = plainUrlMatch[0];
            }
        }

        if (!doiMatch && urlMatch && /doi\.org/i.test(urlMatch)) {
            const doiFromUrl = urlMatch.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
            if (doiFromUrl) {
                const potentialDoi = doiFromUrl.match(doiRegex);
                if (potentialDoi) {
                    const extracted = potentialDoi[0];
                    // Recursively handle as DOI to leverage CrossRef metadata
                    return this.handleQuickCaptureInput(extracted, trigger);
                }
            }
        }

        const hasDoi = !!doiMatch;
        const doiValue = hasDoi ? doiMatch[0] : null;
        const sanitizedUrl = urlMatch ? this.sanitizeUrl(urlMatch) : null;
        const residualText = markdownMatch
            ? cleaned.replace(markdownMatch[0], '').trim()
            : sanitizedUrl
                ? cleaned.replace(urlRegex, '').trim()
                : cleaned;

        this.quickCaptureProcessing = true;
        this.setQuickStatus(hasDoi ? 'Looking up DOI metadata…' : sanitizedUrl ? 'Fetching page details…' : 'Processing input…');

        try {
            let response;
            if (hasDoi) {
                response = await window.electronAPI.invoke('citations-import-doi', doiValue);
            } else if (sanitizedUrl) {
                response = await window.electronAPI.invoke('citations-import-url', sanitizedUrl);
            } else {
                throw new Error('No URL or DOI detected. Paste a full link or DOI value.');
            }

            if (!response || !response.success) {
                throw new Error(response?.error || 'Unable to create citation from text.');
            }

            const created = response.citation || {};
            this.setQuickStatus(`Added “${created.title || created.url || 'Untitled citation'}”.`, 'success');
            if (quickInput) quickInput.value = '';

            await this.refreshCitationsWithSync(true); // Skip nightowl sync to avoid triggering reload
        } catch (error) {
            console.error('[Citation Manager] Quick capture failed:', error);
            if (sanitizedUrl) {
                try {
                    const fallbackTitle = (markdownMatch && markdownMatch[1]) ||
                        this.extractPotentialTitle(cleaned, sanitizedUrl) ||
                        sanitizedUrl;
                    const fallbackNotes = residualText && residualText !== sanitizedUrl ? residualText : '';
                    const fallbackData = {
                        title: fallbackTitle,
                        url: sanitizedUrl,
                        citation_type: 'webpage',
                        notes: fallbackNotes,
                        source: 'quick-capture'
                    };

                    const fallbackResponse = await window.electronAPI.invoke('citations-add', fallbackData);
                    if (fallbackResponse && fallbackResponse.success) {
                        this.setQuickStatus(`Saved basic citation for ${fallbackTitle}.`, 'warning');
                        if (quickInput) quickInput.value = '';
                        await this.refreshCitationsWithSync(true); // Skip nightowl sync to avoid triggering reload
                    } else {
                        throw new Error(fallbackResponse?.error || error.message);
                    }
                } catch (fallbackError) {
                    console.error('[Citation Manager] Fallback quick capture failed:', fallbackError);
                    this.setQuickStatus(`Could not add citation: ${fallbackError.message || fallbackError}`, 'error');
                    if (window.showNotification) {
                        window.showNotification(`Citation quick capture failed: ${fallbackError.message || fallbackError}`, 'error');
                    }
                }
            } else {
                this.setQuickStatus(`Could not add citation: ${error.message || error}`, 'error');
            }
        } finally {
            this.quickCaptureProcessing = false;
        }
    }

    setQuickStatus(message, variant = 'info') {
        const statusEl = document.getElementById('citation-quick-status');
        if (!statusEl) return;

        statusEl.classList.remove('success', 'error', 'warning');
        if (variant !== 'info' && variant) {
            statusEl.classList.add(variant);
        }
        statusEl.textContent = message || '';

        if (this.quickCaptureStatusTimeout) {
            clearTimeout(this.quickCaptureStatusTimeout);
            this.quickCaptureStatusTimeout = null;
        }

        if (message) {
            this.quickCaptureStatusTimeout = setTimeout(() => {
                statusEl.classList.remove('success', 'error', 'warning');
                statusEl.textContent = '';
                this.quickCaptureStatusTimeout = null;
            }, variant === 'error' ? 8000 : 5000);
        }
    }

    extractPotentialTitle(text, url) {
        if (!text) return '';
        let working = text;
        if (url) {
            const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedUrl, 'gi');
            working = working.replace(regex, '');
        }
        working = working.replace(/\[[^\]]+\]\([^)]+\)/g, '');
        working = working.replace(/https?:\/\/\S+/g, '');
        const firstLine = working.split('\n').map(line => line.trim()).find(line => line.length > 0);
        if (!firstLine) return '';
        return firstLine.replace(/^[•\-\*]+/, '').trim();
    }

    sanitizeUrl(url) {
        if (!url) return '';
        let normalized = url.trim();
        if (/^https?:\/\//i.test(normalized)) {
            return normalized;
        }
        if (normalized.startsWith('www.')) {
            return `https://${normalized}`;
        }
        return `https://${normalized}`;
    }

    // Set up modal event listeners
    setupModalEventListeners() {
        // Citation modal events
        const citationModal = document.getElementById('citation-modal-overlay');
        const cancelCitationBtn = document.getElementById('cancel-citation-btn');
        const browseFileBtn = document.getElementById('browse-file-btn');

        // Note: save button uses onclick handler in HTML to avoid duplicate event listeners
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

        // Browse collections button
        const browseCollectionsBtn = document.getElementById('browse-collections-btn');
        if (browseCollectionsBtn) browseCollectionsBtn.addEventListener('click', () => this.browseZoteroCollections());

        // Quick collection switcher
        const quickCollectionSelector = document.getElementById('quick-collection-selector');
        const refreshCollectionsBtn = document.getElementById('refresh-collections-btn');
        
        if (quickCollectionSelector) quickCollectionSelector.addEventListener('change', (e) => this.onQuickCollectionChange(e));
        if (refreshCollectionsBtn) refreshCollectionsBtn.addEventListener('click', () => this.refreshQuickCollections());

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

    // Show the citations panel (called by switchStructureView)

    showCitationsPanel() {
        console.log('[Citation Manager] showCitationsPanel called');

        // Note: Pane switching, button states, and UI management is now handled by switchStructureView()
        // This function now only handles citations-specific initialization

        // Set up action button event listeners now that panel is visible
        this.setupActionButtonListeners();

        // Initialize if not already done
        if (!this.isInitialized) {
            this.initialize();
        }

        // Initialize quick collection switcher
        this.initializeQuickCollectionSwitcher();
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
            this.hideLoading();
            
            // Only update year filter and sync to nightowl.bib for certain operations (not during panel switching)
            // Removed automatic sync to prevent refresh loops
            
        } catch (error) {
            console.error('[Citation Manager] Error refreshing citations:', error);
            this.hideLoading();
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
        const yearFilter = document.getElementById('citations-year-filter');
        const sortBy = document.getElementById('citations-sort-by');

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
        if (yearFilter && yearFilter.value) {
            this.currentFilters.year = yearFilter.value;
        }
        if (sortBy && sortBy.value) {
            this.currentFilters.sortBy = sortBy.value;
        }

        await this.refreshCitations();
    }

    // Clear all filters
    clearFilters() {
        const searchInput = document.getElementById('citations-search-input');
        const typeFilter = document.getElementById('citations-type-filter');
        const projectFilter = document.getElementById('citations-project-filter');
        const yearFilter = document.getElementById('citations-year-filter');
        const sortBy = document.getElementById('citations-sort-by');

        if (searchInput) searchInput.value = '';
        if (typeFilter) typeFilter.value = '';
        if (projectFilter) projectFilter.value = '';
        if (yearFilter) yearFilter.value = '';
        if (sortBy) sortBy.value = 'created_at_desc'; // Reset to default sort

        this.currentFilters = {};
        this.refreshCitations();
    }

    // Populate year filter with available years from citations
    async populateYearFilter() {
        try {
            const yearFilter = document.getElementById('citations-year-filter');
            if (!yearFilter) return;

            // Get all citations to extract years (use fresh API call for accurate data)
            const result = await window.electronAPI.invoke('citations-get', {});
            if (!result.success) return;

            const years = new Set();
            result.citations.forEach(citation => {
                if (citation.publication_year) {
                    years.add(citation.publication_year);
                }
            });

            // Clear existing options (keep "All Years")  
            const currentValue = yearFilter.value;
            yearFilter.innerHTML = '<option value="">All Years</option>';

            // Add year options sorted descending
            [...years].sort((a, b) => b - a).forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearFilter.appendChild(option);
            });
            
            // Restore previous selection if it still exists
            if (currentValue && [...years].includes(parseInt(currentValue))) {
                yearFilter.value = currentValue;
            }

        } catch (error) {
            console.error('[Citation Manager] Error populating year filter:', error);
        }
    }

    // Refresh citations after modifications (with sync)
    async refreshCitationsWithSync(skipNightowlSync = false) {
        await this.refreshCitations();
        await this.populateYearFilter();
        if (!skipNightowlSync) {
            await this.syncToNightowlBib();
        }
    }

    // Sync all citations to nightowl.bib in working directory (throttled)
    async syncToNightowlBib() {
        try {
            // Throttle to prevent excessive syncing (max once every 5 seconds)
            const now = Date.now();
            if (now - this.lastNightowlSync < 5000) {
                console.log('[Citation Manager] Skipping nightowl.bib sync - too recent');
                return;
            }
            this.lastNightowlSync = now;
            
            console.log('[Citation Manager] Syncing to nightowl.bib...');
            
            // Get all citations (no filters for complete sync) - but only if we don't have current citations
            let citationsToSync;
            if (!this.citations || this.citations.length === 0) {
                const result = await window.electronAPI.invoke('citations-get', {});
                if (!result.success || !result.citations.length) {
                    console.log('[Citation Manager] No citations to sync to nightowl.bib');
                    return;
                }
                citationsToSync = result.citations;
            } else {
                // Use existing citations data to avoid additional database call
                citationsToSync = this.citations;
            }

            // Export to nightowl.bib in working directory
            const exportResult = await window.electronAPI.invoke('citations-export-to-file', 
                citationsToSync.map(c => c.id), 
                'bibtex', 
                'nightowl.bib'
            );

            if (exportResult.success) {
                console.log(`[Citation Manager] Synced ${citationsToSync.length} citations to nightowl.bib`);
            } else {
                console.error('[Citation Manager] Failed to sync to nightowl.bib:', exportResult.error);
            }

        } catch (error) {
            console.error('[Citation Manager] Error syncing to nightowl.bib:', error);
        }
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

        // Add drag and drop functionality
        this.makeCitationDraggable(div, citation);

        return div;
    }

    // Generate a proper citation key from citation metadata
    generateCitationKey(citation) {
        // Use existing key if available
        if (citation.key && typeof citation.key === 'string') {
            return citation.key;
        }
        if (citation.citation_key && typeof citation.citation_key === 'string') {
            return citation.citation_key;
        }

        // Generate key from metadata: LastName + Year + Title
        let key = '';

        // Get first author's last name
        if (citation.authors) {
            const firstAuthor = citation.authors.split(',')[0].trim();
            const lastName = firstAuthor.split(' ').pop();
            key += lastName.replace(/[^a-zA-Z]/g, '');
        } else {
            key += 'Unknown';
        }

        // Add year
        if (citation.publication_year) {
            key += citation.publication_year;
        } else {
            key += new Date().getFullYear();
        }

        // Add first word of title
        if (citation.title) {
            const firstWord = citation.title.split(' ')[0].replace(/[^a-zA-Z]/g, '');
            if (firstWord) {
                key += firstWord;
            }
        }

        return key || `citation${citation.id}`;
    }

    // Make citation element draggable
    makeCitationDraggable(element, citation) {
        element.draggable = true;
        element.style.cursor = 'grab';

        element.addEventListener('dragstart', (e) => {
            // Generate proper citation key
            const citationKey = this.generateCitationKey(citation);
            console.log(`[Citation Drag] Starting drag for citation: ${citationKey}`);

            // Set the citation data for transfer
            const citationText = `[@${citationKey}]`;
            e.dataTransfer.setData('text/plain', citationText);
            e.dataTransfer.setData('application/x-citation-key', citationKey);
            e.dataTransfer.setData('application/x-citation-data', JSON.stringify(citation));
            e.dataTransfer.effectAllowed = 'copy';

            // Visual feedback during drag
            element.style.opacity = '0.5';
            element.style.cursor = 'grabbing';

            // Add a visual indicator
            const dragImage = document.createElement('div');
            dragImage.style.cssText = `
                position: absolute;
                top: -1000px;
                left: -1000px;
                background: #16a34a;
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 14px;
                font-weight: bold;
                pointer-events: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            dragImage.textContent = `📚 ${citationText}`;
            document.body.appendChild(dragImage);

            e.dataTransfer.setDragImage(dragImage, 60, 20);

            // Clean up drag image after a short delay
            setTimeout(() => {
                if (document.body.contains(dragImage)) {
                    document.body.removeChild(dragImage);
                }
            }, 100);
        });

        element.addEventListener('dragend', (e) => {
            const citationKey = this.generateCitationKey(citation);
            console.log(`[Citation Drag] Drag ended for citation: ${citationKey}`);

            // Reset visual state
            element.style.opacity = '';
            element.style.cursor = 'grab';
        });

        // Add hover effect to indicate draggability
        element.addEventListener('mouseenter', (e) => {
            if (!e.target.classList.contains('citation-action-btn')) {
                element.style.boxShadow = '0 2px 8px rgba(22, 163, 74, 0.3)';
                element.style.borderColor = '#16a34a';
            }
        });

        element.addEventListener('mouseleave', (e) => {
            element.style.boxShadow = '';
            element.style.borderColor = '#ddd';
        });
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
        this.currentCitationSource = 'manual'; // New citation created manually
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
                // Preserve the existing source when editing
                this.currentCitationSource = result.citation.source || 'manual';
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
                await this.refreshCitationsWithSync(true); // Skip nightowl sync to prevent app reload
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
                is_favorite: formData.get('favorite') === 'on',
                source: this.currentCitationSource
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
                await this.refreshCitationsWithSync(true); // Skip nightowl sync to prevent app reload
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
                await this.refreshCitationsWithSync(true); // Skip nightowl sync to prevent app reload
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
                await this.refreshCitationsWithSync(true); // Skip nightowl sync to prevent app reload
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

    // Browse Zotero collections
    async browseZoteroCollections() {
        try {
            const apiKey = localStorage.getItem('zotero-api-key');
            const userId = localStorage.getItem('zotero-user-id');
            
            if (!apiKey || !userId) {
                this.showError('Please enter your Zotero API credentials first');
                return;
            }

            // Show collections browser modal
            this.showModal('collections-browser-modal-overlay');
            this.showCollectionsLoading(true);

            // Fetch collections from Zotero
            const result = await window.electronAPI.invoke('citations-fetch-zotero-collections', apiKey, userId);
            
            this.showCollectionsLoading(false);

            if (result.success) {
                this.displayCollections(result.collections);
            } else {
                this.showCollectionsError(result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error browsing collections:', error);
            this.showCollectionsLoading(false);
            this.showCollectionsError('Failed to browse collections: ' + error.message);
        }
    }

    // Show/hide collections loading state
    showCollectionsLoading(show) {
        const loadingEl = document.getElementById('collections-loading');
        const listEl = document.getElementById('collections-list');
        const errorEl = document.getElementById('collections-error');
        
        if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
        if (listEl) listEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
    }

    // Show collections error
    showCollectionsError(message) {
        const loadingEl = document.getElementById('collections-loading');
        const listEl = document.getElementById('collections-list');
        const errorEl = document.getElementById('collections-error');
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (listEl) listEl.style.display = 'none';
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.innerHTML = `<p>Failed to load collections: ${message}</p>`;
        }
    }

    // Display collections in the browser
    displayCollections(collections) {
        const loadingEl = document.getElementById('collections-loading');
        const listEl = document.getElementById('collections-list');
        const errorEl = document.getElementById('collections-error');
        const containerEl = document.getElementById('collections-container');
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        if (listEl) listEl.style.display = 'block';

        if (!containerEl) return;

        // Set up entire library button
        const entireLibraryBtn = document.getElementById('select-entire-library-btn');
        if (entireLibraryBtn) {
            entireLibraryBtn.addEventListener('click', () => this.selectCollection(null, 'Entire Library'));
        }

        // Display collections
        containerEl.innerHTML = '';
        
        if (collections.length === 0) {
            containerEl.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No collections found</p>';
            return;
        }

        collections.forEach(collection => {
            const collectionBtn = document.createElement('button');
            collectionBtn.type = 'button';
            collectionBtn.className = 'btn';
            collectionBtn.style.cssText = 'width: 100%; text-align: left; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd;';
            
            collectionBtn.innerHTML = `
                <div>📁 <strong>${this.escapeHtml(collection.name)}</strong></div>
                <div style="font-size: 12px; color: #666; margin-top: 4px;">${collection.itemCount} items</div>
            `;
            
            collectionBtn.addEventListener('click', () => {
                this.selectCollection(collection.key, collection.name);
            });
            
            containerEl.appendChild(collectionBtn);
        });
    }

    // Select a collection
    selectCollection(collectionKey, collectionName) {
        // Update the collection field in the Zotero modal
        const collectionField = document.getElementById('zotero-collection');
        const collectionInfoEl = document.getElementById('selected-collection-info');
        const collectionNameEl = document.getElementById('selected-collection-name');
        const collectionItemsEl = document.getElementById('selected-collection-items');
        
        if (collectionField) {
            collectionField.value = collectionKey || '';
        }

        // Show collection info
        if (collectionInfoEl && collectionNameEl) {
            if (collectionKey) {
                collectionNameEl.textContent = collectionName;
                if (collectionItemsEl) {
                    collectionItemsEl.textContent = `Collection ID: ${collectionKey}`;
                }
                collectionInfoEl.style.display = 'block';
            } else {
                collectionNameEl.textContent = collectionName;
                if (collectionItemsEl) {
                    collectionItemsEl.textContent = 'All items in your library will be synced';
                }
                collectionInfoEl.style.display = 'block';
            }
        }

        // Save to localStorage for persistence
        if (collectionKey) {
            localStorage.setItem('zotero-collection-id', collectionKey);
        } else {
            localStorage.removeItem('zotero-collection-id');
        }

        // Close collections browser
        this.hideModal('collections-browser-modal-overlay');
        
        this.showSuccess(`Selected: ${collectionName}`);
    }

    // Utility method to escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize quick collection switcher
    async initializeQuickCollectionSwitcher() {
        const apiKey = localStorage.getItem('zotero-api-key');
        const userId = localStorage.getItem('zotero-user-id');
        
        if (!apiKey || !userId) {
            this.hideQuickCollectionSwitcher();
            return;
        }

        this.showQuickCollectionSwitcher();
        await this.loadQuickCollections();
    }

    // Show/hide quick collection switcher
    showQuickCollectionSwitcher() {
        const selector = document.getElementById('quick-collection-selector');
        const refreshBtn = document.getElementById('refresh-collections-btn');
        
        if (selector) selector.style.display = 'block';
        if (refreshBtn) refreshBtn.style.display = 'block';
    }

    hideQuickCollectionSwitcher() {
        const selector = document.getElementById('quick-collection-selector');
        const refreshBtn = document.getElementById('refresh-collections-btn');
        
        if (selector) selector.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';
    }

    // Load collections for quick switcher
    async loadQuickCollections() {
        const apiKey = localStorage.getItem('zotero-api-key');
        const userId = localStorage.getItem('zotero-user-id');
        
        if (!apiKey || !userId) return;

        try {
            const result = await window.electronAPI.invoke('citations-fetch-zotero-collections', apiKey, userId);
            
            if (result.success) {
                this.populateQuickCollectionSelector(result.collections);
            } else {
                console.warn('[Citation Manager] Failed to load quick collections:', result.error);
            }
        } catch (error) {
            console.error('[Citation Manager] Error loading quick collections:', error);
        }
    }

    // Populate the quick collection selector dropdown
    populateQuickCollectionSelector(collections) {
        const selector = document.getElementById('quick-collection-selector');
        if (!selector) return;

        // Get currently selected collection
        const savedCollectionId = localStorage.getItem('zotero-collection-id');

        // Clear existing options except first one
        selector.innerHTML = '<option value="">Entire Library</option>';

        // Add collections
        collections.forEach(collection => {
            const option = document.createElement('option');
            option.value = collection.key;
            option.textContent = `${collection.name} (${collection.itemCount})`;
            
            if (collection.key === savedCollectionId) {
                option.selected = true;
            }
            
            selector.appendChild(option);
        });

        // If no saved collection or not found, select "Entire Library"
        if (!savedCollectionId || !collections.find(c => c.key === savedCollectionId)) {
            selector.value = '';
        }
    }

    // Handle quick collection change
    async onQuickCollectionChange(event) {
        const selectedValue = event.target.value;
        const selectedOption = event.target.options[event.target.selectedIndex];
        const collectionName = selectedOption.textContent;

        // Update localStorage
        if (selectedValue) {
            localStorage.setItem('zotero-collection-id', selectedValue);
        } else {
            localStorage.removeItem('zotero-collection-id');
        }

        // Update the main Zotero modal field too
        const collectionField = document.getElementById('zotero-collection');
        if (collectionField) {
            collectionField.value = selectedValue;
        }

        // Update collection info display
        const collectionInfoEl = document.getElementById('selected-collection-info');
        const collectionNameEl = document.getElementById('selected-collection-name');
        const collectionItemsEl = document.getElementById('selected-collection-items');
        
        if (collectionInfoEl && collectionNameEl) {
            if (selectedValue) {
                collectionNameEl.textContent = collectionName.split(' (')[0]; // Remove item count
                if (collectionItemsEl) {
                    collectionItemsEl.textContent = `Collection ID: ${selectedValue}`;
                }
                collectionInfoEl.style.display = 'block';
            } else {
                collectionNameEl.textContent = 'Entire Library';
                if (collectionItemsEl) {
                    collectionItemsEl.textContent = 'All items in your library will be synced';
                }
                collectionInfoEl.style.display = 'block';
            }
        }

        console.log(`[Citation Manager] Quick collection changed to: ${collectionName}`);
        
        // Show a feedback message about the collection switch
        const feedbackMsg = selectedValue ? 
            `Switched to collection: ${collectionName.split(' (')[0]}. New imports will use this collection.` :
            'Switched to entire library. New imports will use the entire library.';
        this.showSuccess(feedbackMsg);
        
        // Note: Collection filtering will apply to new Zotero syncs/imports
        // For now, refresh to show current state
        await this.refreshCitations();
    }

    // Refresh quick collections
    async refreshQuickCollections() {
        const refreshBtn = document.getElementById('refresh-collections-btn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⟳';
        }

        try {
            await this.loadQuickCollections();
            if (refreshBtn) {
                setTimeout(() => {
                    refreshBtn.textContent = '🔄';
                    refreshBtn.disabled = false;
                }, 500);
            }
        } catch (error) {
            console.error('[Citation Manager] Error refreshing collections:', error);
            if (refreshBtn) {
                refreshBtn.textContent = '🔄';
                refreshBtn.disabled = false;
            }
        }
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
            
            // Initialize quick collection switcher now that credentials are saved
            this.initializeQuickCollectionSwitcher();
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
                await this.refreshCitationsWithSync(true); // Skip nightowl sync to prevent app reload
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

    // Delete all selected citations
    async deleteSelectedCitations() {
        try {
            // Get selected citation IDs
            const selectedIds = this.getSelectedCitationIds();
            
            if (selectedIds.length === 0) {
                this.showError('Please select citations to delete');
                return;
            }

            // Confirm deletion
            const confirmMessage = `Are you sure you want to delete ${selectedIds.length} selected citation${selectedIds.length > 1 ? 's' : ''}? This action cannot be undone.`;
            if (!confirm(confirmMessage)) {
                return;
            }

            this.showLoading(`Deleting ${selectedIds.length} citations...`);

            // Delete each citation
            let successCount = 0;
            let errorCount = 0;
            const errors = [];

            for (const id of selectedIds) {
                try {
                    const result = await window.electronAPI.invoke('citations-delete', id);
                    if (result.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        errors.push(`Citation ${id}: ${result.error}`);
                    }
                } catch (error) {
                    errorCount++;
                    errors.push(`Citation ${id}: ${error.message}`);
                }
            }

            this.hideLoading();

            // Show results
            if (errorCount === 0) {
                this.showSuccess(`Successfully deleted ${successCount} citations`);
            } else if (successCount === 0) {
                this.showError(`Failed to delete all citations. First error: ${errors[0]}`);
            } else {
                this.showSuccess(`Deleted ${successCount} citations, ${errorCount} failed`);
                console.warn('[Citation Manager] Delete errors:', errors);
            }

            // Refresh the citations list
            await this.refreshCitationsWithSync(true); // Skip nightowl sync to prevent app reload

        } catch (error) {
            this.hideLoading();
            console.error('[Citation Manager] Error deleting selected citations:', error);
            this.showError('Failed to delete citations: ' + error.message);
        }
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
            
            const result = await window.electronAPI.invoke('citations-zotero-live-sync', apiKey, userId, collectionId);
            if (result.success) {
                this.hideModal('zotero-modal-overlay');
                this.showSuccess('Zotero sync completed successfully');
                await this.refreshCitationsWithSync(true); // Skip nightowl sync to prevent app reload
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

    // ===== ADVANCED SQL FUNCTIONALITY =====

    // Toggle the SQL query panel
    toggleSqlPanel() {
        const sqlPanel = document.getElementById('citations-sql-panel');
        if (!sqlPanel) return;

        const isVisible = sqlPanel.style.display !== 'none';
        sqlPanel.style.display = isVisible ? 'none' : 'block';
        
        // Focus the input if showing
        if (!isVisible) {
            const sqlInput = document.getElementById('citations-sql-input');
            if (sqlInput) {
                setTimeout(() => sqlInput.focus(), 100);
            }
        }
        
        console.log(`[Citation Manager] SQL panel ${isVisible ? 'hidden' : 'shown'}`);
    }

    // Execute the SQL query
    async executeSqlQuery() {
        const sqlInput = document.getElementById('citations-sql-input');
        if (!sqlInput) return;

        const query = sqlInput.value.trim();
        if (!query) {
            this.showError('Please enter a SQL query');
            return;
        }

        try {
            this.showLoading('Executing SQL query...');
            
            const result = await window.electronAPI.invoke('citations-execute-sql', query);
            
            this.hideLoading();
            
            if (result.success) {
                // Display results in the citations list area
                this.displaySqlResults(result.data, query);
                this.showSuccess(`Query executed successfully - ${result.data.length} rows returned`);
            } else {
                this.showError('SQL query failed: ' + result.error);
            }
        } catch (error) {
            this.hideLoading();
            console.error('[Citation Manager] Error executing SQL:', error);
            this.showError('Failed to execute query: ' + error.message);
        }
    }

    // Display SQL query results
    displaySqlResults(data, query) {
        const citationsContainer = document.getElementById('citations-list');
        const emptyState = document.getElementById('citations-empty');
        
        if (!citationsContainer) return;

        emptyState.style.display = 'none';
        citationsContainer.style.display = 'block';
        citationsContainer.innerHTML = '';

        if (data.length === 0) {
            citationsContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #666;">
                    <div style="font-size: 14px; margin-bottom: 8px;">Query executed successfully</div>
                    <div style="font-size: 12px;">No rows returned</div>
                    <div style="font-size: 11px; font-family: monospace; background: #f5f5f5; padding: 8px; margin-top: 8px; border-radius: 4px; word-break: break-all;">
                        ${query}
                    </div>
                </div>
            `;
            return;
        }

        // Create a table-like display for the results
        const tableDiv = document.createElement('div');
        tableDiv.style.cssText = `
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            margin-bottom: 12px;
            overflow-x: auto;
        `;

        // Add query info header
        const headerDiv = document.createElement('div');
        headerDiv.style.cssText = `
            background: #f8f9fa;
            padding: 8px 12px;
            border-bottom: 1px solid #ddd;
            font-size: 11px;
            font-family: monospace;
            word-break: break-all;
        `;
        headerDiv.innerHTML = `
            <div style="color: #666; margin-bottom: 4px;">SQL Query Results (${data.length} rows):</div>
            <div style="color: #333;">${query}</div>
        `;
        tableDiv.appendChild(headerDiv);

        // Create table
        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        `;

        // Add table header
        if (data.length > 0) {
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            headerRow.style.backgroundColor = '#f8f9fa';

            Object.keys(data[0]).forEach(column => {
                const th = document.createElement('th');
                th.textContent = column;
                th.style.cssText = `
                    padding: 8px 12px;
                    border-bottom: 1px solid #ddd;
                    text-align: left;
                    font-weight: 600;
                    color: #333;
                `;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);
        }

        // Add table body
        const tbody = document.createElement('tbody');
        data.forEach((row, index) => {
            const tr = document.createElement('tr');
            if (index % 2 === 1) {
                tr.style.backgroundColor = '#f9f9f9';
            }

            Object.values(row).forEach(value => {
                const td = document.createElement('td');
                td.style.cssText = `
                    padding: 8px 12px;
                    border-bottom: 1px solid #eee;
                    vertical-align: top;
                    max-width: 200px;
                    word-break: break-word;
                `;
                
                // Handle different data types
                if (value === null) {
                    td.innerHTML = '<span style="color: #999; font-style: italic;">NULL</span>';
                } else if (typeof value === 'object') {
                    td.textContent = JSON.stringify(value);
                } else {
                    td.textContent = String(value);
                }
                
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableDiv.appendChild(table);

        citationsContainer.appendChild(tableDiv);

        // Update stats
        const statsDiv = document.getElementById('citations-stats');
        if (statsDiv) {
            statsDiv.textContent = `${data.length} rows from SQL query`;
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
