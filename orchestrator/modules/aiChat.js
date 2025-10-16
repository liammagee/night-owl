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
    if (!chatMessages) {
        console.log('[AI Chat] No chat-messages element found');
        return [];
    }
    
    // Debug: log the entire chat container content
    console.log('[AI Chat] Chat container HTML:', chatMessages.innerHTML);
    
    const messages = Array.from(chatMessages.querySelectorAll('.terminal-message'));
    console.log(`[AI Chat] Found ${messages.length} terminal messages`);
    
    // Debug: log each message element
    messages.forEach((msg, i) => {
        console.log(`[AI Chat] Message ${i} classes:`, msg.className);
        console.log(`[AI Chat] Message ${i} HTML:`, msg.outerHTML);
    });
    
    // Filter out typing indicators and other non-message elements
    const realMessages = messages.filter(message => {
        // Skip typing indicators or loading messages
        return !message.classList.contains('typing-indicator') && 
               !message.classList.contains('loading') &&
               !message.textContent.includes('•••') &&
               !message.textContent.includes('typing...');
    });
    
    console.log(`[AI Chat] After filtering: ${realMessages.length} real messages`);
    
    return realMessages.map((message, index) => {
        // Get sender from the terminal-prompt
        const promptElement = message.querySelector('.terminal-prompt');
        let sender = 'Unknown';
        if (promptElement) {
            const userElement = promptElement.querySelector('.terminal-user');
            const assistantElement = promptElement.querySelector('.terminal-assistant');
            if (userElement) {
                sender = 'User';
            } else if (assistantElement) {
                sender = 'Dr. Chen';
            }
        }
        
        // Get content from terminal-content
        const contentElement = message.querySelector('.terminal-content');
        let content = '';
        if (contentElement) {
            // For AI messages with formatting, use textContent to get clean text
            // For user messages, textContent should work fine too
            content = contentElement.textContent || contentElement.innerText || '';
        } else {
            // Fallback: try to get content from the entire message, excluding the prompt
            const messageText = message.textContent || message.innerText || '';
            const promptText = promptElement ? (promptElement.textContent || '') : '';
            content = messageText.replace(promptText, '').trim();
        }
        
        // Skip empty messages
        if (!content.trim()) {
            console.log(`[AI Chat] Skipping empty message ${index}`);
            return null;
        }
        
        console.log(`[AI Chat] Message ${index}: sender="${sender}", content="${content.substring(0, 50)}..."`);
        
        return {
            sender: sender,
            content: content.trim(),
            timestamp: new Date().toISOString()
        };
    }).filter(message => message !== null); // Remove null entries (empty messages)
}

// --- Format Chat as Markdown ---
async function formatChatAsMarkdown(history) {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();
    
    // Get current document info
    let currentFile = window.currentFilePath;
    let currentFileName = 'Unknown';
    let documentLink = '';
    
    // Check if we have a current file
    if (currentFile) {
        currentFileName = currentFile.split('/').pop() || currentFile.split('\\').pop() || currentFile;
        // Create relative path if possible
        try {
            const settings = await window.electronAPI.invoke('get-settings');
            const workingDir = settings?.workingDirectory;
            if (workingDir && currentFile.startsWith(workingDir)) {
                const relativePath = currentFile.substring(workingDir.length).replace(/^[\/\\]/, '');
                documentLink = `[${currentFileName}](./${relativePath})`;
            } else {
                documentLink = `[${currentFileName}](${currentFile})`;
            }
        } catch (error) {
            console.warn('[AI Chat] Could not get working directory for relative path:', error);
            documentLink = `[${currentFileName}](${currentFile})`;
        }
    } else if (window.editor && window.editorFileName) {
        currentFileName = window.editorFileName;
        documentLink = `**${currentFileName}** *(unsaved document)*`;
    } else {
        documentLink = '*No document open*';
    }
    
    // Build markdown content
    let markdown = `# AI Chat Session\n\n`;
    markdown += `**Date:** ${dateStr}  \n`;
    markdown += `**Time:** ${timeStr}  \n`;
    markdown += `**Document:** ${documentLink}  \n`;
    markdown += `**Messages:** ${history.length}\n\n`;
    markdown += `---\n\n`;
    
    // Add chat messages
    history.forEach((msg, index) => {
        const isUser = msg.sender === 'User' || msg.sender === 'You';
        const senderIcon = isUser ? '👤' : '🤖';
        const senderName = isUser ? 'User' : (msg.sender || 'AI Assistant');
        
        markdown += `## ${senderIcon} ${senderName}\n\n`;
        
        // Clean and format the content
        let content = msg.content;
        
        // Handle code blocks and ensure proper markdown formatting
        if (content.includes('```')) {
            // Content already has code blocks, use as-is
            markdown += `${content}\n\n`;
        } else if (content.includes('`') && content.split('`').length > 2) {
            // Has inline code, use as-is
            markdown += `${content}\n\n`;
        } else {
            // Regular text, make sure it's properly formatted
            markdown += `${content}\n\n`;
        }
        
        // Add separator between messages (except for last message)
        if (index < history.length - 1) {
            markdown += `---\n\n`;
        }
    });
    
    // Add footer
    markdown += `\n---\n\n`;
    markdown += `*Chat session saved from [Hegel Pedagogy AI](https://github.com/anthropics/hegel-pedagogy-ai)*  \n`;
    markdown += `*Generated on ${dateStr} at ${timeStr}*\n`;
    
    return markdown;
}

