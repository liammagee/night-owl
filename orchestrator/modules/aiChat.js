// === AI Chat Module ===
// Handles AI chat functionality including:
// - Chat message display and management
// - Sending messages to AI service
// - Loading editor content to chat
// - Copying AI responses to editor

// --- Chat Message Management ---
function addChatMessage(message, sender) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message', `chat-message-${sender.toLowerCase()}`);

    const senderSpan = document.createElement('span');
    senderSpan.classList.add('chat-sender');
    senderSpan.textContent = sender === 'User' ? 'You: ' : 'AI: ';

    const contentSpan = document.createElement('span');
    contentSpan.classList.add('chat-content');
    
    // Basic sanitization/rendering (consider a Markdown library for AI responses)
    if (sender === 'AI') {
        // Render basic markdown like newlines
        contentSpan.innerHTML = message.replace(/\n/g, '<br>');
    } else {
        contentSpan.textContent = message;
    }

    messageDiv.appendChild(senderSpan);
    messageDiv.appendChild(contentSpan);
    chatMessages.appendChild(messageDiv);

    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
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

    try {
        const result = await window.electronAPI.invoke('send-chat-message', userMessage);
        
        // Remove typing indicator
        const typingIndicator = chatMessages.lastChild;
        if (typingIndicator && typingIndicator.textContent.includes('AI: ...')) {
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
        if (typingIndicator && typingIndicator.textContent.includes('AI: ...')) {
            chatMessages.removeChild(typingIndicator);
        }
        addChatMessage('Error communicating with the AI service.', 'AI');
    } finally {
        chatInput.disabled = false; // Re-enable input
        if (chatSendBtn) chatSendBtn.disabled = false;
        chatInput.focus(); // Keep focus on input
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
            const result = await window.electronAPI.invoke('perform-save-as', chatHistoryText);
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
    
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatInput = document.getElementById('chat-input');
    const loadEditorToChatBtn = document.getElementById('load-editor-to-chat-btn');
    const copyAIResponseBtn = document.getElementById('copy-ai-response-btn');
    
    // Send button event listener
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendChatMessage);
    }
    
    // Enter key event listener for chat input
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            // Send on Enter key, but allow Shift+Enter for newlines
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent default newline insertion
                sendChatMessage();
            }
        });
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
function processChatCommand(message) {
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
/save - Save chat history to file
/help - Show this help message
/load - Load editor content to chat input`, 'AI');
            return true;
            
        case '/load':
            loadEditorToChat();
            return true;
            
        default:
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
        const isCommand = processChatCommand(message);
        if (isCommand) {
            chatInput.value = '';
            return;
        }
    }
    
    // Regular message - send to AI
    await sendChatMessage();
}

// --- Export for Global Access ---
// Make functions available globally for onclick handlers and other modules
window.sendChatMessage = sendChatMessage;
window.loadEditorToChat = loadEditorToChat;
window.copyAIResponseToEditor = copyAIResponseToEditor;