// === AI Assistant Configuration ===
// Manages different AI assistant personalities and configurations

class AIAssistantConfig {
    constructor() {
        this.assistants = {
            // Ash - Quick, contextual writing feedback
            ash: {
                name: 'Ash',
                description: 'Quick writing companion for real-time feedback',
                persona: {
                    style: 'supportive and warm',
                    approach: 'brief and contextual',
                    voice: 'encouraging but not generic'
                },
                systemPrompt: `You are Ash, an AI writing companion focused on providing quick, contextual feedback during the writing process. 

Your role:
- Provide brief (1-2 sentences) feedback on writing as it develops
- Be supportive and encouraging while maintaining authenticity  
- Focus on the writer's immediate context and progress
- Avoid generic writing advice - be specific to what they're working on
- Help maintain writing flow without interrupting

Your style is supportive, warm, and contextually aware.`,
                
                aiSettings: {
                    provider: 'auto', // Use system default/auto-detect
                    model: 'auto',
                    temperature: 0.7,
                    maxTokens: 150, // Keep responses brief
                    timeout: 5000, // Quick responses
                    context: 'ash_writing_companion'
                },
                
                usage: 'realtime_feedback',
                triggers: ['typing', 'keyboard_shortcut', 'automatic'],
                conversationMode: 'isolated' // Fresh conversation each time
            },

            // Dr. Chen - Deep, analytical chat assistant  
            chen: {
                name: 'Dr. Chen',
                description: 'Thoughtful philosophical dialogue partner',
                persona: {
                    style: 'scholarly and insightful', 
                    approach: 'thorough and analytical',
                    voice: 'intellectually engaging and precise'
                },
                systemPrompt: `You are Dr. Chen, a thoughtful AI assistant specializing in philosophical dialogue and deep analytical thinking.

Your role:
- Engage in substantive conversations about ideas, concepts, and philosophical questions
- Provide thorough, well-reasoned responses that explore multiple perspectives
- Help develop and refine intellectual arguments and understanding
- Draw connections between concepts and broader philosophical frameworks
- Support serious academic and creative work with depth and nuance

Your style is scholarly, patient, and intellectually rigorous while remaining accessible and engaging. You take time to explore ideas fully rather than rushing to quick conclusions.`,

                aiSettings: {
                    provider: 'auto', // Could be different from Ash
                    model: 'auto', // Could use a more capable model
                    temperature: 0.8, // More creative for deeper dialogue
                    maxTokens: 1000, // Allow longer responses
                    timeout: 15000, // Allow more time for thoughtful responses
                    context: 'chen_dialogue'
                },

                usage: 'chat_dialogue',
                triggers: ['chat_interface'],
                conversationMode: 'continuous' // Maintains conversation history
            }
        };

        // Load custom configurations from settings
        this.loadAssistantSettings();
    }

    async loadAssistantSettings() {
        try {
            const settings = await window.electronAPI.invoke('get-settings');
            if (settings && settings.ai && settings.ai.assistants) {
                this.mergeCustomSettings(settings.ai.assistants);
                console.log('[AIAssistantConfig] Loaded custom settings for assistants:', Object.keys(settings.ai.assistants));
            }
        } catch (error) {
            console.warn('[AIAssistantConfig] Could not load custom assistant settings:', error);
        }
    }

    mergeCustomSettings(customSettings) {
        Object.keys(customSettings).forEach(assistantKey => {
            if (this.assistants[assistantKey]) {
                // Deep merge custom settings with defaults
                this.assistants[assistantKey] = this.deepMerge(
                    this.assistants[assistantKey], 
                    customSettings[assistantKey]
                );
                console.log(`[AIAssistantConfig] Applied custom settings for ${assistantKey}`);
            }
        });
    }

    deepMerge(target, source) {
        const result = { ...target };
        
        Object.keys(source).forEach(key => {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        });
        
        return result;
    }

    getAssistant(assistantKey) {
        return this.assistants[assistantKey] || null;
    }

    getAssistantSettings(assistantKey) {
        const assistant = this.getAssistant(assistantKey);
        return assistant ? assistant.aiSettings : null;
    }

    getSystemPrompt(assistantKey) {
        const assistant = this.getAssistant(assistantKey);
        return assistant ? assistant.systemPrompt : null;
    }

    getAllAssistants() {
        return Object.keys(this.assistants).map(key => ({
            key,
            ...this.assistants[key]
        }));
    }

    // Create AI service options for a specific assistant
    createServiceOptions(assistantKey, overrides = {}) {
        const assistant = this.getAssistant(assistantKey);
        if (!assistant) return null;

        return {
            ...assistant.aiSettings,
            systemMessage: assistant.systemPrompt,
            assistantId: assistantKey,
            assistantName: assistant.name,
            newConversation: assistant.conversationMode === 'isolated',
            ...overrides
        };
    }
}

// Make available globally
window.AIAssistantConfig = AIAssistantConfig;
window.aiAssistantConfig = new AIAssistantConfig();