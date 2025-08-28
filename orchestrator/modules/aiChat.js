// === AI Chat Module ===

// Global variable to store attached images
let attachedImages = [];

// Utility function to clean AI responses
function cleanAIResponse(response) {
    if (!response || typeof response !== 'string') return response;
    
    const originalResponse = response;
    
    // Remove <think>...</think> tags and their content (case insensitive, multiline)
    response = response.replace(/<think>[\s\S]*?<\/think>/gi, '');
    
    // Also remove any other thinking patterns that might slip through
    response = response.replace(/\*thinking\*[\s\S]*?\*\/thinking\*/gi, '');
    response = response.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '');
    response = response.replace(/\(thinking:[\s\S]*?\)/gi, '');
    
    // Clean up extra whitespace
    response = response.trim();
    
    // Log if anything was cleaned
    if (originalResponse !== response) {
        console.log('[AI Chat] 🧹 Cleaned AI response:');
        console.log('[AI Chat] 📥 Original:', JSON.stringify(originalResponse));
        console.log('[AI Chat] 🧽 Cleaned:', JSON.stringify(response));
    }
    
    return response;
}
// Terminal-style AI Chat like Claude Code
// Features:
// - Terminal-style interface
// - File system access to plain text files
// - Command-style interactions
// - Contextual awareness of current working directory

// --- Provider/Model Display Info ---
let lastKnownProvider = null;
let lastKnownModel = null;

function updateProviderInfo(provider, model) {
    lastKnownProvider = provider;
    lastKnownModel = model;
}

function getProviderDisplayInfo() {
    if (!lastKnownProvider || !lastKnownModel) {
        return '';
    }
    
    // Format provider and model names for display
    const displayProvider = lastKnownProvider.charAt(0).toUpperCase() + lastKnownProvider.slice(1);
    let displayModel = lastKnownModel;
    
    // Simplify model names for readability
    if (displayModel.includes('claude-')) {
        displayModel = displayModel.replace('claude-', 'Claude ').replace('-20', ' (20');
        if (displayModel.includes('(20')) displayModel += ')';
    } else if (displayModel.includes('gpt-')) {
        displayModel = displayModel.replace('gpt-', 'GPT-').toUpperCase();
    } else if (displayModel.includes('llama-')) {
        displayModel = displayModel.replace('llama-', 'Llama ');
    }
    
    return `[${displayProvider}/${displayModel}]`;
}

