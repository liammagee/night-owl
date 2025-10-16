// === Refactored Gamification System Loader ===
// This file loads all the modular gamification components

// Load the required modules in the correct order
(function() {
    'use strict';
    
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
        console.warn('[Gamification] Not in browser environment');
        return;
    }

    // Array of module files to load in order
    const moduleFiles = [
        'gamification/data/DataPersistence.js',
        'gamification/core/WritingSession.js', 
        'gamification/core/FlowState.js',
        'gamification/timers/FocusTimer.js',
        'gamification/world/LibraryWorldEngine.js',
        'gamification/world/LibraryArchitectBridge.js',
        'gamification/world/LibraryExplorerView.js',
        'gamification/GamificationManager.js'
    ];

    // Base path for modules
    const basePath = './orchestrator/modules/';
    
    // Function to load a script dynamically
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Load all modules sequentially
    async function loadModules() {
        console.log('[Gamification] Loading refactored modules...');
        
        try {
            for (const moduleFile of moduleFiles) {
                await loadScript(basePath + moduleFile);
                console.log(`[Gamification] Loaded: ${moduleFile}`);
            }
            
            console.log('[Gamification] All modules loaded successfully');
            
            // Initialize the main gamification manager
            if (typeof GamificationManager !== 'undefined') {
                window.gamification = new GamificationManager();
                window.writingGamification = window.gamification;
                window.gamificationInstance = window.gamification;
                
                // Initialize when DOM is ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        window.gamification.initialize();
                    });
                } else {
                    window.gamification.initialize();
                }
                
                console.log('[Gamification] Refactored gamification system ready');
            } else {
                console.error('[Gamification] GamificationManager not available after loading modules');
            }
            
        } catch (error) {
            console.error('[Gamification] Failed to load modules:', error);
        }
    }

    // Auto-load modules
    loadModules();
    
})();

// Provide backwards compatibility aliases for existing code
window.WritingGamification = window.GamificationManager;
