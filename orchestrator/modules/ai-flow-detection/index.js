// === AI Flow Detection Module Loader ===
// Loads and initializes all AI flow detection modules with backward compatibility

(function() {
    'use strict';

    // Module loading state
    let modulesLoaded = false;
    let loadingPromise = null;

    // Load all flow detection modules
    function loadFlowDetectionModules() {
        if (loadingPromise) return loadingPromise;

        loadingPromise = new Promise(async (resolve, reject) => {
            try {
                console.log('[AIFlowDetection] Loading modular flow detection system...');

                // Check if modules are already loaded
                if (window.TextCollectionManager && 
                    window.TypingPatternAnalyzer && 
                    window.CognitiveLoadAssessment && 
                    window.FlowStateEngine && 
                    window.InsightsEngine && 
                    window.FlowIndicatorUI && 
                    window.AIFlowDetectionManager) {
                    
                    modulesLoaded = true;
                    console.log('[AIFlowDetection] Modules already loaded');
                    resolve();
                    return;
                }

                // Load modules dynamically if not already available
                const moduleFiles = [
                    'TextCollectionManager.js',
                    'TypingPatternAnalyzer.js', 
                    'CognitiveLoadAssessment.js',
                    'FlowStateEngine.js',
                    'InsightsEngine.js',
                    'FlowIndicatorUI.js',
                    'AIFlowDetectionManager.js'
                ];

                // Load each module
                for (const moduleFile of moduleFiles) {
                    if (!isModuleLoaded(moduleFile)) {
                        await loadScript(`orchestrator/modules/ai-flow-detection/${moduleFile}`);
                        console.log(`[AIFlowDetection] Loaded ${moduleFile}`);
                    }
                }

                modulesLoaded = true;
                console.log('[AIFlowDetection] All modules loaded successfully');
                resolve();

            } catch (error) {
                console.error('[AIFlowDetection] Module loading failed:', error);
                reject(error);
            }
        });

        return loadingPromise;
    }

    // Check if a module is already loaded
    function isModuleLoaded(moduleFile) {
        const className = moduleFile.replace('.js', '');
        return window[className] !== undefined;
    }

    // Load a script dynamically
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            
            document.head.appendChild(script);
        });
    }

    // Initialize the AI Flow Detection system
    async function initializeFlowDetection(aiCompanion = null, gamification = null) {
        try {
            // Ensure modules are loaded
            await loadFlowDetectionModules();

            // Create the flow detection manager
            const flowDetectionManager = new AIFlowDetectionManager(aiCompanion, gamification);
            
            // Make available globally for backward compatibility
            window.aiFlowDetection = flowDetectionManager;
            
            console.log('[AIFlowDetection] System initialized successfully');
            return flowDetectionManager;

        } catch (error) {
            console.error('[AIFlowDetection] Initialization failed:', error);
            throw error;
        }
    }

    // Backward compatibility layer
    function createCompatibilityLayer() {
        // Legacy AIFlowDetection class for backward compatibility
        if (!window.AIFlowDetection) {
            window.AIFlowDetection = class LegacyAIFlowDetection {
                constructor(aiCompanion, gamification) {
                    console.warn('[AIFlowDetection] Using legacy compatibility layer. Consider updating to use AIFlowDetectionManager directly.');
                    this.manager = null;
                    this.initPromise = this.init(aiCompanion, gamification);
                }

                async init(aiCompanion, gamification) {
                    try {
                        this.manager = await initializeFlowDetection(aiCompanion, gamification);
                        
                        // Delegate properties and methods
                        this.initialized = true;
                        this.textCollection = this.manager.textCollectionManager.textCollection;
                        this.flowEngine = this.manager.flowStateEngine.flowEngine;
                        this.insightsEngine = this.manager.insightsEngine.insightsEngine;
                        
                        return this;
                    } catch (error) {
                        console.error('[AIFlowDetection] Legacy initialization failed:', error);
                        this.initialized = false;
                        throw error;
                    }
                }

                // Legacy method delegates
                updateFlowIndicator(flowScore, flowState) {
                    if (this.manager) {
                        this.manager.flowIndicatorUI.updateIndicator(flowScore, flowState);
                    }
                }

                processTextForAnalysis(text) {
                    if (this.manager) {
                        this.manager.textCollectionManager.updateRecentText(text);
                    }
                }

                async generateAIInsight() {
                    if (this.manager) {
                        return await this.manager.performFullAnalysis();
                    }
                    return null;
                }

                getState() {
                    return this.manager ? this.manager.getSystemState() : { initialized: false };
                }

                extractBriefExcerpt(text) {
                    // Simple excerpt extraction for backward compatibility
                    if (!text) return '...';
                    const cleaned = text.trim().replace(/\s+/g, ' ');
                    const words = cleaned.split(' ');
                    let excerpt = '';
                    
                    for (let i = words.length - 1; i >= 0; i--) {
                        const candidate = words.slice(i).join(' ');
                        if (candidate.length <= 30) {
                            excerpt = candidate;
                        } else {
                            break;
                        }
                    }
                    
                    if (!excerpt || excerpt.length < 10) {
                        excerpt = cleaned.slice(-30);
                    }
                    
                    if (excerpt.length < cleaned.length) {
                        excerpt = '...' + excerpt;
                    }
                    
                    return excerpt;
                }
            };
        }
    }

    // Debug utilities for development and troubleshooting
    function createDebugUtilities() {
        if (!window.flowDebug) {
            window.flowDebug = {
                // Show current flow detection state
                info: () => {
                    if (window.aiFlowDetection) {
                        console.log('[Flow Debug] System State:', window.aiFlowDetection.getDebugInfo());
                        return window.aiFlowDetection.getDebugInfo();
                    } else {
                        console.log('[Flow Debug] Flow detection not initialized');
                        return null;
                    }
                },

                // Force hide indicator
                hide: () => {
                    if (window.aiFlowDetection) {
                        window.aiFlowDetection.flowIndicatorUI.hideIndicator();
                        console.log('[Flow Debug] Indicator hidden');
                    }
                },

                // Show indicator in test state
                show: (state = 'focused') => {
                    if (window.aiFlowDetection) {
                        const score = { deep_flow: 0.9, light_flow: 0.7, focused: 0.5, struggling: 0.3, blocked: 0.1 }[state] || 0.5;
                        window.aiFlowDetection.flowIndicatorUI.showIndicator(state, score);
                        console.log(`[Flow Debug] Showing indicator in '${state}' state`);
                    }
                },

                // Generate AI insight on demand
                insight: async () => {
                    if (window.aiFlowDetection) {
                        await window.aiFlowDetection.performFullAnalysis();
                        const insights = window.aiFlowDetection.getDisplayInsights();
                        console.log('[Flow Debug] Generated insights:', insights);
                        return insights;
                    }
                    return null;
                },

                // Show text collection state
                text: () => {
                    if (window.aiFlowDetection) {
                        const textState = window.aiFlowDetection.textCollectionManager.getState();
                        console.log('[Flow Debug] Text Collection State:', textState);
                        return textState;
                    }
                    return null;
                },

                // Trigger manual analysis
                analyze: async () => {
                    if (window.aiFlowDetection) {
                        await window.aiFlowDetection.triggerAnalysis();
                        console.log('[Flow Debug] Manual analysis completed');
                    }
                },

                // Clear all analysis data
                clear: () => {
                    if (window.aiFlowDetection) {
                        window.aiFlowDetection.clearAnalysisData();
                        console.log('[Flow Debug] Analysis data cleared');
                    }
                },

                // Help command
                help: () => {
                    console.log(`
[Flow Debug] Available commands:
• flowDebug.info() - Show current system state
• flowDebug.hide() - Hide flow indicator
• flowDebug.show('state') - Show indicator (deep_flow, light_flow, focused, struggling, blocked)
• flowDebug.insight() - Generate AI insights
• flowDebug.text() - Show text collection state
• flowDebug.analyze() - Trigger manual analysis
• flowDebug.clear() - Clear analysis data
• flowDebug.help() - Show this help
                    `);
                }
            };
        }
    }

    // Auto-initialization when DOM is ready
    function autoInitialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    initializeIfReady();
                }, 1000); // Allow other systems to load first
            });
        } else {
            setTimeout(() => {
                initializeIfReady();
            }, 1000);
        }
    }

    // Initialize if dependencies are available
    async function initializeIfReady() {
        try {
            // Check for dependencies (AI companion might not be available)
            const aiCompanion = window.aiCompanionManager || null;
            const gamification = window.gamificationManager || null;
            
            // Initialize the system
            await initializeFlowDetection(aiCompanion, gamification);
            
            console.log('[AIFlowDetection] Auto-initialization completed');
            
        } catch (error) {
            console.warn('[AIFlowDetection] Auto-initialization failed:', error);
            // Don't throw - allow manual initialization later
        }
    }

    // Public API
    window.AIFlowDetectionLoader = {
        loadModules: loadFlowDetectionModules,
        initialize: initializeFlowDetection,
        isLoaded: () => modulesLoaded,
        getManager: () => window.aiFlowDetection
    };

    // Set up compatibility layer and debug utilities
    createCompatibilityLayer();
    createDebugUtilities();

    // Auto-initialize
    autoInitialize();

})();