// --- Terminal-style Chat Message Management ---
function addChatMessage(message, sender, isCommand = false, responseInfo = null, images = null) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('terminal-message', `terminal-${sender.toLowerCase()}`);
    if (isCommand) messageDiv.classList.add('terminal-command');

    const promptSpan = document.createElement('span');
    promptSpan.classList.add('terminal-prompt');
    
    if (sender === 'User') {
        promptSpan.innerHTML = '<span class="terminal-user">you</span><span class="terminal-separator">:</span> ';
    } else {
        // For AI responses, just show assistant prompt (provider info is in header)
        if (responseInfo && responseInfo.provider && responseInfo.model) {
            updateProviderInfo(responseInfo.provider, responseInfo.model);
        }
        promptSpan.innerHTML = `<span class="terminal-assistant">dr. chen</span><span class="terminal-separator">:</span> `;
    }

    const contentSpan = document.createElement('span');
    contentSpan.classList.add('terminal-content');
    
    if (sender === 'AI') {
        // Render markdown-style formatting
        contentSpan.innerHTML = formatTerminalOutput(message);
    } else {
        contentSpan.textContent = message;
    }

    messageDiv.appendChild(promptSpan);
    messageDiv.appendChild(contentSpan);

    // Add images if provided
    console.log('[addChatMessage] 🔍 DEBUG: Images parameter received:', images);
    console.log('[addChatMessage] 🔍 DEBUG: Images type:', typeof images);
    console.log('[addChatMessage] 🔍 DEBUG: Images length:', images?.length);
    if (images && images.length > 0) {
        console.log('[addChatMessage] 🔍 DEBUG: Processing images for display - first image:', images[0]);
        const imagesContainer = document.createElement('div');
        imagesContainer.classList.add('terminal-images');
        imagesContainer.style.cssText = 'margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;';
        
        images.forEach(imageData => {
            const imageWrapper = document.createElement('div');
            imageWrapper.style.cssText = 'position: relative; display: inline-block;';
            
            const img = document.createElement('img');
            if (imageData.url) {
                img.src = imageData.url;
            } else if (imageData.base64) {
                img.src = `data:${imageData.mimeType || 'image/jpeg'};base64,${imageData.base64}`;
            }
            img.style.cssText = 'max-width: 200px; max-height: 200px; border-radius: 4px; cursor: pointer;';
            img.title = 'Click to view full size';
            
            // Click to enlarge
            img.addEventListener('click', () => {
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; 
                    background: rgba(0,0,0,0.9); display: flex; justify-content: center; 
                    align-items: center; z-index: 10000; cursor: pointer;
                `;
                
                const fullImg = document.createElement('img');
                fullImg.src = img.src;
                fullImg.style.cssText = 'max-width: 90%; max-height: 90%; border-radius: 8px;';
                
                overlay.appendChild(fullImg);
                overlay.addEventListener('click', () => overlay.remove());
                document.body.appendChild(overlay);
            });
            
            imageWrapper.appendChild(img);
            imagesContainer.appendChild(imageWrapper);
        });
        
        messageDiv.appendChild(imagesContainer);
    }

    chatMessages.appendChild(messageDiv);

    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Return the message element for further manipulation
    return messageDiv;
}

// Format AI output for terminal display
function formatTerminalOutput(message) {
    return message
        .replace(/\n/g, '<br>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

// Animated typing indicator
let typingAnimationInterval = null;

// Chat settings
let includeOtherFiles = false; // Default: only include current file

function startTypingAnimation(element) {
    let dots = 0;
    element.textContent = '';
    element.classList.add('typing-indicator');
    
    // Clear any existing animation
    if (typingAnimationInterval) {
        clearInterval(typingAnimationInterval);
    }
    
    typingAnimationInterval = setInterval(() => {
        dots = (dots % 3) + 1;
        element.textContent = '.'.repeat(dots);
    }, 500); // Change dots every 500ms
}

function stopTypingAnimation() {
    if (typingAnimationInterval) {
        clearInterval(typingAnimationInterval);
        typingAnimationInterval = null;
    }
}

// --- Send Chat Message ---
async function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatMessages = document.getElementById('chat-messages');
    
    if (!chatInput || !window.electronAPI || !chatInput.value.trim()) {
        return; // Don't send empty messages
    }

    const userMessage = chatInput.value.trim();
    
    // Display user message with image indicators if any
    let displayMessage = userMessage;
    if (attachedImages.length > 0) {
        displayMessage += ` [${attachedImages.length} image${attachedImages.length > 1 ? 's' : ''} attached]`;
    }
    addChatMessage(displayMessage, 'User', false, null, attachedImages.length > 0 ? attachedImages : null);
    
    chatInput.value = ''; // Clear the input field
    chatInput.disabled = true; // Disable input while waiting for AI
    if (chatSendBtn) chatSendBtn.disabled = true;
    // Show animated typing indicator
    const typingMessage = addChatMessage('', 'AI'); // Empty message to start with
    const typingContent = typingMessage.querySelector('.terminal-content');
    if (typingContent) {
        startTypingAnimation(typingContent);
    }

    // Get current editor content
    let editorContent = '';
    // Prioritize the editor's actual filename if available, fall back to window.currentFilePath
    let currentFileName = (window.editor && window.editorFileName) ? window.editorFileName : (window.currentFilePath || 'untitled');
    
    if (window.editor && typeof window.editor.getValue === 'function') {
        editorContent = window.editor.getValue();
    } else if (window.fallbackEditor) {
        editorContent = window.fallbackEditor.value;
    }
    
    // Build enhanced message with full current file context
    let enhancedMessage = userMessage;
    if (editorContent && editorContent.trim()) {
        const fileName = currentFileName.split('/').pop() || currentFileName.split('\\').pop();
        const wordCount = editorContent.trim().split(/\s+/).filter(word => word.length > 0).length;
        const lineCount = editorContent.split('\n').length;
        
        enhancedMessage = `I'm currently working on file: ${fileName} (${lineCount} lines, ${wordCount} words)\n\n`;
        enhancedMessage += `Current file content:\n\`\`\`\n${editorContent}\n\`\`\`\n\n`;
        enhancedMessage += `User question: ${userMessage}`;
    }

    try {
        let result;
        
        // Get Dr. Chen's configuration 
        console.log('[AI Chat] 🔍 aiAssistantConfig available:', !!window.aiAssistantConfig);
        if (window.aiAssistantConfig) {
            console.log('[AI Chat] 🔍 Available assistants:', window.aiAssistantConfig.getAllAssistants().map(a => a.key));
        }
        
        const chenConfig = window.aiAssistantConfig ? 
            window.aiAssistantConfig.createServiceOptions('chen') : 
            { context: 'chat_dialogue' };
        
        console.log('[AI Chat] 🎓 Using Dr. Chen configuration:', chenConfig);

        // Try to use enhanced handler with file context
        try {
            const fileContext = includeOtherFiles ? await getFileSystemContext() : null;
            result = await window.electronAPI.invoke('send-chat-message-with-context', {
                message: enhancedMessage,
                fileContext: fileContext,
                currentFile: currentFileName,
                assistantConfig: chenConfig, // Add assistant configuration
                images: attachedImages.length > 0 ? attachedImages : undefined // Include images if any
            });
        } catch (contextError) {
            // Fallback to basic handler if enhanced one isn't available
            console.warn('[AI Chat] Enhanced handler not available, using basic handler:', contextError.message);
            const basicOptions = {...chenConfig};
            if (attachedImages.length > 0) {
                basicOptions.images = attachedImages;
            }
            result = await window.electronAPI.invoke('send-chat-message', enhancedMessage, basicOptions);
        }
        
        // Stop typing animation and remove typing indicator
        stopTypingAnimation();
        const typingIndicator = chatMessages.lastChild;
        if (typingIndicator && typingIndicator.classList.contains('terminal-message')) {
            const content = typingIndicator.querySelector('.terminal-content')?.textContent;
            if (content && content.match(/^\.{1,3}$/)) { // Match 1-3 dots
                chatMessages.removeChild(typingIndicator);
            }
        }

        if (result.error) {
            console.error('[AI Chat] Chat Error:', result.error);
            
            // Provide user-friendly error messages based on error type
            let userMessage = `Error: ${result.error}`;
            
            if (result.error.includes('API key') || result.error.includes('401') || result.error.includes('403')) {
                userMessage = '🔑 AI service authentication failed. Please check your API keys in Settings → AI Configuration.';
            } else if (result.error.includes('network') || result.error.includes('fetch') || result.error.includes('ENOTFOUND') || 
                      result.error.includes('ECONNREFUSED') || result.error.includes('timeout')) {
                userMessage = '🌐 Network error: Unable to connect to AI service. Please check your internet connection or try again later.';
            } else if (result.error.includes('rate limit') || result.error.includes('429')) {
                userMessage = '⏱️ Rate limit exceeded. Please wait a moment before sending another message.';
            } else if (result.error.includes('quota') || result.error.includes('billing')) {
                userMessage = '💳 API quota exceeded or billing issue. Please check your AI service account.';
            } else if (result.error.includes('Provider') && result.error.includes('not available')) {
                userMessage = '⚙️ AI provider not configured. Please set up your AI service in Settings → AI Configuration.';
            }
            
            addChatMessage(userMessage, 'AI');
        } else if (result.response) {
            console.log('[AI Chat] 🔍 DEBUG: Full result object:', result);
            console.log('[AI Chat] 🔍 DEBUG: result.images:', result.images);
            console.log('[AI Chat] 🔍 DEBUG: images type:', typeof result.images);
            console.log('[AI Chat] 🔍 DEBUG: images length:', result.images?.length);
            addChatMessage(cleanAIResponse(result.response), 'AI', false, { provider: result.provider, model: result.model }, result.images);
        } else {
            addChatMessage('Received an empty response from the AI.', 'AI');
        }
    } catch (error) {
        console.error('[AI Chat] Failed to send/receive chat message via IPC:', error);
        // Stop typing animation and remove typing indicator in case of error
        stopTypingAnimation();
        const typingIndicator = chatMessages.lastChild;
        if (typingIndicator && typingIndicator.classList.contains('terminal-message')) {
            const content = typingIndicator.querySelector('.terminal-content')?.textContent;
            if (content && content.match(/^\.{1,3}$/)) { // Match 1-3 dots
                chatMessages.removeChild(typingIndicator);
            }
        }
        
        // Provide user-friendly error message based on error type
        let userMessage = 'Error communicating with the AI service.';
        
        if (error.message && (error.message.includes('network') || error.message.includes('offline') || 
            error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED'))) {
            userMessage = '🌐 Network error: Please check your internet connection and try again.';
        } else if (error.message && error.message.includes('timeout')) {
            userMessage = '⏱️ Request timed out. The AI service may be busy. Please try again.';
        } else if (error.message && error.message.includes('invoke')) {
            userMessage = '⚙️ Communication error with AI service. Please restart the application if this persists.';
        }
        
        addChatMessage(userMessage, 'AI');
    } finally {
        chatInput.disabled = false; // Re-enable input
        if (chatSendBtn) chatSendBtn.disabled = false;
        chatInput.focus(); // Keep focus on input
        
        // Clear attached images after message is sent
        attachedImages = [];
        const previewContainer = document.getElementById('attached-images-preview');
        if (previewContainer) {
            previewContainer.innerHTML = '';
        }
    }
}

// --- Get File System Context ---
async function getFileSystemContext() {
    try {
        const context = await window.electronAPI.invoke('get-file-context');
        return context;
    } catch (error) {
        // Not critical - just means no file context will be provided
        console.warn('[AI Chat] File context not available (restart app for full features):', error.message);
        return null;
    }
}

// --- Load Editor Content to Chat ---
function loadEditorToChat() {
    const chatInput = document.getElementById('chat-input');
    const editor = window.editor;
    const fallbackEditor = window.fallbackEditor;
    
    if (!chatInput) return;
    
    let editorContent = '';
    if (editor) { // Check if Monaco editor is initialized
        editorContent = editor.getValue();
    } else if (fallbackEditor) { // Fallback if Monaco fails
        editorContent = fallbackEditor.value;
    }
    
    if (editorContent) {
        // Prepend existing chat input content (if any) or just set
        const currentChatContent = chatInput.value.trim();
        if (currentChatContent) {
            // Add a separator if needed
            chatInput.value = currentChatContent + '\n\n---\n\n' + editorContent;
        } else {
            chatInput.value = editorContent;
        }
        chatInput.focus(); // Focus the chat input
        // Optionally adjust scroll height if textarea content becomes large
        chatInput.scrollTop = chatInput.scrollHeight; 
        console.log('[AI Chat] Loaded editor content into chat input.');
    } else {
        console.log('[AI Chat] Editor is empty, nothing to load.');
        // Optionally provide feedback to the user
        if (window.showNotification) {
            window.showNotification('Editor is empty, nothing to load.', 'warning');
        }
    }
}

// --- Copy AI Response to Editor ---
function copyAIResponseToEditor() {
    const chatMessages = document.getElementById('chat-messages');
    const editor = window.editor;
    const fallbackEditor = window.fallbackEditor;
    
    if (!chatMessages) return;
    
    // Find the last AI message using the terminal message format
    const aiMessages = Array.from(chatMessages.querySelectorAll('.terminal-message .terminal-content'));
    let lastAIMessage = null;
    
    // Find the last AI message (skip user messages and typing indicators)
    for (let i = aiMessages.length - 1; i >= 0; i--) {
        const message = aiMessages[i];
        const messageDiv = message.closest('.terminal-message');
        
        // Check if this is an AI message (has assistant prompt)
        if (messageDiv && messageDiv.querySelector('.terminal-assistant')) {
            const content = message.textContent || message.innerText;
            // Skip typing indicators (just dots)
            if (content && !content.match(/^\.{1,3}$/)) {
                lastAIMessage = content;
                break;
            }
        }
    }
    
    if (!lastAIMessage) {
        alert('No AI response to copy.');
        return;
    }
    
    // Insert at cursor position in Monaco Editor
    if (editor && typeof editor.getValue === 'function' && typeof editor.setValue === 'function') {
        // Monaco Editor - insert at cursor position
        const selection = editor.getSelection();
        const range = selection || editor.getPosition();
        
        if (range) {
            editor.executeEdits('copy-ai-response', [{
                range: range,
                text: lastAIMessage,
                forceMoveMarkers: true
            }]);
        } else {
            // Fallback: append at end if no cursor position
            const current = editor.getValue();
            editor.setValue(current + (current.endsWith('\n') ? '' : '\n') + lastAIMessage + '\n');
        }
        
        // Update preview if available
        if (window.updatePreviewAndStructure) {
            window.updatePreviewAndStructure(editor.getValue());
        }
    } else if (fallbackEditor) {
        // Fallback textarea - insert at cursor position
        const startPos = fallbackEditor.selectionStart;
        const endPos = fallbackEditor.selectionEnd;
        const textBefore = fallbackEditor.value.substring(0, startPos);
        const textAfter = fallbackEditor.value.substring(endPos);
        
        fallbackEditor.value = textBefore + lastAIMessage + textAfter;
        
        // Set cursor position after inserted text
        const newCursorPos = startPos + lastAIMessage.length;
        fallbackEditor.selectionStart = newCursorPos;
        fallbackEditor.selectionEnd = newCursorPos;
        
        // Update preview if available
        if (window.updatePreviewAndStructure) {
            window.updatePreviewAndStructure(fallbackEditor.value);
        }
    } else {
        alert('Editor not available.');
        return;
    }
    
    console.log('[AI Chat] Copied AI response to cursor position in editor.');
    if (window.showNotification) {
        window.showNotification('AI response inserted at cursor position.', 'success');
    }
}

// --- Clear Chat Messages ---
async function clearChat() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const confirmed = confirm('Are you sure you want to clear all chat messages? This will also clear the AI conversation history.');
    if (confirmed) {
        try {
            // Clear conversation history in AI service
            const result = await window.electronAPI.invoke('ai-clear-conversation');
            if (result.error) {
                console.warn('[AI Chat] Warning: Could not clear AI conversation history:', result.error);
            } else {
                console.log('[AI Chat] AI conversation history cleared successfully');
            }
        } catch (error) {
            console.warn('[AI Chat] Warning: Could not clear AI conversation history:', error);
        }
        
        chatMessages.innerHTML = '';
        console.log('[AI Chat] Chat messages cleared.');
        if (window.showNotification) {
            window.showNotification('Chat cleared.', 'success');
        }
    }
}

// --- Restart Chat Session ---
async function restartChat() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    try {
        // Clear conversation history in AI service
        const result = await window.electronAPI.invoke('ai-restart-conversation');
        if (result.error) {
            console.warn('[AI Chat] Warning: Could not clear AI conversation history:', result.error);
        } else {
            console.log('[AI Chat] AI conversation history cleared successfully');
        }
    } catch (error) {
        console.warn('[AI Chat] Warning: Could not clear AI conversation history:', error);
    }
    
    // Clear messages without confirmation
    chatMessages.innerHTML = '';
    
    // Show new context message
    await showChatContext();
    
    // Focus input
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.focus();
    }
    
    console.log('[AI Chat] Chat session restarted.');
    if (window.showNotification) {
        window.showNotification('New chat session started.', 'success');
    }
}

// --- Get Current Chat History ---
function getChatHistory() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return [];
    
    const messages = Array.from(chatMessages.querySelectorAll('.chat-message'));
    return messages.map(message => {
        const sender = message.querySelector('.chat-sender').textContent.replace(':', '').trim();
        const content = message.querySelector('.chat-content').textContent;
        return {
            sender: sender === 'You' ? 'User' : sender,
            content: content,
            timestamp: new Date().toISOString()
        };
    });
}

