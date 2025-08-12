// === AI Chat Module ===
// Terminal-style AI Chat like Claude Code
// Features:
// - Terminal-style interface
// - File system access to plain text files
// - Command-style interactions
// - Contextual awareness of current working directory

// --- Terminal-style Chat Message Management ---
function addChatMessage(message, sender, isCommand = false) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('terminal-message', `terminal-${sender.toLowerCase()}`);
    if (isCommand) messageDiv.classList.add('terminal-command');

    const promptSpan = document.createElement('span');
    promptSpan.classList.add('terminal-prompt');
    
    if (sender === 'User') {
        promptSpan.innerHTML = '<span class="terminal-user">user@hegel-ai</span><span class="terminal-separator">:</span><span class="terminal-path">~/</span><span class="terminal-dollar">$</span> ';
    } else {
        promptSpan.innerHTML = '<span class="terminal-assistant">assistant</span><span class="terminal-separator">:</span> ';
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
    chatMessages.appendChild(messageDiv);

    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Format AI output for terminal display
function formatTerminalOutput(message) {
    return message
        .replace(/\n/g, '<br>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
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
    addChatMessage(userMessage, 'User'); // Display user's message immediately
    chatInput.value = ''; // Clear the input field
    chatInput.disabled = true; // Disable input while waiting for AI
    if (chatSendBtn) chatSendBtn.disabled = true;
    addChatMessage('...', 'AI'); // Show typing indicator

    // Get current editor content
    let editorContent = '';
    let currentFileName = window.currentFilePath || 'untitled';
    
    if (window.editor && typeof window.editor.getValue === 'function') {
        editorContent = window.editor.getValue();
    } else if (window.fallbackEditor) {
        editorContent = window.fallbackEditor.value;
    }
    
    // Build enhanced message with editor context
    let enhancedMessage = userMessage;
    if (editorContent && editorContent.trim()) {
        enhancedMessage = `I'm currently working on file: ${currentFileName}\n\n`;
        enhancedMessage += `Current file content:\n\`\`\`\n${editorContent}\n\`\`\`\n\n`;
        enhancedMessage += `User question: ${userMessage}`;
    }

    try {
        let result;
        
        // Try to use enhanced handler with file context
        try {
            const fileContext = await getFileSystemContext();
            result = await window.electronAPI.invoke('send-chat-message-with-context', {
                message: enhancedMessage,
                fileContext: fileContext,
                currentFile: currentFileName
            });
        } catch (contextError) {
            // Fallback to basic handler if enhanced one isn't available
            console.warn('[AI Chat] Enhanced handler not available, using basic handler:', contextError.message);
            result = await window.electronAPI.invoke('send-chat-message', enhancedMessage);
        }
        
        // Remove typing indicator
        const typingIndicator = chatMessages.lastChild;
        if (typingIndicator && typingIndicator.querySelector('.terminal-content')?.textContent === '...') {
            chatMessages.removeChild(typingIndicator);
        }

        if (result.error) {
            console.error('[AI Chat] Chat Error:', result.error);
            addChatMessage(`Error: ${result.error}`, 'AI');
        } else if (result.response) {
            addChatMessage(result.response, 'AI');
        } else {
            addChatMessage('Received an empty response from the AI.', 'AI');
        }
    } catch (error) {
        console.error('[AI Chat] Failed to send/receive chat message via IPC:', error);
        // Remove typing indicator in case of error
        const typingIndicator = chatMessages.lastChild;
        if (typingIndicator && typingIndicator.querySelector('.terminal-content')?.textContent === '...') {
            chatMessages.removeChild(typingIndicator);
        }
        addChatMessage('Error communicating with the AI service.', 'AI');
    } finally {
        chatInput.disabled = false; // Re-enable input
        if (chatSendBtn) chatSendBtn.disabled = false;
        chatInput.focus(); // Keep focus on input
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
    
    // Find the last AI message
    const aiMessages = Array.from(chatMessages.querySelectorAll('.chat-message-ai .chat-content'));
    if (aiMessages.length === 0) {
        alert('No AI response to copy.');
        return;
    }
    
    const lastAIContent = aiMessages[aiMessages.length - 1].innerText || aiMessages[aiMessages.length - 1].textContent;
    if (!lastAIContent) {
        alert('No AI response to copy.');
        return;
    }
    
    // Add to bottom of editor
    if (editor && typeof editor.getValue === 'function' && typeof editor.setValue === 'function') {
        // Monaco Editor
        const current = editor.getValue();
        editor.setValue(current + (current.endsWith('\n') ? '' : '\n') + lastAIContent + '\n');
        
        // Update preview if available
        if (window.updatePreviewAndStructure) {
            window.updatePreviewAndStructure(editor.getValue());
        }
    } else if (fallbackEditor) {
        // Fallback textarea
        const current = fallbackEditor.value;
        fallbackEditor.value = current + (current.endsWith('\n') ? '' : '\n') + lastAIContent + '\n';
        
        // Update preview if available
        if (window.updatePreviewAndStructure) {
            window.updatePreviewAndStructure(fallbackEditor.value);
        }
    } else {
        alert('Editor not available.');
        return;
    }
    
    console.log('[AI Chat] Copied AI response to editor.');
    if (window.showNotification) {
        window.showNotification('AI response copied to editor.', 'success');
    }
}

// --- Clear Chat Messages ---
function clearChat() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const confirmed = confirm('Are you sure you want to clear all chat messages?');
    if (confirmed) {
        chatMessages.innerHTML = '';
        console.log('[AI Chat] Chat messages cleared.');
        if (window.showNotification) {
            window.showNotification('Chat cleared.', 'success');
        }
    }
}

// --- Restart Chat Session ---
function restartChat() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    // Clear messages without confirmation
    chatMessages.innerHTML = '';
    
    // Show new context message
    showChatContext();
    
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
            console.log('[AI Chat] Key pressed:', e.key, 'KeyCode:', e.keyCode);
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
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'style') {
                        const isVisible = !chatPane.style.display || chatPane.style.display !== 'none';
                        if (isVisible) {
                            chatInput.focus();
                            showChatContext();
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
/clear - Clear all chat messages
/restart - Start a new chat session
/save - Save chat history to file
/settings - Show current AI configuration
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
            
        case '/load':
            loadEditorToChat();
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
function showChatContext() {
    const chatMessages = document.getElementById('chat-messages');
    const contextDisplay = document.getElementById('chat-context-display');
    
    // Update header context
    const currentFile = window.currentFilePath;
    if (contextDisplay) {
        if (currentFile) {
            const fileName = currentFile.split('/').pop() || currentFile.split('\\').pop();
            contextDisplay.textContent = `Context: ${fileName} | Type /help for commands`;
        } else {
            contextDisplay.textContent = 'No file open | Type /help for commands';
        }
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
    
    contextMessage += '\n\nEditor content will be automatically included with your messages.\nType /help for available commands or ask me anything about your code.';
    
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

// --- Show AI Settings ---
async function showAISettings() {
    try {
        // Get available providers
        const providers = await window.electronAPI.invoke('get-available-ai-providers');
        const defaultProvider = await window.electronAPI.invoke('get-default-ai-provider');
        
        let settingsMessage = '🤖 **Current AI Configuration**\n\n';
        
        if (providers && providers.length > 0) {
            settingsMessage += `**Available Providers:** ${providers.join(', ')}\n`;
            settingsMessage += `**Default Provider:** ${defaultProvider || 'Not set'}\n\n`;
        } else {
            settingsMessage += '❌ **No AI providers configured**\n\n';
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
        
        settingsMessage += '\n💡 To change settings, use the menu: Preferences → AI Configuration';
        
        addChatMessage(settingsMessage, 'AI');
    } catch (error) {
        addChatMessage(`Error getting AI settings: ${error.message}`, 'AI');
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