// === AI Service IPC Handlers ===
// Handles all AI-related IPC communication

const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');

/**
 * Register all AI service IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    appSettings,
    mainWindow,
    aiService,
    currentFilePath,
    buildSystemMessage,
    cleanAIResponse
  } = deps;

  // Helper function to check if context has changed significantly
  function hasContextChanged(currentText, lastText, currentFiles, lastFiles, currentTimestamps, lastTimestamps) {
    // Simple change detection - can be enhanced
    if (!lastText || !lastFiles || !lastTimestamps) return true;
    
    const textChanged = currentText !== lastText;
    const filesChanged = JSON.stringify(currentFiles) !== JSON.stringify(lastFiles);
    const timestampsChanged = JSON.stringify(currentTimestamps) !== JSON.stringify(lastTimestamps);
    
    return textChanged || filesChanged || timestampsChanged;
  }

  // AI Chat handlers
  ipcMain.handle('send-chat-message', async (event, userMessage, assistantConfig) => {
    if (!aiService || aiService.getAvailableProviders().length === 0) {
      console.error('[AIHandlers] AI Service not available. Cannot send chat message.');
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
      console.error('[AIHandlers] Invalid user message received.');
      return { error: 'Invalid message format.' };
    }
    console.log(`[AIHandlers] 🤖 Received chat message of ${userMessage.length} characters`);
    
    try {
      // Apply AI assistant configuration or fallback to saved AI settings
      const aiSettings = appSettings.ai || {};
      const finalConfig = assistantConfig ? {
        ...aiSettings,
        ...assistantConfig,
        preferredProvider: (assistantConfig.provider && assistantConfig.provider !== 'auto' && assistantConfig.provider !== 'default') ? assistantConfig.provider : aiSettings.preferredProvider,
        preferredModel: (assistantConfig.model && assistantConfig.model !== 'auto' && assistantConfig.model !== 'default') ? assistantConfig.model : aiSettings.preferredModel,
        systemMessage: assistantConfig.systemMessage || await buildSystemMessage(aiSettings)
      } : aiSettings;

      const options = {
        provider: (finalConfig.preferredProvider && finalConfig.preferredProvider !== 'auto' && finalConfig.preferredProvider !== 'default') ? finalConfig.preferredProvider : undefined,
        model: (finalConfig.preferredModel && finalConfig.preferredModel !== 'auto' && finalConfig.preferredModel !== 'default') ? finalConfig.preferredModel : undefined,
        systemMessage: finalConfig.systemMessage || await buildSystemMessage(aiSettings),
        newConversation: finalConfig.conversationMode === 'isolated',
        settings: aiSettings
      };
      
      const response = await aiService.sendMessage(userMessage, options);
      console.log(`[AIHandlers] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');
      
      return {
        response: cleanAIResponse(response.response),
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      console.error('[AIHandlers] Error in send-chat-message:', error);
      return { error: error.message || 'An error occurred while processing your request.' };
    }
  });

  ipcMain.handle('send-chat-message-with-options', async (event, userMessage, options = {}) => {
    if (!aiService || aiService.getAvailableProviders().length === 0) {
      console.error('[AIHandlers] AI Service not available. Cannot send chat message.');
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    console.log('[AIHandlers] ----------- MESSAGE PREVIEW START -----------');
    console.log('[AIHandlers] Message length:', userMessage.length, 'characters');
    console.log('[AIHandlers] Message preview:', userMessage.substring(0, 200) + (userMessage.length > 200 ? '...' : ''));
    console.log('[AIHandlers] Options:', JSON.stringify(options, null, 2));
    console.log('[AIHandlers] ----------- MESSAGE PREVIEW END -----------');
    
    try {
      const response = await aiService.sendMessage(userMessage, options);
      console.log(`[AIHandlers] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');
      
      return {
        response: cleanAIResponse(response.response),
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      console.error('[AIHandlers] Error in send-chat-message-with-options:', error);
      return { error: error.message || 'An error occurred while processing your request.' };
    }
  });

  ipcMain.handle('ai-chat', async (event, data) => {
    const { message, options = {} } = data;
    
    if (!aiService || aiService.getAvailableProviders().length === 0) {
      console.error('[AIHandlers] AI Service not available. Cannot send ai-chat message.');
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    console.log('[AIHandlers] AI Chat request received');
    console.log('[AIHandlers] Message length:', message?.length || 0);
    console.log('[AIHandlers] AI Chat options:', options);
    
    try {
      // Ensure settings are passed to the AI service
      const aiSettings = appSettings.ai || {};
      
      // Determine which assistant to use (default to 'ash' for writing companion)
      const assistantKey = options.assistant || 'ash';
      let finalOptions = { ...options };
      
      // Apply assistant-specific settings if available
      if (aiSettings.assistants && aiSettings.assistants[assistantKey] && aiSettings.assistants[assistantKey].aiSettings) {
        const assistantSettings = aiSettings.assistants[assistantKey].aiSettings;
        
        // Apply provider and model from assistant settings if not already specified
        if (!finalOptions.provider && assistantSettings.provider) {
          finalOptions.provider = assistantSettings.provider;
        }
        if (!finalOptions.model && assistantSettings.model) {
          finalOptions.model = assistantSettings.model;
        }
        if (!finalOptions.temperature && assistantSettings.temperature) {
          finalOptions.temperature = assistantSettings.temperature;
        }
        if (!finalOptions.maxTokens && assistantSettings.maxTokens) {
          finalOptions.maxTokens = assistantSettings.maxTokens;
        }
        
        console.log(`[AIHandlers] Using assistant '${assistantKey}' with provider: ${finalOptions.provider}, model: ${finalOptions.model}`);
      }
      
      // Always pass settings to the AI service
      finalOptions.settings = aiSettings;
      
      const response = await aiService.sendMessage(message, finalOptions);
      console.log(`[AIHandlers] AI Chat response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');
      
      return {
        response: cleanAIResponse(response.response),
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        confidence: response.confidence || 0.8
      };
    } catch (error) {
      console.error('[AIHandlers] Error in ai-chat:', error);
      return { error: error.message || 'An error occurred while processing your request.' };
    }
  });

  ipcMain.handle('send-chat-message-with-context', async (event, data) => {
    const { message, fileContext, currentFile, assistantConfig } = data;
    
    if (!aiService || aiService.getAvailableProviders().length === 0) {
      console.error('[AIHandlers] AI Service not available. Cannot send chat message.');
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    console.log('[AIHandlers] Context-aware chat request received');
    console.log('[AIHandlers] Message:', message.substring(0, 100) + '...');
    console.log('[AIHandlers] Current file:', currentFile);
    console.log('[AIHandlers] File context provided:', !!fileContext);

    try {
      // Apply AI assistant configuration
      const aiSettings = appSettings.ai || {};
      const finalConfig = assistantConfig ? {
        ...aiSettings,
        ...assistantConfig,
        preferredProvider: (assistantConfig.provider && assistantConfig.provider !== 'auto' && assistantConfig.provider !== 'default') ? assistantConfig.provider : aiSettings.preferredProvider,
        preferredModel: (assistantConfig.model && assistantConfig.model !== 'auto' && assistantConfig.model !== 'default') ? assistantConfig.model : aiSettings.preferredModel
      } : aiSettings;

      let enhancedPrompt = message;
      
      // Add file context if provided and significant
      if (fileContext && Object.keys(fileContext).length > 0) {
        const contextEntries = Object.entries(fileContext)
          .filter(([_, content]) => content && content.length > 100)
          .map(([file, content]) => `### ${path.basename(file)}\n${content.substring(0, 2000)}${content.length > 2000 ? '\n[... truncated ...]' : ''}`)
          .slice(0, 5); // Limit to 5 files

        if (contextEntries.length > 0) {
          enhancedPrompt = `${message}\n\n## Relevant File Context\n\n${contextEntries.join('\n\n')}`;
          console.log('[AIHandlers] Enhanced prompt with context from', contextEntries.length, 'files');
        }
      }

      const options = {
        provider: (finalConfig.preferredProvider && finalConfig.preferredProvider !== 'auto' && finalConfig.preferredProvider !== 'default') ? finalConfig.preferredProvider : undefined,
        model: (finalConfig.preferredModel && finalConfig.preferredModel !== 'auto' && finalConfig.preferredModel !== 'default') ? finalConfig.preferredModel : undefined,
        systemMessage: await buildSystemMessage(finalConfig),
        newConversation: finalConfig.conversationMode === 'isolated',
        temperature: finalConfig.temperature,
        maxTokens: finalConfig.maxTokens
      };
      
      const response = await aiService.sendMessage(enhancedPrompt, options);
      console.log(`[AIHandlers] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');
      
      return {
        response: cleanAIResponse(response.response),
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      console.error('[AIHandlers] Error in send-chat-message-with-context:', error);
      return { error: error.message || 'An error occurred while processing your request.' };
    }
  });

  // AI Provider Management
  ipcMain.handle('get-available-ai-providers', async (event) => {
    if (!aiService) {
      return { providers: [], defaultProvider: null };
    }
    
    try {
      return {
        providers: aiService.getAvailableProviders(),
        defaultProvider: aiService.getDefaultProvider()
      };
    } catch (error) {
      console.error('[AIHandlers] Error getting available providers:', error);
      return { providers: [], defaultProvider: null };
    }
  });

  ipcMain.handle('get-current-ai-config', async (event) => {
    if (!aiService) {
      return { success: false, error: 'AI Service not available' };
    }
    
    try {
      // Get the base configuration from AI service
      const baseConfig = aiService.getCurrentConfiguration();
      
      // Override with user's saved settings
      const aiSettings = appSettings.ai || {};
      
      let actualProvider = baseConfig.provider;
      let actualModel = baseConfig.model;
      
      if (aiSettings.preferredProvider && aiSettings.preferredProvider !== 'auto') {
        // User has selected a specific provider
        if (aiService.getAvailableProviders().includes(aiSettings.preferredProvider)) {
          actualProvider = aiSettings.preferredProvider;
          
          // Use the user's selected model for this provider
          if (aiSettings.preferredModel && aiSettings.preferredModel !== 'auto') {
            actualModel = aiSettings.preferredModel;
          } else {
            // Use default model for the selected provider
            actualModel = aiService.getDefaultModelForProvider(actualProvider);
          }
        }
      }
      
      return {
        success: true,
        provider: actualProvider,
        model: actualModel,
        availableProviders: baseConfig.availableProviders,
        availableModels: actualProvider ? aiService.getProviderModels(actualProvider) : [],
        settings: {
          preferredProvider: aiSettings.preferredProvider || 'auto',
          preferredModel: aiSettings.preferredModel || 'auto',
          temperature: aiSettings.temperature || 0.7,
          maxTokens: aiSettings.maxTokens || 2000,
          systemPromptSource: aiSettings.systemPromptSource || 'default',
          customSystemPrompt: aiSettings.customSystemPrompt || '',
          systemPromptFile: aiSettings.systemPromptFile || '',
          enableContextAwareness: aiSettings.enableContextAwareness !== false,
          maxContextFiles: aiSettings.maxContextFiles || 5,
          enableWritingCompanion: aiSettings.enableWritingCompanion !== false,
          localAIUrl: aiSettings.localAIUrl || 'http://localhost:1234/'
        }
      };
    } catch (error) {
      console.error('[AIHandlers] Error getting current AI config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-default-ai-provider', async (event) => {
    if (!aiService) {
      return null;
    }
    
    try {
      return aiService.getDefaultProvider();
    } catch (error) {
      console.error('[AIHandlers] Error getting default provider:', error);
      return null;
    }
  });

  ipcMain.handle('get-provider-models', async (event, provider) => {
    if (!aiService) {
      return { models: [] };
    }
    
    try {
      const models = aiService.getProviderModels(provider);
      return { models };
    } catch (error) {
      console.error('[AIHandlers] Error getting provider models:', error);
      return { models: [] };
    }
  });

  ipcMain.handle('set-default-ai-provider', async (event, provider) => {
    if (!aiService) {
      return { success: false, error: 'AI Service not available' };
    }
    
    try {
      aiService.setDefaultProvider(provider);
      return { success: true };
    } catch (error) {
      console.error('[AIHandlers] Error setting default provider:', error);
      return { success: false, error: error.message };
    }
  });

  // Conversation Management
  ipcMain.handle('ai-clear-conversation', async (event) => {
    if (!aiService) {
      return { error: 'AI Service not available' };
    }
    
    try {
      aiService.clearConversation();
      return { success: true, message: 'Conversation cleared' };
    } catch (error) {
      console.error('[AIHandlers] Error clearing conversation:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('ai-restart-conversation', async (event, systemMessage) => {
    if (!aiService) {
      return { error: 'AI Service not available' };
    }
    
    try {
      aiService.restartConversation(systemMessage);
      return { success: true, message: 'Conversation restarted' };
    } catch (error) {
      console.error('[AIHandlers] Error restarting conversation:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('ai-get-conversation-history', async (event) => {
    if (!aiService) {
      return { error: 'AI Service not available' };
    }
    
    try {
      const history = aiService.getConversationHistory();
      return { success: true, history };
    } catch (error) {
      console.error('[AIHandlers] Error getting conversation history:', error);
      return { error: error.message };
    }
  });

  // AI Service Testing
  ipcMain.handle('test-ai-service', async (event) => {
    console.log('[AIHandlers] Testing AI service...');
    
    if (!aiService) {
      return { success: false, error: 'AI Service not initialized' };
    }
    
    console.log('[AIHandlers] Available providers:', aiService.getAvailableProviders());
    console.log('[AIHandlers] Default provider:', aiService.getDefaultProvider());
    
    try {
      const testMessage = 'Hello, this is a test message. Please respond with "Test successful".';
      console.log('[AIHandlers] Sending test message...');
      
      const response = await aiService.sendMessage(testMessage);
      console.log('[AIHandlers] Test response received:', response);
      
      return { 
        success: true, 
        response: response.response,
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      console.error('[AIHandlers] Test failed:', error);
      return { 
        success: false, 
        error: error.message,
        providers: aiService.getAvailableProviders()
      };
    }
  });

  // Text Summarization
  ipcMain.handle('summarize-text-to-notes', async (event, selectedText) => {
    if (!aiService || aiService.getAvailableProviders().length === 0) {
      console.error('[AIHandlers] AI Service not available. Cannot summarize text.');
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    if (!selectedText || typeof selectedText !== 'string' || selectedText.trim() === '') {
      return { error: 'No text selected for summarization.' };
    }

    const prompt = `Generate a concise H3 heading (###) and summarize the following text into 3-5 bullet points suitable for ONE presentation slide.

${selectedText}

STRICT FORMATTING REQUIREMENTS:
- Start with a short, descriptive H3 heading using ### (5-8 words maximum). Make sure to include the '###'.
- Follow with 3-5 bullet points using dashes (- symbol)
- Each bullet point must be ONE line only
- NO sub-bullets, NO tables, NO complex formatting
- NO other markdown formatting (no **bold**, no links, no code blocks)
- Each bullet point should be 10-15 words maximum
- Focus on the most important takeaways only

Example format:
### Machine Learning Fundamentals

- Main concept or theme
- Key finding or argument  
- Important implication
- Practical application
- Conclusion

Generate the heading and bullet points only, nothing else.`;

    console.log(`[AIHandlers] Summarizing ${selectedText.length} chars: "${selectedText.substring(0, 100)}..."`);
    console.log(`[AIHandlers] Prompt being sent to AI:`, prompt.substring(0, 300) + '...');

    try {
      // Use Ash's specific settings for summarization
      const ashSettings = appSettings.ai?.assistants?.ash?.aiSettings || {};
      console.log(`[AIHandlers] Using Ash settings for summarization:`, ashSettings);
      
      let provider = ashSettings.provider;
      let model = ashSettings.model;
      
      // Fallback to general AI settings if Ash settings not available
      if (!provider || provider === 'auto' || provider === 'default') {
        const generalSettings = appSettings.ai || {};
        provider = generalSettings.preferredProvider !== 'auto' ? generalSettings.preferredProvider : undefined;
        model = generalSettings.preferredModel !== 'auto' ? generalSettings.preferredModel : undefined;
        console.log(`[AIHandlers] Falling back to general settings: provider=${provider}, model=${model}`);
      }

      const systemMessage = await buildSystemMessage(ashSettings);
      
      const response = await aiService.sendMessage(prompt, {
        provider,
        model,
        systemMessage,
        temperature: 0.3, // Lower temperature for more focused summaries
        maxTokens: 1000
      });

      console.log(`[AIHandlers] Summary generated using ${response.provider} (${response.model})`);

      return {
        success: true,
        summary: cleanAIResponse(response.response),
        provider: response.provider,
        model: response.model,
        originalLength: selectedText.length,
        summaryLength: response.response?.length || 0
      };
    } catch (error) {
      console.error('[AIHandlers] Error summarizing text:', error);
      return { error: error.message || 'An error occurred while summarizing the text.' };
    }
  });

  // System Prompt File Browser
  ipcMain.handle('browse-system-prompt-file', async (event) => {
    if (!mainWindow) {
      return { success: false, error: 'No main window available' };
    }

    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select System Prompt File',
        properties: ['openFile'],
        filters: [
          { name: 'Text Files', extensions: ['txt', 'md'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, cancelled: true };
      }

      const filePath = result.filePaths[0];
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        return {
          success: true,
          filePath,
          content,
          fileName: path.basename(filePath)
        };
      } catch (readError) {
        console.error('[AIHandlers] Error reading system prompt file:', readError);
        return { success: false, error: `Could not read file: ${readError.message}` };
      }
    } catch (error) {
      console.error('[AIHandlers] Error browsing system prompt file:', error);
      return { success: false, error: error.message };
    }
  });

  // Extract notes content from text
  ipcMain.handle('extract-notes-content', async (_event, selectedText) => {
    if (!selectedText || typeof selectedText !== 'string' || selectedText.trim() === '') {
      return { error: 'No text provided for notes extraction.' };
    }

    console.log(`[AIHandlers] Extracting notes content from ${selectedText.length} characters of text`);
    console.log(`[AIHandlers] Selected text (full):`, JSON.stringify(selectedText));

    try {
      // Look for ```notes blocks that contain speaker notes
      // Try multiple pattern variations to handle different formatting
      const notesBlockPatterns = [
        /```notes\s*\n([\s\S]*?)\n\s*```/g,  // Standard format with newlines
        /```notes\n([\s\S]*?)\n```/g,        // Strict format  
        /```notes\s+([\s\S]*?)\s+```/g,      // With spaces around content
        /```notes([\s\S]*?)```/g,            // No newlines/spaces required
        /```notes\s*([^\n]*?)\s*```/g,       // Single line format
      ];
      
      let extractedNotes = [];
      let blocksFound = 0;

      // Try each pattern
      console.log(`[AIHandlers] Trying ${notesBlockPatterns.length} different patterns...`);
      
      for (let i = 0; i < notesBlockPatterns.length; i++) {
        const pattern = notesBlockPatterns[i];
        console.log(`[AIHandlers] Testing pattern ${i + 1}:`, pattern.source);
        
        // Reset regex lastIndex to ensure fresh matching
        pattern.lastIndex = 0;
        
        const matches = [...selectedText.matchAll(pattern)];
        console.log(`[AIHandlers] Pattern ${i + 1} found ${matches.length} matches`);
        
        matches.forEach((match, j) => {
          console.log(`[AIHandlers] Match ${j + 1}:`, match);
          const noteContent = match[1]?.trim();
          console.log(`[AIHandlers] Extracted note content:`, JSON.stringify(noteContent));
          
          if (noteContent && noteContent.length > 0) {
            extractedNotes.push({
              content: noteContent,
              type: 'speaker-notes',
              position: match.index
            });
            blocksFound++;
          }
        });
        
        // If we found matches with this pattern, stop trying others
        if (blocksFound > 0) {
          console.log(`[AIHandlers] Pattern ${i + 1} worked! Found ${blocksFound} blocks.`);
          break;
        }
      }
      
      console.log(`[AIHandlers] Total blocks found: ${blocksFound}`);

      // If no ```notes blocks found, also look for legacy note patterns as fallback
      if (blocksFound === 0) {
        console.log(`[AIHandlers] No [backtick]notes blocks found, trying legacy patterns...`);
        const legacyPatterns = [
          /\[Note:\s*([^\]]+)\]/gi,
          /\[NOTE:\s*([^\]]+)\]/gi,
          /\*\*Note:\*\*\s*([^\n]+)/gi,
          /Note:\s*([^\n]+)/gi,
        ];

        legacyPatterns.forEach((pattern, i) => {
          console.log(`[AIHandlers] Trying legacy pattern ${i + 1}:`, pattern.source);
          pattern.lastIndex = 0;
          const matches = [...selectedText.matchAll(pattern)];
          
          matches.forEach((match) => {
            const noteContent = match[1]?.trim();
            if (noteContent && noteContent.length > 0) {
              extractedNotes.push({
                content: noteContent,
                type: 'legacy-note',
                position: match.index
              });
              blocksFound++;
            }
          });
        });
      }

      // Sort by position in text
      extractedNotes.sort((a, b) => a.position - b.position);

      // Format the extracted notes - just return the content directly
      let extractedContent = '';
      if (extractedNotes.length > 0) {
        // For speaker notes, return the content directly without extra formatting
        extractedContent = extractedNotes.map(note => note.content).join('\n\n');
        console.log(`[AIHandlers] Final extracted content:`, JSON.stringify(extractedContent));
      } else {
        extractedContent = 'No speaker notes found in the selected text.\n\nLooking for ```notes blocks containing speaker notes.';
        console.log(`[AIHandlers] No notes found, returning fallback message`);
      }

      return {
        success: true,
        extractedContent: extractedContent,
        blocksFound,
        notes: extractedNotes
      };

    } catch (error) {
      console.error('[AIHandlers] Error extracting notes content:', error);
      return { error: `Failed to extract notes: ${error.message}` };
    }
  });

  // Document Summaries for Preview Zoom and Circle modules
  ipcMain.handle('generate-document-summaries', async (event, { content, filePath }) => {
    if (!aiService || aiService.getAvailableProviders().length === 0) {
      console.error('[AIHandlers] AI Service not available. Cannot generate document summaries.');
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    if (!content || typeof content !== 'string' || content.trim() === '') {
      console.error('[AIHandlers] No content provided for document summaries.');
      return { error: 'No content provided for summarization.' };
    }

    console.log(`[AIHandlers] 🔍 Generating document summaries for content (${content.length} chars)`);

    // Set up timeout wrapper for the entire operation (increased for local models)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Summary generation timed out after 90 seconds')), 90000);
    });

    const generateSummaries = async () => {
      try {
        // Debug: Check what settings are available
        console.log('[AIHandlers] Available AI settings:', JSON.stringify(appSettings.ai, null, 2));
        
        // Try to use Dr Chen's configured settings first
        const chenSettings = appSettings.ai?.assistants?.chen?.aiSettings;
        let provider, model, temperature, maxTokens, systemMessage;
        
        if (chenSettings) {
          console.log('[AIHandlers] Found Dr Chen settings:', JSON.stringify(chenSettings, null, 2));
          provider = chenSettings.provider !== 'auto' ? chenSettings.provider : undefined;
          model = chenSettings.model !== 'auto' ? chenSettings.model : undefined;
          temperature = chenSettings.temperature || 0.8;
          maxTokens = Math.min(chenSettings.maxTokens || 1000, 800); // Cap for summaries
          systemMessage = appSettings.ai?.assistants?.chen?.systemPrompt;
        } else {
          console.log('[AIHandlers] No Dr Chen settings found, using general AI settings');
          const aiSettings = appSettings.ai || {};
          provider = aiSettings.preferredProvider !== 'auto' ? aiSettings.preferredProvider : undefined;
          model = aiSettings.preferredModel !== 'auto' ? aiSettings.preferredModel : undefined;
          temperature = 0.3;
          maxTokens = 800;
        }
        
        console.log(`[AIHandlers] Using provider: ${provider || 'auto'}, model: ${model || 'auto'}, temperature: ${temperature}`);
      
      // Truncate content for local models to prevent context issues
      const actualProvider = provider || aiService.getDefaultProvider();
      const isLocalProvider = actualProvider === 'local' || actualProvider === 'lmstudio';
      const maxContentLength = isLocalProvider ? 2000 : 8000; // Much shorter for local models
      
      const truncatedContent = content.length > maxContentLength 
        ? content.substring(0, maxContentLength) + "\n\n[Content truncated for summarization...]"
        : content;
        
      console.log(`[AIHandlers] Content length: ${content.length}, using: ${truncatedContent.length} chars for ${actualProvider}`);

      // Create prompts for different abstraction levels
      const prompts = {
        paragraph: `Please provide a paragraph-level summary of the following document. Focus on the main ideas and key points, condensing the content while preserving the essential information:\n\n${truncatedContent}`,
        sentence: `Please provide a single-sentence summary that captures the core essence and main message of the following document:\n\n${truncatedContent}`
      };

      const summaries = {};
      
      const requestOptions = {
        provider,
        model,
        temperature,
        maxTokens: isLocalProvider ? Math.min(maxTokens, 400) : maxTokens, // Reduce tokens for local
        timeout: isLocalProvider ? 60000 : 20000, // Longer timeout for local models
        newConversation: true // Force new conversation for each request
      };
      
      // Add system message if available (for Dr Chen)
      if (systemMessage) {
        requestOptions.systemMessage = systemMessage;
      }
      
      console.log('[AIHandlers] Request options:', requestOptions);
      
      // Generate paragraph summary
      const paragraphResponse = await aiService.sendMessage(prompts.paragraph, requestOptions);
      console.log('[AIHandlers] Paragraph response:', JSON.stringify(paragraphResponse, null, 2));
      summaries.paragraph = paragraphResponse.content || paragraphResponse.response;

      // Generate sentence summary  
      const sentenceResponse = await aiService.sendMessage(prompts.sentence, {
        ...requestOptions,
        maxTokens: isLocalProvider ? 100 : 200 // Even smaller for sentence
      });
      console.log('[AIHandlers] Sentence response:', JSON.stringify(sentenceResponse, null, 2));
      summaries.sentence = sentenceResponse.content || sentenceResponse.response;

      console.log(`[AIHandlers] Final summaries - paragraph: "${summaries.paragraph?.substring(0, 100)}...", sentence: "${summaries.sentence?.substring(0, 100)}..."`);
      
      if (!summaries.paragraph || !summaries.sentence) {
        console.error('[AIHandlers] Missing summaries! paragraph:', !!summaries.paragraph, 'sentence:', !!summaries.sentence);
        return { error: 'Failed to generate summaries - responses were empty' };
      }
      
      return {
        success: true,
        paragraph: summaries.paragraph,
        sentence: summaries.sentence,
        provider: paragraphResponse.provider,
        model: paragraphResponse.model
      };

    } catch (error) {
      console.error('[AIHandlers] Error generating document summaries:', error);
      
      // Check if it's a context length error and try with even shorter content
      const errorStr = JSON.stringify(error);
      const isContextError = errorStr.includes('context length') || 
                            errorStr.includes('context overflow') || 
                            errorStr.includes('Reached context length') ||
                            error.message?.includes('context length') ||
                            error.message?.includes('context overflow');
      
      if (isContextError) {
        console.log('[AIHandlers] Context length error detected, trying with shorter content...');
        
        try {
          const veryShortContent = content.substring(0, 1200) + "\n\n[Content heavily truncated for summarization...]";
          console.log(`[AIHandlers] Retrying with ${veryShortContent.length} chars`);
          
          const fallbackConfig = {
            provider: 'auto',
            model: 'auto',
            temperature: 0.3,
            maxTokens: 200, // Very conservative
            timeout: 8000
          };
          
          const shortPrompts = {
            paragraph: `Briefly summarize this text:\n\n${veryShortContent}`,
            sentence: `One sentence summary:\n\n${veryShortContent}`
          };
          
          const paragraphResponse = await aiService.sendMessage(shortPrompts.paragraph, fallbackConfig);
          const sentenceResponse = await aiService.sendMessage(shortPrompts.sentence, {
            ...fallbackConfig,
            maxTokens: 50 // Very short for sentence summary
          });
          
          console.log('[AIHandlers] Fallback summaries generated successfully');
          
          return {
            success: true,
            paragraph: paragraphResponse.content,
            sentence: sentenceResponse.content,
            provider: paragraphResponse.provider,
            model: paragraphResponse.model,
            note: 'Content was truncated due to length constraints'
          };
        } catch (fallbackError) {
          console.error('[AIHandlers] Fallback summary generation also failed:', fallbackError);
          return { error: `Failed to generate summaries even with shorter content: ${fallbackError.message}` };
        }
      }
      
      return { error: `Failed to generate summaries: ${error.message}` };
      }
    };
    
    try {
      return await Promise.race([generateSummaries(), timeoutPromise]);
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.error('[AIHandlers] Summary generation timed out');
        return { error: 'Summary generation timed out. Please try again with shorter content.' };
      }
      throw error;
    }
  });

  // Image generation handler
  ipcMain.handle('generate-image', async (event, options) => {
    if (!aiService) {
      return { error: 'AI Service not available' };
    }
    
    console.log('[AIHandlers] 🎨 Image generation request:', {
      prompt: options.prompt?.substring(0, 100) + '...',
      size: options.size,
      provider: options.provider
    });
    
    try {
      const result = await aiService.generateImage(options.prompt, options);
      console.log('[AIHandlers] ✅ Image generated successfully');
      return result;
    } catch (error) {
      console.error('[AIHandlers] ❌ Image generation failed:', error);
      return { error: error.message };
    }
  });

  console.log('[AIHandlers] Registered 19 AI service handlers');
}

module.exports = {
  register
};