// --- Save Chat History ---
async function saveChatHistory() {
    const history = getChatHistory();
    if (history.length === 0) {
        if (window.showNotification) {
            window.showNotification('No chat history to save.', 'warning');
        }
        return;
    }
    
    try {
        const chatHistoryText = history.map(msg => 
            `${msg.sender}: ${msg.content}`
        ).join('\n\n');
        
        if (window.electronAPI) {
            // Get default directory
            let defaultDirectory = window.appSettings?.workingDirectory;
            if (!defaultDirectory) {
                try {
                    const settings = await window.electronAPI.invoke('get-settings');
                    defaultDirectory = settings?.workingDirectory;
                } catch (error) {
                    console.warn('[AI Chat] Failed to load settings for save-as:', error);
                }
            }
            
            const result = await window.electronAPI.invoke('perform-save-as', {
                content: chatHistoryText,
                defaultDirectory: defaultDirectory
            });
            if (result.success) {
                console.log('[AI Chat] Chat history saved:', result.filePath);
                if (window.showNotification) {
                    window.showNotification('Chat history saved.', 'success');
                }
            }
        }
    } catch (error) {
        console.error('[AI Chat] Error saving chat history:', error);
        if (window.showNotification) {
            window.showNotification('Error saving chat history.', 'error');
        }
    }
}

