// === AI Service IPC Handlers ===
// Handles all AI-related IPC communication.
// Routes through tutor-bridge (backed by @machinespirits/tutor-core).

const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { createRuntimeWorkspaceResolver } = require('./runtimeWorkspace');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('AIHandlers');

/**
 * Register all AI service IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    appSettings,
    mainWindow,
    tutorBridge,
    imageService,
    currentFilePath,
    buildSystemMessage,
    cleanAIResponse
  } = deps;
  const getCurrentFilePath = typeof deps.getCurrentFilePath === 'function'
    ? deps.getCurrentFilePath
    : () => currentFilePath || appSettings.currentFile || null;
  const getWorkingDirectory = createRuntimeWorkspaceResolver(deps);
  const CONTEXT_FILE_EXTENSIONS = new Set(['.md', '.markdown', '.mdx', '.txt', '.text', '.bib']);
  const MAX_CONTEXT_FILES = 8;
  const MAX_CONTEXT_CHARS = 12000;

  // Helper: check if AI is available
  function aiAvailable() {
    return tutorBridge && tutorBridge.getAvailableProviders().length > 0;
  }

  function readLiveCurrentFilePath() {
    return getCurrentFilePath() || appSettings.currentFile || null;
  }

  function readLiveWorkingDirectory() {
    return getWorkingDirectory();
  }

  function isContextFile(filePath) {
    return CONTEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  async function readContextFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    return content.length > MAX_CONTEXT_CHARS
      ? `${content.slice(0, MAX_CONTEXT_CHARS)}\n[... truncated ...]`
      : content;
  }

  async function buildFileContext() {
    const currentPath = readLiveCurrentFilePath();
    const workingDirectory = readLiveWorkingDirectory();
    const baseDirectory = currentPath ? path.dirname(currentPath) : workingDirectory;

    const files = [];
    const seenPaths = new Set();

    const pushFile = async (filePath, isCurrentFile = false) => {
      if (!filePath || seenPaths.has(filePath) || !isContextFile(filePath)) {
        return;
      }

      const content = await readContextFile(filePath);
      files.push({
        name: path.basename(filePath),
        path: filePath,
        isCurrentFile,
        content
      });
      seenPaths.add(filePath);
    };

    if (currentPath && isContextFile(currentPath)) {
      try {
        await pushFile(currentPath, true);
      } catch (error) {
        console.warn('[AIHandlers] Could not read current file for context:', error.message);
      }
    }

    try {
      const entries = await fs.readdir(baseDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= MAX_CONTEXT_FILES) break;
        if (!entry.isFile()) continue;

        const filePath = path.join(baseDirectory, entry.name);
        if (seenPaths.has(filePath) || !isContextFile(filePath)) continue;

        try {
          await pushFile(filePath, false);
        } catch (error) {
          console.warn(`[AIHandlers] Skipping context file ${filePath}:`, error.message);
        }
      }
    } catch (error) {
      console.warn('[AIHandlers] Could not enumerate context directory:', error.message);
    }

    return {
      currentFilePath: currentPath,
      baseDirectory,
      files
    };
  }

  function normalizeFileContextEntries(fileContext) {
    if (!fileContext) return [];

    if (Array.isArray(fileContext.files)) {
      return fileContext.files
        .filter((file) => file && typeof file.content === 'string')
        .map((file) => ({
          name: file.name || path.basename(file.path || 'untitled'),
          content: file.content
        }));
    }

    return Object.entries(fileContext)
      .filter(([_, content]) => typeof content === 'string')
      .map(([file, content]) => ({
        name: path.basename(file),
        content
      }));
  }

  function getLocalModelMissingResponse(error, contextLabel) {
    const message = error?.message;
    const isMissingModel = error?.code === 'LOCAL_AI_NO_MODEL' ||
      (typeof message === 'string' && message.toLowerCase().includes('no models loaded'));
    if (!isMissingModel) return null;

    const friendlyMessage = error?.code === 'LOCAL_AI_NO_MODEL'
      ? error.message
      : 'Local AI has no models loaded. Load a model in the developer page or run "lms load".';

    console.warn(`[AIHandlers] ${contextLabel}: ${friendlyMessage}`);
    return { error: friendlyMessage, code: 'LOCAL_AI_NO_MODEL' };
  }

  // ============================================================================
  // Chat Handlers
  // ============================================================================

  ipcMain.handle('send-chat-message', async (event, userMessage, assistantConfig) => {
    if (!aiAvailable()) {
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
      return { error: 'Invalid message format.' };
    }

    const isExplicitRequest = assistantConfig?.explicitRequest || assistantConfig?.bypassFlowDetection;
    const requestSource = assistantConfig?.source || 'unknown';
    if (isExplicitRequest) {
      debug(`[AIHandlers] Explicit AI request from ${requestSource} - bypassing flow detection`);
    } else {
      debug(`[AIHandlers] Received chat message of ${userMessage.length} characters`);
    }

    try {
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
      };

      const response = await tutorBridge.sendMessage(userMessage, options);
      debug(`[AIHandlers] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');

      return {
        response: cleanAIResponse(response.response),
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      const localModelResponse = getLocalModelMissingResponse(error, 'send-chat-message');
      if (localModelResponse) return localModelResponse;
      console.error('[AIHandlers] Error in send-chat-message:', error);
      return { error: error.message || 'An error occurred while processing your request.' };
    }
  });

  ipcMain.handle('send-chat-message-with-options', async (event, userMessage, options = {}) => {
    if (!aiAvailable()) {
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    debug('[AIHandlers] Message length:', userMessage.length, 'characters');
    debug('[AIHandlers] Options:', JSON.stringify(options, null, 2));

    try {
      const response = await tutorBridge.sendMessage(userMessage, options);
      debug(`[AIHandlers] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');

      return {
        response: cleanAIResponse(response.response),
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      const localModelResponse = getLocalModelMissingResponse(error, 'send-chat-message-with-options');
      if (localModelResponse) return localModelResponse;
      console.error('[AIHandlers] Error in send-chat-message-with-options:', error);
      return { error: error.message || 'An error occurred while processing your request.' };
    }
  });

  ipcMain.handle('ai-chat', async (event, data) => {
    const { message, options = {} } = data;

    if (!aiAvailable()) {
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    debug('[AIHandlers] AI request received');
    debug('[AIHandlers] Message length:', message?.length || 0);

    try {
      const aiSettings = appSettings.ai || {};
      const assistantKey = options.assistant || 'ash';
      let finalOptions = { ...options };

      // Apply assistant-specific settings if available
      if (aiSettings.assistants && aiSettings.assistants[assistantKey] && aiSettings.assistants[assistantKey].aiSettings) {
        const assistantSettings = aiSettings.assistants[assistantKey].aiSettings;

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

        debug(`[AIHandlers] Using assistant '${assistantKey}' with provider: ${finalOptions.provider}, model: ${finalOptions.model}`);
      }

      const response = await tutorBridge.sendMessage(message, finalOptions);
      debug(`[AIHandlers] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');

      return {
        response: cleanAIResponse(response.response),
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        confidence: 0.8
      };
    } catch (error) {
      const localModelResponse = getLocalModelMissingResponse(error, 'ai-chat');
      if (localModelResponse) return localModelResponse;
      console.error('[AIHandlers] Error in ai-chat:', error);
      return { error: error.message || 'An error occurred while processing your request.' };
    }
  });

  ipcMain.handle('send-chat-message-with-context', async (event, data) => {
    const { message, fileContext, currentFile, assistantConfig } = data;

    if (!aiAvailable()) {
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    debug('[AIHandlers] Context-aware chat request received');

    try {
      const aiSettings = appSettings.ai || {};
      const finalConfig = assistantConfig ? {
        ...aiSettings,
        ...assistantConfig,
        preferredProvider: (assistantConfig.provider && assistantConfig.provider !== 'auto' && assistantConfig.provider !== 'default') ? assistantConfig.provider : aiSettings.preferredProvider,
        preferredModel: (assistantConfig.model && assistantConfig.model !== 'auto' && assistantConfig.model !== 'default') ? assistantConfig.model : aiSettings.preferredModel
      } : aiSettings;

      let enhancedPrompt = message;

      const normalizedContextEntries = normalizeFileContextEntries(fileContext);

      if (normalizedContextEntries.length > 0) {
        const contextEntries = normalizedContextEntries
          .filter(({ content }) => content && content.length > 100)
          .map(({ name, content }) => `### ${name}\n${content.substring(0, 2000)}${content.length > 2000 ? '\n[... truncated ...]' : ''}`)
          .slice(0, 5);

        if (contextEntries.length > 0) {
          enhancedPrompt = `${message}\n\n## Relevant File Context\n\n${contextEntries.join('\n\n')}`;
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

      const response = await tutorBridge.sendMessage(enhancedPrompt, options);
      debug(`[AIHandlers] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');

      return {
        response: cleanAIResponse(response.response),
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      const localModelResponse = getLocalModelMissingResponse(error, 'send-chat-message-with-context');
      if (localModelResponse) return localModelResponse;
      console.error('[AIHandlers] Error in send-chat-message-with-context:', error);
      return { error: error.message || 'An error occurred while processing your request.' };
    }
  });

  // ============================================================================
  // Streaming Handler (new)
  // ============================================================================

  ipcMain.handle('ai-chat-stream', async (event, data) => {
    const { message, options = {} } = data;

    if (!aiAvailable()) {
      return { error: 'AI Service not configured.' };
    }

    try {
      const stream = tutorBridge.streamMessage(message, options);

      for await (const chunk of stream) {
        if (chunk.type === 'text_delta') {
          event.sender.send('ai-chat-stream-chunk', chunk);
        } else if (chunk.type === 'done') {
          event.sender.send('ai-chat-stream-chunk', chunk);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('[AIHandlers] Streaming error:', error);
      return { error: error.message };
    }
  });

  // ============================================================================
  // Provider Management
  // ============================================================================

  ipcMain.handle('get-available-ai-providers', async (event) => {
    if (!tutorBridge) {
      return { success: false, providers: [], defaultProvider: null, error: 'AI Service not available' };
    }

    try {
      return {
        success: true,
        providers: tutorBridge.getAvailableProviders(),
        defaultProvider: tutorBridge.getDefaultProvider()
      };
    } catch (error) {
      console.error('[AIHandlers] Error getting available providers:', error);
      return { success: false, providers: [], defaultProvider: null, error: error.message };
    }
  });

  ipcMain.handle('get-tutor-core-status', async () => {
    if (!tutorBridge) {
      return {
        success: false,
        coreAvailable: false,
        providerConfigured: false,
        storageReady: false,
        providers: [],
        error: 'Tutor-core bridge not available'
      };
    }

    try {
      const status = await tutorBridge.probeLocalRuntime();
      return { success: status.ok, ...status };
    } catch (error) {
      return {
        success: false,
        coreAvailable: tutorBridge.isAvailable?.() || false,
        providerConfigured: false,
        storageReady: false,
        providers: [],
        error: error.message
      };
    }
  });

  ipcMain.handle('get-current-ai-config', async (event) => {
    if (!tutorBridge) {
      return { success: false, error: 'AI Service not available' };
    }

    try {
      const baseConfig = tutorBridge.getCurrentConfiguration();
      const aiSettings = appSettings.ai || {};

      let actualProvider = baseConfig.provider;
      let actualModel = baseConfig.model;

      if (aiSettings.preferredProvider && aiSettings.preferredProvider !== 'auto') {
        if (tutorBridge.getAvailableProviders().includes(aiSettings.preferredProvider)) {
          actualProvider = aiSettings.preferredProvider;
          if (aiSettings.preferredModel && aiSettings.preferredModel !== 'auto') {
            actualModel = aiSettings.preferredModel;
          }
        }
      }

      return {
        success: true,
        provider: actualProvider,
        model: actualModel,
        availableProviders: baseConfig.availableProviders,
        availableModels: actualProvider ? tutorBridge.getProviderModels(actualProvider) : [],
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
    if (!tutorBridge) {
      return { success: false, provider: null, error: 'AI Service not available' };
    }

    try {
      return { success: true, provider: tutorBridge.getDefaultProvider() };
    } catch (error) {
      console.error('[AIHandlers] Error getting default provider:', error);
      return { success: false, provider: null, error: error.message };
    }
  });

  ipcMain.handle('get-provider-models', async (event, provider) => {
    if (!tutorBridge) {
      return { success: false, models: [], error: 'AI Service not available' };
    }

    try {
      const models = tutorBridge.getProviderModels(provider);
      return { success: true, models };
    } catch (error) {
      console.error('[AIHandlers] Error getting provider models:', error);
      return { success: false, models: [], error: error.message };
    }
  });

  ipcMain.handle('set-default-ai-provider', async (event, provider) => {
    if (!tutorBridge) {
      return { success: false, error: 'AI Service not available' };
    }

    try {
      tutorBridge.setDefaultProvider(provider);
      return { success: true };
    } catch (error) {
      console.error('[AIHandlers] Error setting default provider:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-file-context', async () => {
    try {
      return await buildFileContext();
    } catch (error) {
      console.error('[AIHandlers] Error building file context:', error);
      return {
        currentFilePath: readLiveCurrentFilePath(),
        baseDirectory: readLiveWorkingDirectory(),
        files: [],
        error: error.message
      };
    }
  });

  ipcMain.handle('get-current-file-content', async () => {
    const filePath = readLiveCurrentFilePath();
    if (!filePath) {
      return { success: true, filePath: null, content: '' };
    }

    try {
      const content = await fs.readFile(filePath, 'utf8');
      return { success: true, filePath, content };
    } catch (error) {
      console.error('[AIHandlers] Error reading current file content:', error);
      return { success: false, filePath, content: '', error: error.message };
    }
  });

  // ============================================================================
  // Conversation Management
  // ============================================================================

  ipcMain.handle('ai-clear-conversation', async (event) => {
    if (!tutorBridge) {
      return { success: false, error: 'AI Service not available' };
    }

    try {
      tutorBridge.clearConversation();
      return { success: true, message: 'Conversation cleared' };
    } catch (error) {
      console.error('[AIHandlers] Error clearing conversation:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai-restart-conversation', async (event, systemMessage) => {
    if (!tutorBridge) {
      return { success: false, error: 'AI Service not available' };
    }

    try {
      tutorBridge.clearConversation();
      return { success: true, message: 'Conversation restarted' };
    } catch (error) {
      console.error('[AIHandlers] Error restarting conversation:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai-get-conversation-history', async (event) => {
    if (!tutorBridge) {
      return { success: false, error: 'AI Service not available' };
    }

    try {
      const history = tutorBridge.getConversationHistory();
      return { success: true, history };
    } catch (error) {
      console.error('[AIHandlers] Error getting conversation history:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // AI Service Testing
  // ============================================================================

  ipcMain.handle('test-ai-service', async (event) => {
    debug('[AIHandlers] Testing AI service...');

    if (!tutorBridge) {
      return { success: false, error: 'AI Service not initialized' };
    }

    debug('[AIHandlers] Available providers:', tutorBridge.getAvailableProviders());
    debug('[AIHandlers] Default provider:', tutorBridge.getDefaultProvider());

    try {
      const testMessage = 'Hello, this is a test message. Please respond with "Test successful".';
      const response = await tutorBridge.sendMessage(testMessage, { newConversation: true });

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
        providers: tutorBridge.getAvailableProviders()
      };
    }
  });

  // ============================================================================
  // Text Summarization
  // ============================================================================

  ipcMain.handle('summarize-text-to-notes', async (event, selectedText) => {
    if (!aiAvailable()) {
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

    debug(`[AIHandlers] Summarizing ${selectedText.length} chars`);

    try {
      const ashSettings = appSettings.ai?.assistants?.ash?.aiSettings || {};
      let provider = ashSettings.provider;
      let model = ashSettings.model;

      if (!provider || provider === 'auto' || provider === 'default') {
        const generalSettings = appSettings.ai || {};
        provider = generalSettings.preferredProvider !== 'auto' ? generalSettings.preferredProvider : undefined;
        model = generalSettings.preferredModel !== 'auto' ? generalSettings.preferredModel : undefined;
      }

      const systemMessage = await buildSystemMessage(ashSettings);

      const response = await tutorBridge.generateText(prompt, {
        provider,
        model,
        systemMessage,
        temperature: 0.3,
        maxTokens: 1000
      });

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
    const { BrowserWindow } = require('electron');
    const currentMainWindow = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

    if (!currentMainWindow) {
      return { success: false, error: 'No main window available' };
    }

    try {
      const result = await dialog.showOpenDialog(currentMainWindow, {
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
        return { success: false, error: `Could not read file: ${readError.message}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Extract notes content from text (no AI dependency)
  ipcMain.handle('extract-notes-content', async (_event, selectedText) => {
    if (!selectedText || typeof selectedText !== 'string' || selectedText.trim() === '') {
      return { error: 'No text provided for notes extraction.' };
    }

    try {
      const notesBlockPatterns = [
        /```notes\s*\n([\s\S]*?)\n\s*```/g,
        /```notes\n([\s\S]*?)\n```/g,
        /```notes\s+([\s\S]*?)\s+```/g,
        /```notes([\s\S]*?)```/g,
        /```notes\s*([^\n]*?)\s*```/g,
      ];

      let extractedNotes = [];
      let blocksFound = 0;

      for (let i = 0; i < notesBlockPatterns.length; i++) {
        const pattern = notesBlockPatterns[i];
        pattern.lastIndex = 0;
        const matches = [...selectedText.matchAll(pattern)];

        matches.forEach((match) => {
          const noteContent = match[1]?.trim();
          if (noteContent && noteContent.length > 0) {
            extractedNotes.push({ content: noteContent, type: 'speaker-notes', position: match.index });
            blocksFound++;
          }
        });

        if (blocksFound > 0) break;
      }

      // Legacy fallback
      if (blocksFound === 0) {
        const legacyPatterns = [
          /\[Note:\s*([^\]]+)\]/gi,
          /\[NOTE:\s*([^\]]+)\]/gi,
          /\*\*Note:\*\*\s*([^\n]+)/gi,
          /Note:\s*([^\n]+)/gi,
        ];

        legacyPatterns.forEach((pattern) => {
          pattern.lastIndex = 0;
          const matches = [...selectedText.matchAll(pattern)];
          matches.forEach((match) => {
            const noteContent = match[1]?.trim();
            if (noteContent && noteContent.length > 0) {
              extractedNotes.push({ content: noteContent, type: 'legacy-note', position: match.index });
              blocksFound++;
            }
          });
        });
      }

      extractedNotes.sort((a, b) => a.position - b.position);

      const extractedContent = extractedNotes.length > 0
        ? extractedNotes.map(note => note.content).join('\n\n')
        : 'No speaker notes found in the selected text.\n\nLooking for ```notes blocks containing speaker notes.';

      return { success: true, extractedContent, blocksFound, notes: extractedNotes };
    } catch (error) {
      return { error: `Failed to extract notes: ${error.message}` };
    }
  });

  // ============================================================================
  // Document Summaries
  // ============================================================================

  ipcMain.handle('generate-document-summaries', async (event, { content, filePath }) => {
    if (!aiAvailable()) {
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return { error: 'No content provided for summarization.' };
    }

    debug(`[AIHandlers] Generating document summaries for content (${content.length} chars)`);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Summary generation timed out after 90 seconds')), 90000);
    });

    const generateSummaries = async () => {
      try {
        const chenSettings = appSettings.ai?.assistants?.chen?.aiSettings;
        let provider, model, temperature, maxTokens, systemMessage;

        if (chenSettings) {
          provider = chenSettings.provider !== 'auto' ? chenSettings.provider : undefined;
          model = chenSettings.model !== 'auto' ? chenSettings.model : undefined;
          temperature = chenSettings.temperature || 0.8;
          maxTokens = Math.min(chenSettings.maxTokens || 1000, 800);
          systemMessage = appSettings.ai?.assistants?.chen?.systemPrompt;
        } else {
          const aiSettings = appSettings.ai || {};
          provider = aiSettings.preferredProvider !== 'auto' ? aiSettings.preferredProvider : undefined;
          model = aiSettings.preferredModel !== 'auto' ? aiSettings.preferredModel : undefined;
          temperature = 0.3;
          maxTokens = 800;
        }

        const actualProvider = provider || tutorBridge.getDefaultProvider();
        const isLocalProvider = actualProvider === 'local' || actualProvider === 'lmstudio';
        const maxContentLength = isLocalProvider ? 2000 : 8000;

        const truncatedContent = content.length > maxContentLength
          ? content.substring(0, maxContentLength) + "\n\n[Content truncated for summarization...]"
          : content;

        const summaries = {};
        const requestOptions = {
          provider,
          model,
          temperature,
          maxTokens: isLocalProvider ? Math.min(maxTokens, 400) : maxTokens,
          systemMessage,
        };

        const paragraphResponse = await tutorBridge.generateText(
          `Please provide a paragraph-level summary of the following document. Focus on the main ideas and key points, condensing the content while preserving the essential information:\n\n${truncatedContent}`,
          requestOptions
        );
        summaries.paragraph = paragraphResponse.content || paragraphResponse.response;

        const sentenceResponse = await tutorBridge.generateText(
          `Please provide a single-sentence summary that captures the core essence and main message of the following document:\n\n${truncatedContent}`,
          { ...requestOptions, maxTokens: isLocalProvider ? 100 : 200 }
        );
        summaries.sentence = sentenceResponse.content || sentenceResponse.response;

        if (!summaries.paragraph || !summaries.sentence) {
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
        return { error: `Failed to generate summaries: ${error.message}` };
      }
    };

    try {
      return await Promise.race([generateSummaries(), timeoutPromise]);
    } catch (error) {
      if (error.message.includes('timed out')) {
        return { error: 'Summary generation timed out. Please try again with shorter content.' };
      }
      throw error;
    }
  });

  // ============================================================================
  // Image Generation (via standalone ImageService)
  // ============================================================================

  ipcMain.handle('generate-image', async (event, options) => {
    if (!imageService || !imageService.isAvailable()) {
      return { success: false, error: 'Image generation not available (OPENAI_API_KEY required)' };
    }

    debug('[AIHandlers] Image generation request:', {
      prompt: options.prompt?.substring(0, 100) + '...',
      size: options.size,
    });

    try {
      const result = await imageService.generateImage(options.prompt, options);
      debug('[AIHandlers] Image generated successfully');
      return { success: true, ...result };
    } catch (error) {
      console.error('[AIHandlers] Image generation failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Thumbnail generation (spawns script - unchanged)
  ipcMain.handle('generate-thumbnail', async (event, options) => {
    const { spawn } = require('child_process');

    debug('[AIHandlers] Thumbnail generation request:', {
      input: options.input,
      style: options.style || 'illustration',
      size: options.size || 'medium'
    });

    return new Promise((resolve) => {
      const scriptPath = path.join(__dirname, '..', 'scripts', 'generate-thumbnail.mjs');
      const args = [scriptPath, options.input, '--json'];

      if (options.output) args.push('--output', options.output);
      if (options.style) args.push('--style', options.style);
      if (options.colorMode) args.push('--color-mode', options.colorMode);
      if (options.referenceImage) args.push('--reference', options.referenceImage);
      if (options.size) args.push('--size', options.size);
      if (options.format) args.push('--format', options.format);
      if (options.recursive) args.push('--recursive');
      if (options.synthesize) args.push('--synthesize');

      const proc = spawn('node', args, {
        timeout: 120000,
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('error', (err) => {
        resolve({ success: false, error: `Failed to run thumbnail generator: ${err.message}` });
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve({ success: true, ...result });
          } catch (parseErr) {
            resolve({ success: true, output: stdout });
          }
        } else {
          resolve({ success: false, error: stderr || `Process exited with code ${code}`, stdout });
        }
      });
    });
  });

  // Thumbnail dialog (unchanged)
  ipcMain.handle('generate-thumbnail-dialog', async (event, currentFilePath) => {
    const { BrowserWindow } = require('electron');
    const currentMainWindow = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

    if (!currentMainWindow) {
      return { success: false, error: 'No main window available' };
    }

    try {
      const choice = await dialog.showMessageBox(currentMainWindow, {
        type: 'question',
        buttons: ['Current File', 'Select File...', 'Select Folder...', 'Cancel'],
        defaultId: 0,
        cancelId: 3,
        title: 'Generate Thumbnail',
        message: 'Generate AI thumbnail for:',
        detail: currentFilePath ? `Current file: ${path.basename(currentFilePath)}` : 'Select a file or folder'
      });

      if (choice.response === 3) return { success: false, cancelled: true };

      let inputPath = null;
      let recursive = false;

      if (choice.response === 0 && currentFilePath) {
        inputPath = currentFilePath;
      } else if (choice.response === 1) {
        const result = await dialog.showOpenDialog(currentMainWindow, {
          properties: ['openFile'],
          title: 'Select Markdown File for Thumbnail',
          filters: [
            { name: 'Markdown Files', extensions: ['md'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });
        if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
        inputPath = result.filePaths[0];
      } else if (choice.response === 2) {
        const result = await dialog.showOpenDialog(currentMainWindow, {
          properties: ['openDirectory'],
          title: 'Select Folder for Thumbnail Generation'
        });
        if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
        inputPath = result.filePaths[0];
        recursive = true;
      } else {
        return { success: false, error: 'No file selected' };
      }

      const styleChoice = await dialog.showMessageBox(currentMainWindow, {
        type: 'question',
        buttons: ['Illustration', 'Photo', 'Abstract', 'Minimal', 'Cancel'],
        defaultId: 0,
        cancelId: 4,
        title: 'Thumbnail Style',
        message: 'Choose thumbnail style:'
      });

      if (styleChoice.response === 4) return { success: false, cancelled: true };

      const styles = ['illustration', 'photo', 'abstract', 'minimal'];
      const style = styles[styleChoice.response];

      return { success: true, pending: true, input: inputPath, style, recursive };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  debug('Registered AI service handlers (via tutor-bridge)');
}

module.exports = {
  register
};
