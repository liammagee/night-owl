// === Refactored AI Writing Companion System Loader ===
// This file loads all the modular AI companion components

// Load the required modules in the correct order
(function() {
    'use strict';
    
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
        console.warn('[AI Companion] Not in browser environment');
        return;
    }

    // Array of module files to load in order
    const moduleFiles = [
        'ai-companion/analysis/TextAnalysisEngine.js',
        'ai-companion/context/ContextManager.js', 
        'ai-companion/feedback/FeedbackSystem.js',
        'ai-companion/AICompanionManager.js'
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
        console.log('[AI Companion] Loading refactored modules...');
        
        try {
            for (const moduleFile of moduleFiles) {
                await loadScript(basePath + moduleFile);
                console.log(`[AI Companion] Loaded: ${moduleFile}`);
            }
            
            console.log('[AI Companion] All modules loaded successfully');
            
            // The AI companion will be initialized by the gamification system
            // We just need to make the class available globally
            if (typeof AICompanionManager !== 'undefined') {
                window.AIWritingCompanion = AICompanionManager;
                console.log('[AI Companion] Refactored AI companion system ready');
            } else {
                console.error('[AI Companion] AICompanionManager not available after loading modules');
            }
            
        } catch (error) {
            console.error('[AI Companion] Failed to load modules:', error);
        }
    }

    // Auto-load modules
    loadModules();
    
})();

// Export for potential module system usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AICompanionManager };
}