// --- Initialize Chat Functionality ---
function initializeChatFunctionality() {
    console.log('[AI Chat] Initializing chat functionality...');
    
    const chatInput = document.getElementById('chat-input');
    const restartChatBtn = document.getElementById('restart-chat-btn');
    const loadEditorToChatBtn = document.getElementById('load-editor-to-chat-btn');
    const copyAIResponseBtn = document.getElementById('copy-ai-response-btn');
    
    console.log('[AI Chat] Found elements:', {
        chatInput: !!chatInput,
        restartBtn: !!restartChatBtn,
        loadEditorBtn: !!loadEditorToChatBtn,
        copyBtn: !!copyAIResponseBtn
    });
    
    // Enter key event listener for chat input
    if (chatInput) {
        console.log('[AI Chat] Setting up Enter key listener for chat input');
        
        // Use keydown for better compatibility
        chatInput.addEventListener('keydown', (e) => {
            // console.log('[AI Chat] Key pressed:', e.key, 'KeyCode:', e.keyCode);
            // Send on Enter key
            if (e.key === 'Enter' || e.keyCode === 13) {
                console.log('[AI Chat] Enter key detected, sending message...');
                e.preventDefault(); // Prevent default behavior
                e.stopPropagation(); // Stop event bubbling
                sendChatMessageWithCommands();
            }
        });
        
        // Focus the input and show context when chat pane is visible
        const chatPane = document.getElementById('chat-pane');
        if (chatPane) {
            const observer = new MutationObserver(async (mutations) => {
                mutations.forEach(async (mutation) => {
                    if (mutation.attributeName === 'style') {
                        const isVisible = !chatPane.style.display || chatPane.style.display !== 'none';
                        if (isVisible) {
                            chatInput.focus();
                            await showChatContext();
                        }
                    }
                });
            });
            observer.observe(chatPane, { attributes: true });
        }
    } else {
        console.error('[AI Chat] CRITICAL: Chat input element not found!');
    }
    
    // Restart chat button
    if (restartChatBtn) {
        restartChatBtn.addEventListener('click', restartChat);
    } else {
        console.warn('[AI Chat] Could not find Restart Chat button.');
    }
    
    // Load editor to chat button
    if (loadEditorToChatBtn) {
        loadEditorToChatBtn.addEventListener('click', loadEditorToChat);
    } else {
        console.warn('[AI Chat] Could not find Load Editor to Chat button.');
    }
    
    // Copy AI response to editor button
    if (copyAIResponseBtn) {
        copyAIResponseBtn.addEventListener('click', copyAIResponseToEditor);
    } else {
        console.warn('[AI Chat] Could not find Copy AI Response button.');
    }
    
    console.log('[AI Chat] Chat functionality initialized.');
}