// --- Save Chat History ---
async function saveChatHistory() {
    console.log('[AI Chat] Starting saveChatHistory...');
    const history = getChatHistory();
    console.log('[AI Chat] Retrieved history:', history);
    
    if (history.length === 0) {
        console.log('[AI Chat] No history found, showing warning');
        if (window.showNotification) {
            window.showNotification('No chat history to save.', 'warning');
        }
        return;
    }
    
    try {
        // Create markdown formatted chat history
        const chatHistoryMarkdown = await formatChatAsMarkdown(history);
        
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
            
            // Generate suggested filename with timestamp
            const now = new Date();
            const timestamp = now.toISOString().split('T')[0] + '_' + now.toTimeString().split(' ')[0].replace(/:/g, '-');
            const suggestedName = `chat-${timestamp}.md`;
            
            const result = await window.electronAPI.invoke('perform-save-as', {
                content: chatHistoryMarkdown,
                defaultDirectory: defaultDirectory,
                suggestedName: suggestedName
            });
            
            if (result.success) {
                console.log('[AI Chat] Chat history saved as markdown:', result.filePath);
                if (window.showNotification) {
                    window.showNotification('Chat saved as markdown file.', 'success');
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
    const saveChatBtn = document.getElementById('save-chat-btn');
    
    console.log('[AI Chat] Found elements:', {
        chatInput: !!chatInput,
        restartBtn: !!restartChatBtn,
        loadEditorBtn: !!loadEditorToChatBtn,
        copyBtn: !!copyAIResponseBtn,
        saveBtn: !!saveChatBtn
    });
    
    // Enter key event listener for chat input
    if (chatInput) {
        console.log('[AI Chat] Setting up Enter key listener for chat input');
        
        // Initialize autocomplete
        initializeCommandAutocomplete(chatInput);
        
        // Use keydown for better compatibility
        chatInput.addEventListener('keydown', (e) => {
            // Handle autocomplete navigation first
            if (handleAutocompleteKeydown(e)) {
                return; // If autocomplete handled the key, don't process further
            }
            
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
    
    // Save chat as markdown button
    if (saveChatBtn) {
        saveChatBtn.addEventListener('click', () => {
            saveChatHistory();
        });
    } else {
        console.warn('[AI Chat] Could not find Save Chat button.');
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
            await showChatHelp();
            return true;
            
        case '/commands':
            await showAvailableCommands();
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
            
            // Check for configurable slash commands
            try {
                const settings = await window.electronAPI.invoke('get-settings', 'ai');
                const slashCommands = settings.slashCommands || {};
                const commandName = command.split(' ')[0].toLowerCase();
                
                if (slashCommands[commandName]) {
                    await executeSlashCommand(commandName, slashCommands[commandName], command);
                    return true;
                }
            } catch (error) {
                console.error('[AI Chat] Error loading slash commands:', error);
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
            settingsMessage += '• Gamification: ✅ Ledger tracking and lore fragments enabled\n';
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

// --- Slash Command Functions ---
async function executeSlashCommand(commandName, commandConfig, fullCommand) {
    try {
        console.log(`[AI Chat] Executing slash command: ${commandName}`);
        
        // Get current content for analysis
        let content = '';
        let contentSource = 'document';
        
        // Check if user provided specific content after command
        const parts = fullCommand.split(' ');
        if (parts.length > 1) {
            // User provided specific text after command
            content = parts.slice(1).join(' ');
            contentSource = 'user input';
        } else {
            // Get content from editor or current selection
            if (window.editor && typeof window.editor.getValue === 'function') {
                // Try to get selected text first
                let selection = '';
                try {
                    if (typeof window.editor.getSelection === 'function') {
                        selection = window.editor.getSelection();
                    } else if (typeof window.editor.getSelectedText === 'function') {
                        selection = window.editor.getSelectedText();
                    }
                } catch (err) {
                    console.log('[AI Chat] Could not get selection:', err.message);
                }
                
                if (selection && typeof selection === 'string' && selection.trim()) {
                    content = selection.trim();
                    contentSource = 'selected text';
                } else {
                    content = window.editor.getValue();
                    contentSource = 'current document';
                }
            } else if (window.fallbackEditor) {
                // Check for selected text in textarea
                const start = window.fallbackEditor.selectionStart;
                const end = window.fallbackEditor.selectionEnd;
                if (start !== end) {
                    content = window.fallbackEditor.value.substring(start, end);
                    contentSource = 'selected text';
                } else {
                    content = window.fallbackEditor.value;
                    contentSource = 'current document';
                }
            }
        }
        
        if (!content.trim()) {
            addChatMessage(`❌ No content to ${commandConfig.name.toLowerCase()}. Please:
• Select text in the editor, or
• Open a document, or  
• Type content after the command: ${commandName} <your text>`, 'AI');
            return;
        }
        
        // Calculate basic statistics if needed
        let statistics = '';
        if (commandConfig.prompt.includes('{statistics}')) {
            const stats = calculateBasicStatistics(content);
            statistics = `\nDocument Statistics:
- Words: ${stats.wordCount.toLocaleString()}
- Sentences: ${stats.sentenceCount}
- Avg sentence length: ${stats.averageSentenceLength} words
- Avg word length: ${stats.averageWordLength} chars
- Paragraphs: ${stats.paragraphCount}
- Headings: ${stats.headingCount}`;
        }
        
        // Replace placeholders in prompt
        let prompt = commandConfig.prompt
            .replace(/{content}/g, content)
            .replace(/{statistics}/g, statistics);
        
        // Show what we're analyzing
        addChatMessage(`🔍 ${commandConfig.name} (${contentSource})`, 'User');
        
        // Send to AI
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.value = prompt;
            await sendChatMessage();
        }
        
    } catch (error) {
        console.error(`[AI Chat] Error executing slash command ${commandName}:`, error);
        addChatMessage(`❌ Error executing ${commandName}: ${error.message}`, 'AI');
    }
}

function calculateBasicStatistics(content) {
    const lines = content.split('\n');
    
    // Clean text content
    const cleanText = content
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`[^`]+`/g, '') // Remove inline code
        .replace(/\[[^\]]*\]\([^)]*\)/g, '') // Remove links
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // Remove images
        .replace(/[#*_`\[\]()]/g, ' ') // Remove markdown symbols
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    
    // Word count
    const wordCount = cleanText ? cleanText.split(' ').length : 0;
    
    // Sentence count and average sentence length
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;
    const averageSentenceLength = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;
    
    // Paragraph count
    const paragraphCount = lines.filter(line => 
        line.trim() && 
        !line.startsWith('#') && 
        !line.startsWith('*') && 
        !line.startsWith('-') && 
        !line.startsWith('+') &&
        !line.match(/^\d+\./) &&
        !line.match(/^```/)
    ).length;
    
    // Heading count
    const headingCount = lines.filter(line => line.startsWith('#')).length;
    
    // Basic readability metrics
    const averageWordLength = wordCount > 0 ? Math.round((cleanText.replace(/\s/g, '').length) / wordCount * 10) / 10 : 0;
    
    return {
        wordCount,
        sentenceCount,
        averageSentenceLength,
        averageWordLength,
        paragraphCount,
        headingCount
    };
}

async function showChatHelp() {
    try {
        // Get custom slash commands from settings
        const settings = await window.electronAPI.invoke('get-settings', 'ai');
        const slashCommands = settings.slashCommands || {};
        
        let helpMessage = `🤖 **AI Chat Help**

**System Commands:**
• \`/clear\` - Clear all messages and conversation history
• \`/restart\` - Start a new chat session  
• \`/save\` - Save chat history to file
• \`/settings\` - Show current AI configuration
• \`/context\` - Toggle file context (currently: ${includeOtherFiles ? 'ON' : 'OFF'})
• \`/help\` - Show this help message
• \`/commands\` - List all available slash commands

**File Commands:**
• \`/load\` - Load editor content to chat input
• \`/ls\` - List files in current directory  
• \`/pwd\` - Show current working directory
• \`/cat <filename>\` - Display file contents`;

        // Add custom commands if they exist
        if (Object.keys(slashCommands).length > 0) {
            helpMessage += '\n\n**Custom Commands:**';
            for (const [command, config] of Object.entries(slashCommands)) {
                helpMessage += `\n• \`${command}\` - ${config.description}`;
            }
        } else {
            helpMessage += '\n\n**Custom Commands:**';
            helpMessage += '\nNo custom commands configured. Add them in Settings → AI Custom Prompts.';
        }

        helpMessage += '\n\n💡 **Tip:** Most commands work with selected text, current document, or text you type after the command.';
        
        addChatMessage(helpMessage, 'AI');
        
    } catch (error) {
        console.error('[AI Chat] Error loading custom commands for help:', error);
        // Fallback to basic help message
        const fallbackMessage = `🤖 **AI Chat Help**

**System Commands:**
• \`/clear\` - Clear all messages and conversation history
• \`/restart\` - Start a new chat session  
• \`/save\` - Save chat history to file
• \`/settings\` - Show current AI configuration
• \`/context\` - Toggle file context (currently: ${includeOtherFiles ? 'ON' : 'OFF'})
• \`/help\` - Show this help message
• \`/commands\` - List all available slash commands

**File Commands:**
• \`/load\` - Load editor content to chat input
• \`/ls\` - List files in current directory  
• \`/pwd\` - Show current working directory
• \`/cat <filename>\` - Display file contents

💡 **Tip:** Most commands work with selected text, current document, or text you type after the command.`;
        
        addChatMessage(fallbackMessage, 'AI');
    }
}

async function showAvailableCommands() {
    try {
        const settings = await window.electronAPI.invoke('get-settings', 'ai');
        const slashCommands = settings.slashCommands || {};
        
        if (Object.keys(slashCommands).length === 0) {
            addChatMessage('No custom slash commands configured. You can add them in Settings → AI → Slash Commands.', 'AI');
            return;
        }
        
        let commandsList = '🔧 **Available Slash Commands:**\n\n';
        
        for (const [command, config] of Object.entries(slashCommands)) {
            commandsList += `• **\`${command}\`** - ${config.description}\n`;
        }
        
        commandsList += '\n💡 **Usage:** Type the command to analyze current document/selection, or add text: `/analyze This is my text`';
        
        addChatMessage(commandsList, 'AI');
        
    } catch (error) {
        console.error('[AI Chat] Error loading slash commands for help:', error);
        addChatMessage('Error loading slash commands. Please check your settings.', 'AI');
    }
}

// --- Settings Refresh Functions ---
function clearAICache() {
    console.log('[AI Chat] Clearing AI cache');
    // Clear any cached provider/model information
    if (window.currentProvider) delete window.currentProvider;
    if (window.currentModel) delete window.currentModel;
    // Clear any cached assistant configurations
    if (window.cachedAssistantSettings) delete window.cachedAssistantSettings;
}

async function refreshAISystem() {
    console.log('[AI Chat] Refreshing AI system');
    
    // Clear cache first
    clearAICache();
    
    // Reload assistant configurations
    if (window.aiAssistantConfig) {
        await window.aiAssistantConfig.reloadConfiguration();
    }
    
    // Refresh chat context to pick up any changes
    await showChatContext();
    
    console.log('[AI Chat] AI system refresh complete');
}

// --- Command Autocomplete System ---
let autocompleteState = {
    isVisible: false,
    selectedIndex: -1,
    filteredCommands: [],
    allCommands: []
};

async function initializeCommandAutocomplete(inputElement) {
    const autocompleteContainer = document.getElementById('command-autocomplete');
    if (!autocompleteContainer) return;

    // Load all available commands
    await loadAllCommands();

    // Input event listener for showing/hiding autocomplete
    inputElement.addEventListener('input', (e) => {
        const value = e.target.value;
        if (value.startsWith('/')) {
            showAutocomplete(value);
        } else {
            hideAutocomplete();
        }
    });

    // Click outside to hide autocomplete
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#chat-input') && !e.target.closest('#command-autocomplete')) {
            hideAutocomplete();
        }
    });

    // Blur event to hide autocomplete (with slight delay for clicks)
    inputElement.addEventListener('blur', () => {
        setTimeout(() => hideAutocomplete(), 150);
    });
}

async function loadAllCommands() {
    try {
        // System commands
        const systemCommands = [
            { command: '/help', description: 'Show all available commands' },
            { command: '/commands', description: 'List custom slash commands' },
            { command: '/clear', description: 'Clear all messages and conversation history' },
            { command: '/restart', description: 'Start a new chat session' },
            { command: '/save', description: 'Save chat history to file' },
            { command: '/settings', description: 'Show current AI configuration' },
            { command: '/context', description: 'Toggle file context inclusion' },
            { command: '/load', description: 'Load editor content to chat input' },
            { command: '/ls', description: 'List files in current directory' },
            { command: '/pwd', description: 'Show current working directory' },
            { command: '/cat', description: 'Display file contents' }
        ];

        // Custom commands from settings
        const settings = await window.electronAPI.invoke('get-settings', 'ai');
        const customCommands = settings.slashCommands || {};
        
        const customCommandsList = Object.entries(customCommands).map(([command, config]) => ({
            command: command,
            description: config.description || 'Custom command'
        }));

        autocompleteState.allCommands = [...systemCommands, ...customCommandsList];
        
    } catch (error) {
        console.error('[AI Chat] Error loading commands for autocomplete:', error);
        // Fallback to system commands only
        autocompleteState.allCommands = [
            { command: '/help', description: 'Show all available commands' },
            { command: '/clear', description: 'Clear all messages and conversation history' },
            { command: '/restart', description: 'Start a new chat session' }
        ];
    }
}

function showAutocomplete(inputValue) {
    const autocompleteContainer = document.getElementById('command-autocomplete');
    if (!autocompleteContainer) return;

    const query = inputValue.toLowerCase();
    
    // Filter commands based on input
    autocompleteState.filteredCommands = autocompleteState.allCommands.filter(cmd => 
        cmd.command.toLowerCase().includes(query)
    );

    if (autocompleteState.filteredCommands.length === 0) {
        hideAutocomplete();
        return;
    }

    // Build HTML for filtered commands
    let html = '';
    autocompleteState.filteredCommands.forEach((cmd, index) => {
        const isSelected = index === autocompleteState.selectedIndex;
        html += `
            <div class="command-option${isSelected ? ' selected' : ''}" data-index="${index}">
                <span class="command-name">${cmd.command}</span>
                <span class="command-description">${cmd.description}</span>
            </div>
        `;
    });

    autocompleteContainer.innerHTML = html;
    
    // Add click listeners
    autocompleteContainer.querySelectorAll('.command-option').forEach((option, index) => {
        option.addEventListener('click', () => {
            selectCommand(index);
        });
    });

    autocompleteContainer.style.display = 'block';
    autocompleteState.isVisible = true;
    autocompleteState.selectedIndex = -1;
}

function hideAutocomplete() {
    const autocompleteContainer = document.getElementById('command-autocomplete');
    if (autocompleteContainer) {
        autocompleteContainer.style.display = 'none';
    }
    autocompleteState.isVisible = false;
    autocompleteState.selectedIndex = -1;
}

function handleAutocompleteKeydown(e) {
    if (!autocompleteState.isVisible) return false;

    const autocompleteContainer = document.getElementById('command-autocomplete');
    if (!autocompleteContainer) return false;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            autocompleteState.selectedIndex = Math.min(
                autocompleteState.selectedIndex + 1, 
                autocompleteState.filteredCommands.length - 1
            );
            updateSelectedOption();
            return true;

        case 'ArrowUp':
            e.preventDefault();
            autocompleteState.selectedIndex = Math.max(
                autocompleteState.selectedIndex - 1, 
                0
            );
            updateSelectedOption();
            return true;

        case 'Tab':
            e.preventDefault();
            if (autocompleteState.selectedIndex >= 0) {
                selectCommand(autocompleteState.selectedIndex);
            } else if (autocompleteState.filteredCommands.length > 0) {
                // Auto-complete with the best match (first command)
                selectCommand(0);
            }
            return true;
            
        case 'Enter':
            if (autocompleteState.selectedIndex >= 0) {
                e.preventDefault();
                selectCommand(autocompleteState.selectedIndex);
                return true;
            }
            break;

        case 'Escape':
            e.preventDefault();
            hideAutocomplete();
            return true;
    }

    return false;
}

function updateSelectedOption() {
    const autocompleteContainer = document.getElementById('command-autocomplete');
    if (!autocompleteContainer) return;

    const options = autocompleteContainer.querySelectorAll('.command-option');
    options.forEach((option, index) => {
        if (index === autocompleteState.selectedIndex) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}

function selectCommand(index) {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput || index < 0 || index >= autocompleteState.filteredCommands.length) return;

    const selectedCommand = autocompleteState.filteredCommands[index];
    chatInput.value = selectedCommand.command + ' ';
    chatInput.focus();
    
    // Move cursor to end
    const length = chatInput.value.length;
    chatInput.setSelectionRange(length, length);
    
    hideAutocomplete();
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
window.clearAICache = clearAICache;
window.refreshAISystem = refreshAISystem;
