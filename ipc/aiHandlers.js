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

    console.log(`[AIHandlers] Summarizing text of ${selectedText.length} characters`);

    try {
      const prompt = `Please analyze and summarize the following text into concise, well-organized notes. Focus on the key points, main arguments, and important details. Format the output as clear, structured notes that capture the essence of the content:

${selectedText}

Please provide a concise summary with:
1. Main topic/theme
2. Key points or arguments
3. Important details or examples
4. Any conclusions or implications

Format as structured notes, not as a paragraph.`;

      const aiSettings = appSettings.ai || {};
      const systemMessage = await buildSystemMessage(aiSettings);
      
      const response = await aiService.sendMessage(prompt, {
        provider: aiSettings.preferredProvider !== 'auto' ? aiSettings.preferredProvider : undefined,
        model: aiSettings.preferredModel !== 'auto' ? aiSettings.preferredModel : undefined,
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

    try {
      // Look for note blocks like [Note: ...] or similar patterns
      const notePatterns = [
        /\[Note:\s*([^\]]+)\]/gi,
        /\[NOTE:\s*([^\]]+)\]/gi,
        /\*\*Note:\*\*\s*([^\n]+)/gi,
        /Note:\s*([^\n]+)/gi,
        /\(\*([^)]+)\*\)/gi, // Footnote-style notes
        /<!--\s*([^-]+)\s*-->/gi // HTML comments as notes
      ];

      let extractedNotes = [];
      let blocksFound = 0;

      // Extract notes using each pattern
      notePatterns.forEach((pattern, index) => {
        let match;
        while ((match = pattern.exec(selectedText)) !== null) {
          const noteContent = match[1].trim();
          if (noteContent && noteContent.length > 0) {
            extractedNotes.push({
              content: noteContent,
              type: ['bracket-note', 'bracket-note-caps', 'bold-note', 'inline-note', 'footnote', 'comment'][index],
              position: match.index
            });
            blocksFound++;
          }
        }
      });

      // Sort by position in text
      extractedNotes.sort((a, b) => a.position - b.position);

      // Format the extracted notes
      let formattedNotes = '';
      if (extractedNotes.length > 0) {
        formattedNotes = '# Extracted Notes\n\n';
        extractedNotes.forEach((note, index) => {
          formattedNotes += `${index + 1}. ${note.content}\n`;
        });
      } else {
        formattedNotes = '# No Notes Found\n\nNo note patterns were detected in the selected text.\n\nSupported patterns:\n- [Note: content]\n- **Note:** content\n- Note: content\n- (*content*)\n- <!-- content -->';
      }

      return {
        success: true,
        extractedContent: formattedNotes,
        blocksFound,
        notes: extractedNotes
      };

    } catch (error) {
      console.error('[AIHandlers] Error extracting notes content:', error);
      return { error: `Failed to extract notes: ${error.message}` };
    }
  });

  console.log('[AIHandlers] Registered 17 AI service handlers');
}

module.exports = {
  register
};