// --- Chat Commands ---
async function processChatCommand(message) {
    const command = message.trim().toLowerCase();
    
    switch (command) {
        case '/clear':
            clearChat();
            return true;
            
        case '/save':
            saveChatHistory();
            return true;
            
        case '/help':
            addChatMessage(`Available commands:
/clear - Clear all chat messages and conversation history
/restart - Start a new chat session
/save - Save chat history to file
/settings - Show current AI configuration
/context - Toggle including other files in AI context (currently: ${includeOtherFiles ? 'ON' : 'OFF'})
/history - Show AI conversation history
/help - Show this help message  
/load - Load editor content to chat input
/ls - List files in current directory
/cat <filename> - Display file contents
/pwd - Show current working directory
/files - Show all text files with content summary`, 'AI');
            return true;
            
        case '/settings':
        case '/config':
            await showAISettings();
            return true;
            
        case '/restart':
        case '/reset':
        case '/new':
            restartChat();
            return true;
            
        case '/ls':
            await listFiles();
            return true;
            
        case '/pwd':
            await showCurrentDirectory();
            return true;
            
        case '/files':
            await showAllFiles();
            return true;
            
        case '/context':
            includeOtherFiles = !includeOtherFiles;
            addChatMessage(`Other files context is now ${includeOtherFiles ? '**ON**' : '**OFF**'}.\n\n${includeOtherFiles ? 'AI will see previews of other files in the directory.' : 'AI will only see the current file you\'re working on.'}`, 'AI');
            return true;
            
        case '/load':
            loadEditorToChat();
            return true;

        case '/history':
            await showConversationHistory();
            return true;
            
        default:
            // Check for /cat command with filename
            if (command.startsWith('/cat ')) {
                const filename = command.substring(5).trim();
                if (filename) {
                    await catFile(filename);
                    return true;
                } else {
                    addChatMessage('Usage: /cat <filename>', 'AI');
                    return true;
                }
            }
            return false; // Not a command
    }
}

// --- Enhanced Send Message with Commands ---
async function sendChatMessageWithCommands() {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput || !chatInput.value.trim()) return;
    
    const message = chatInput.value.trim();
    
    // Check if it's a command
    if (message.startsWith('/')) {
        const isCommand = await processChatCommand(message);
        if (isCommand) {
            chatInput.value = '';
            return;
        }
    }
    
    // Regular message - send to AI
    await sendChatMessage();
}

// --- Show Chat Context ---
async function showChatContext() {
    const chatMessages = document.getElementById('chat-messages');
    const contextDisplay = document.getElementById('chat-context-display');
    
    // Update header context - ensure we have the actual current file
    // Get the current file from the editor's state, not just window.currentFilePath
    let currentFile = window.currentFilePath;
    
    // Double-check that the editor's content matches what we think is current
    if (window.editor && window.editorFileName) {
        // Use the editor's actual filename if available
        currentFile = window.editorFileName;
    }
    
    if (contextDisplay) {
        let contextText = '';
        
        // Add file context
        if (currentFile) {
            const fileName = currentFile.split('/').pop() || currentFile.split('\\').pop();
            contextText += `Context: ${fileName}`;
        } else {
            contextText += 'No file open';
        }
        
        // Add AI provider/model info
        try {
            const aiConfig = await window.electronAPI.invoke('get-current-ai-config');
            if (aiConfig && aiConfig.success && aiConfig.provider && aiConfig.model) {
                const displayProvider = aiConfig.provider.charAt(0).toUpperCase() + aiConfig.provider.slice(1);
                let displayModel = aiConfig.model;
                
                // Simplify model names for header display
                if (displayModel.includes('claude-')) {
                    displayModel = displayModel.replace('claude-', 'Claude ').replace('-20', ' (20');
                    if (displayModel.includes('(20')) displayModel += ')';
                } else if (displayModel.includes('gpt-')) {
                    displayModel = displayModel.replace('gpt-', 'GPT-').toUpperCase();
                } else if (displayModel.includes('llama-')) {
                    displayModel = displayModel.replace('llama-', 'Llama ');
                }
                
                contextText += ` | AI: ${displayProvider}/${displayModel}`;
            }
        } catch (error) {
            // Don't show error in header, just continue without AI info
            console.warn('[AI Chat] Could not get AI config for header:', error);
        }
        
        contextText += ' | Type /help for commands';
        contextDisplay.textContent = contextText;
    }
    
    if (!chatMessages) return;
    
    // Only show initial message if chat is empty
    if (chatMessages.children.length > 0) return;
    
    // Get current editor info
    let contextMessage = 'AI Assistant ready. ';
    
    if (currentFile) {
        const fileName = currentFile.split('/').pop() || currentFile.split('\\').pop();
        contextMessage += `Currently editing: ${fileName}`;
        
        // Get word count if editor content is available
        if (window.editor && typeof window.editor.getValue === 'function') {
            const content = window.editor.getValue();
            if (content) {
                const wordCount = content.trim().split(/\s+/).length;
                const lineCount = content.split('\n').length;
                contextMessage += ` (${lineCount} lines, ${wordCount} words)`;
            }
        }
    } else {
        contextMessage += 'No file currently open.';
    }
    
    contextMessage += '\n\nEditor content will be automatically included with your messages.';
    contextMessage += `\nOther files context: ${includeOtherFiles ? 'ON' : 'OFF'} (use /context to toggle)`;
    contextMessage += '\nType /help for available commands or ask me anything about your code.';
    
    // Add as system message
    addChatMessage(contextMessage, 'AI');
}

// --- Terminal Commands ---
async function listFiles() {
    try {
        const files = await window.electronAPI.invoke('list-directory-files');
        if (files && files.length > 0) {
            const fileList = files.map(file => `  ${file.name}${file.isDirectory ? '/' : ''}`).join('\n');
            addChatMessage(`Files in current directory:\n${fileList}`, 'AI');
        } else {
            addChatMessage('No files found in current directory.', 'AI');
        }
    } catch (error) {
        addChatMessage(`Error listing files: ${error.message}`, 'AI');
    }
}

async function showCurrentDirectory() {
    try {
        const workingDir = await window.electronAPI.invoke('get-working-directory');
        addChatMessage(`Current working directory: ${workingDir}`, 'AI');
    } catch (error) {
        addChatMessage(`Error getting working directory: ${error.message}`, 'AI');
    }
}

async function catFile(filename) {
    try {
        const content = await window.electronAPI.invoke('read-file-content', filename);
        if (content) {
            addChatMessage(`Contents of ${filename}:\n\n${content}`, 'AI');
        } else {
            addChatMessage(`File ${filename} is empty or could not be read.`, 'AI');
        }
    } catch (error) {
        addChatMessage(`Error reading ${filename}: ${error.message}`, 'AI');
    }
}

async function showAllFiles() {
    try {
        const fileContext = await getFileSystemContext();
        if (fileContext && fileContext.files && fileContext.files.length > 0) {
            let output = 'Text files in current directory:\n\n';
            fileContext.files.forEach(file => {
                const preview = file.content.substring(0, 100);
                output += `📄 ${file.name}\n`;
                output += `   ${preview}${file.content.length > 100 ? '...' : ''}\n\n`;
            });
            addChatMessage(output, 'AI');
        } else {
            addChatMessage('No text files found in current directory.', 'AI');
        }
    } catch (error) {
        addChatMessage(`Error getting file list: ${error.message}`, 'AI');
    }
}

// --- Show Conversation History ---
async function showConversationHistory() {
    try {
        const result = await window.electronAPI.invoke('ai-get-conversation-history');
        if (result.error) {
            addChatMessage(`Error getting conversation history: ${result.error}`, 'AI');
            return;
        }
        
        const history = result.history || [];
        if (history.length === 0) {
            addChatMessage('📜 **Conversation History**\n\nNo conversation history yet. Start chatting to build up the conversation!', 'AI');
            return;
        }
        
        let historyMessage = '📜 **Conversation History**\n\n';
        historyMessage += `**Messages in conversation:** ${history.length}\n\n`;
        
        // Show recent messages (last 10)
        const recentHistory = history.slice(-10);
        if (recentHistory.length < history.length) {
            historyMessage += `*(Showing last ${recentHistory.length} of ${history.length} messages)*\n\n`;
        }
        
        for (const msg of recentHistory) {
            const timestamp = new Date(msg.timestamp).toLocaleTimeString();
            const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
            const preview = msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content;
            historyMessage += `**${role}** (${timestamp}):\n${preview}\n\n`;
        }
        
        historyMessage += '💡 Use `/restart` to start a new conversation or `/clear` to clear history.';
        
        addChatMessage(historyMessage, 'AI');
    } catch (error) {
        addChatMessage(`Error getting conversation history: ${error.message}`, 'AI');
    }
}

// --- Show AI Settings ---
async function showAISettings() {
    try {
        // Get available providers
        const providersResponse = await window.electronAPI.invoke('get-available-ai-providers');
        const defaultProvider = await window.electronAPI.invoke('get-default-ai-provider');
        
        let settingsMessage = '🤖 **Current AI Configuration**\n\n';
        
        // Handle response correctly - it's an object with providers array
        const providers = providersResponse?.providers || [];
        
        if (providers && providers.length > 0) {
            settingsMessage += `**Available Providers:** ${providers.join(', ')}\n`;
            settingsMessage += `**Default Provider:** ${defaultProvider || 'Not set'}\n\n`;
        } else {
            settingsMessage += '❌ **No AI providers configured**\n\n';
            settingsMessage += '📝 **Offline Mode Features:**\n';
            settingsMessage += '• TODO Suggestions: ✅ Smart contextual suggestions\n';
            settingsMessage += '• Writing Analysis: ✅ Local text analysis\n';
            settingsMessage += '• Gamification: ✅ Full points and achievements\n';
            settingsMessage += '• File Management: ✅ All file operations\n\n';
            settingsMessage += '💡 Many features work without AI! Configure providers in Settings for enhanced capabilities.\n\n';
        }
        
        // Try to get more detailed settings
        try {
            const settings = await window.electronAPI.invoke('get-settings');
            if (settings && settings.ai) {
                settingsMessage += '**AI Settings:**\n';
                settingsMessage += `• Temperature: ${settings.ai.temperature || 'Not set'}\n`;
                settingsMessage += `• Max Tokens: ${settings.ai.maxTokens || 'Not set'}\n`;
                settingsMessage += `• Preferred Provider: ${settings.ai.preferredProvider || 'auto'}\n`;
                
                if (settings.ai.models) {
                    settingsMessage += '\n**Models per Provider:**\n';
                    Object.entries(settings.ai.models).forEach(([provider, model]) => {
                        settingsMessage += `• ${provider}: ${model}\n`;
                    });
                }
                
                settingsMessage += '\n**Features:**\n';
                settingsMessage += `• Chat: ${settings.ai.enableChat ? '✅' : '❌'}\n`;
                settingsMessage += `• Summarization: ${settings.ai.enableSummarization ? '✅' : '❌'}\n`;
                settingsMessage += `• Note Extraction: ${settings.ai.enableNoteExtraction ? '✅' : '❌'}\n`;
            }
        } catch (detailError) {
            settingsMessage += '(Detailed settings not available)\n';
        }
        
        settingsMessage += '\n**Chat Settings:**\n';
        settingsMessage += `• Other Files Context: ${includeOtherFiles ? '✅ ON' : '❌ OFF'} (use /context to toggle)\n`;
        
        settingsMessage += '\n💡 To change settings, use the menu: Preferences → AI Configuration';
        
        addChatMessage(settingsMessage, 'AI');
        
        // Refresh header to show current config
        await showChatContext();
    } catch (error) {
        addChatMessage(`Error getting AI settings: ${error.message}`, 'AI');
    }
}

// --- Refresh Header Display ---
async function refreshChatHeader() {
    await showChatContext();
}

// --- Image Handling Functions ---
function handleAttachImage() {
    const imageInput = document.getElementById('image-input');
    if (imageInput) {
        imageInput.click();
    }
}

function handleImageInput(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const previewContainer = document.getElementById('attached-images-preview');
    if (!previewContainer) return;

    Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) {
            console.warn('[AI Chat] File is not an image:', file.name);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result.split(',')[1]; // Remove data:image/...;base64, prefix
            
            const imageData = {
                base64: base64,
                mimeType: file.type,
                name: file.name,
                size: file.size
            };
            
            attachedImages.push(imageData);
            
            // Create preview
            const previewWrapper = document.createElement('div');
            previewWrapper.style.cssText = 'position: relative; display: inline-block;';
            
            const previewImg = document.createElement('img');
            previewImg.src = e.target.result;
            previewImg.style.cssText = 'width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;';
            previewImg.title = file.name;
            
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '×';
            removeBtn.style.cssText = `
                position: absolute; top: -8px; right: -8px; width: 20px; height: 20px; 
                border-radius: 50%; background: #ff4444; color: white; border: none; 
                cursor: pointer; font-size: 12px; line-height: 1;
            `;
            removeBtn.title = 'Remove image';
            removeBtn.addEventListener('click', () => {
                const index = attachedImages.findIndex(img => img.base64 === base64);
                if (index > -1) {
                    attachedImages.splice(index, 1);
                }
                previewWrapper.remove();
            });
            
            previewWrapper.appendChild(previewImg);
            previewWrapper.appendChild(removeBtn);
            previewContainer.appendChild(previewWrapper);
        };
        
        reader.readAsDataURL(file);
    });
}

async function handleGenerateImage() {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput || !chatInput.value.trim()) {
        chatInput.placeholder = 'Enter a description for the image to generate...';
        chatInput.focus();
        return;
    }

    const prompt = chatInput.value.trim();
    chatInput.value = '';
    chatInput.disabled = true;

    // Show user message
    addChatMessage(`/image ${prompt}`, 'User');

    // Show loading message
    const loadingMessage = addChatMessage('Generating image...', 'AI');
    const typingContent = loadingMessage.querySelector('.terminal-content');
    if (typingContent) {
        startTypingAnimation(typingContent);
    }

    try {
        // Call image generation API
        const result = await window.electronAPI.invoke('generate-image', {
            prompt: prompt,
            size: '1024x1024',
            quality: 'standard'
        });

        // Stop loading animation
        stopTypingAnimation();

        if (result.error) {
            // Update loading message with error
            typingContent.textContent = `Error generating image: ${result.error}`;
        } else {
            // Update loading message with success
            typingContent.textContent = `Generated image: "${result.revised_prompt || prompt}"`;
            
            // Add the generated images to the message
            if (result.images && result.images.length > 0) {
                addChatMessage('', 'AI', false, result, result.images);
            }
        }
    } catch (error) {
        stopTypingAnimation();
        typingContent.textContent = `Error generating image: ${error.message}`;
    } finally {
        chatInput.disabled = false;
        chatInput.focus();
    }
}

// --- Export for Global Access ---
// Make functions available globally for onclick handlers and other modules
window.sendChatMessage = sendChatMessage;
window.sendChatMessageWithCommands = sendChatMessageWithCommands;
window.loadEditorToChat = loadEditorToChat;
window.copyAIResponseToEditor = copyAIResponseToEditor;
window.restartChat = restartChat;
window.initializeChatFunctionality = initializeChatFunctionality;
window.addChatMessage = addChatMessage;
window.refreshChatHeader = refreshChatHeader;
window.handleAttachImage = handleAttachImage;
window.handleImageInput = handleImageInput;
window.handleGenerateImage = handleGenerateImage;