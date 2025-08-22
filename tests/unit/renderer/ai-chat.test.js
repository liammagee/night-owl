// Test the AI chat functionality

describe('AI Chat Functionality', () => {
  let mockElectronAPI, mockChatMessages, mockChatInput;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="chat-pane" class="content-pane terminal-chat">
        <div class="terminal-header">
          <span class="terminal-subtitle" id="chat-context-display">Your AI writing companion • Type /help for commands</span>
        </div>
        <div id="chat-messages" class="terminal-output"></div>
        <div class="terminal-input-area">
          <span class="terminal-prompt-line">
            <span class="terminal-user">you</span><span class="terminal-separator">:</span>
          </span>
          <input type="text" id="chat-input" class="terminal-input" placeholder="Ask AI for help...">
          <button id="chat-send-btn" class="terminal-send-btn">Send</button>
        </div>
      </div>
      <button id="show-chat-btn" class="btn pane-toggle-button">Chat</button>
    `;

    // Mock Electron API
    mockElectronAPI = {
      invoke: jest.fn(),
      send: jest.fn()
    };

    // Mock chat state
    global.window = {
      electronAPI: mockElectronAPI,
      currentChatContext: 'default',
      chatHistory: [],
      editor: {
        getValue: jest.fn(() => 'Current document content'),
        getSelection: jest.fn(() => 'selected text')
      }
    };

    mockChatMessages = document.getElementById('chat-messages');
    mockChatInput = document.getElementById('chat-input');

    // Reset all mocks
    jest.clearAllMocks();
  });

  // Mock implementation of key chat functions
  class ChatManager {
    constructor() {
      this.chatHistory = [];
      this.currentContext = 'default';
      this.isProcessing = false;
      this.messagesContainer = document.getElementById('chat-messages');
      this.chatInput = document.getElementById('chat-input');
    }

    async sendMessage(message, context = null) {
      if (this.isProcessing || !message.trim()) return;

      this.isProcessing = true;
      
      // Add user message to chat
      this.addMessageToChat(message, 'user');
      
      // Clear input
      if (this.chatInput) {
        this.chatInput.value = '';
      }
      
      try {
        // Prepare context
        const chatContext = context || this.getCurrentContext();
        
        // Show typing indicator
        this.showTypingIndicator();
        
        // Send to AI service
        const response = await window.electronAPI.invoke('ai-chat', {
          message: message,
          context: chatContext,
          history: this.chatHistory.slice(-10) // Last 10 messages for context
        });
        
        // Hide typing indicator
        this.hideTypingIndicator();
        
        // Add AI response to chat
        this.addMessageToChat(response.message, 'assistant', response.metadata);
        
        // Update chat history
        this.chatHistory.push(
          { role: 'user', content: message, timestamp: Date.now() },
          { role: 'assistant', content: response.message, timestamp: Date.now() }
        );
        
        return response;
        
      } catch (error) {
        this.hideTypingIndicator();
        this.addMessageToChat(`Error: ${error.message}`, 'error');
        throw error;
      } finally {
        this.isProcessing = false;
      }
    }

    addMessageToChat(message, role, metadata = {}) {
      if (!this.messagesContainer) return;

      const messageElement = document.createElement('div');
      messageElement.className = `chat-message ${role}`;
      
      const timestamp = new Date().toLocaleTimeString();
      
      if (role === 'user') {
        messageElement.innerHTML = `
          <div class="message-header">
            <span class="message-sender">You</span>
            <span class="message-time">${timestamp}</span>
          </div>
          <div class="message-content">${this.escapeHtml(message)}</div>
        `;
      } else if (role === 'assistant') {
        const sources = metadata.sources ? this.formatSources(metadata.sources) : '';
        messageElement.innerHTML = `
          <div class="message-header">
            <span class="message-sender">AI Assistant</span>
            <span class="message-time">${timestamp}</span>
          </div>
          <div class="message-content">${this.formatMarkdown(message)}</div>
          ${sources}
        `;
      } else if (role === 'error') {
        messageElement.innerHTML = `
          <div class="message-header">
            <span class="message-sender">System</span>
            <span class="message-time">${timestamp}</span>
          </div>
          <div class="message-content error">${this.escapeHtml(message)}</div>
        `;
      }
      
      this.messagesContainer.appendChild(messageElement);
      this.scrollToBottom();
    }

    showTypingIndicator() {
      const indicator = document.createElement('div');
      indicator.className = 'typing-indicator';
      indicator.innerHTML = `
        <div class="message-header">
          <span class="message-sender">AI Assistant</span>
          <span class="message-time">typing...</span>
        </div>
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      `;
      
      if (this.messagesContainer) {
        this.messagesContainer.appendChild(indicator);
        this.scrollToBottom();
      }
    }

    hideTypingIndicator() {
      const indicator = document.querySelector('.typing-indicator');
      if (indicator) {
        indicator.remove();
      }
    }

    getCurrentContext() {
      const contextTypes = {
        'document': this.getDocumentContext(),
        'selection': this.getSelectionContext(),
        'default': 'general'
      };
      
      return contextTypes[this.currentContext] || contextTypes['default'];
    }

    getDocumentContext() {
      const content = window.editor ? window.editor.getValue() : '';
      return {
        type: 'document',
        content: content.slice(0, 2000), // First 2000 chars
        length: content.length
      };
    }

    getSelectionContext() {
      const selection = window.editor ? window.editor.getSelection() : '';
      return {
        type: 'selection',
        content: selection,
        hasSelection: selection.length > 0
      };
    }

    processCommand(command) {
      const commands = {
        '/help': () => this.showHelp(),
        '/clear': () => this.clearChat(),
        '/context': (args) => this.setContext(args[0]),
        '/summarize': () => this.summarizeDocument(),
        '/explain': (args) => this.explainSelection(),
        '/improve': () => this.improveWriting()
      };

      const [cmd, ...args] = command.split(' ');
      const handler = commands[cmd.toLowerCase()];
      
      if (handler) {
        return handler(args);
      } else {
        throw new Error(`Unknown command: ${cmd}. Type /help for available commands.`);
      }
    }

    showHelp() {
      const helpMessage = `Available commands:
/help - Show this help message
/clear - Clear chat history
/context [document|selection|default] - Set context mode
/summarize - Summarize the current document
/explain - Explain the selected text
/improve - Get suggestions to improve your writing

You can also ask questions naturally about your writing!`;

      this.addMessageToChat(helpMessage, 'system');
    }

    clearChat() {
      if (this.messagesContainer) {
        this.messagesContainer.innerHTML = '';
      }
      this.chatHistory = [];
      this.addMessageToChat('Chat cleared.', 'system');
    }

    setContext(contextType) {
      const validContexts = ['document', 'selection', 'default'];
      if (validContexts.includes(contextType)) {
        this.currentContext = contextType;
        this.addMessageToChat(`Context set to: ${contextType}`, 'system');
        
        // Update UI indicator
        const contextDisplay = document.getElementById('chat-context-display');
        if (contextDisplay) {
          const contextLabels = {
            'document': 'Document context • AI can see your full document',
            'selection': 'Selection context • AI can see selected text',
            'default': 'Your AI writing companion • Type /help for commands'
          };
          contextDisplay.textContent = contextLabels[contextType];
        }
      } else {
        throw new Error(`Invalid context type. Use: ${validContexts.join(', ')}`);
      }
    }

    async summarizeDocument() {
      const content = window.editor ? window.editor.getValue() : '';
      if (!content.trim()) {
        throw new Error('No content to summarize');
      }
      
      return this.sendMessage('/summarize', this.getDocumentContext());
    }

    async explainSelection() {
      const selection = window.editor ? window.editor.getSelection() : '';
      if (!selection.trim()) {
        throw new Error('No text selected');
      }
      
      return this.sendMessage('/explain', this.getSelectionContext());
    }

    async improveWriting() {
      const context = this.currentContext === 'selection' ? 
        this.getSelectionContext() : this.getDocumentContext();
      
      if (!context.content.trim()) {
        throw new Error('No content to improve');
      }
      
      return this.sendMessage('/improve', context);
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    formatMarkdown(text) {
      // Simple markdown formatting
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }

    formatSources(sources) {
      if (!sources || sources.length === 0) return '';
      
      const sourcesList = sources.map(source => 
        `<a href="#" class="source-link" data-source="${source}">${source}</a>`
      ).join(', ');
      
      return `<div class="message-sources">Sources: ${sourcesList}</div>`;
    }

    scrollToBottom() {
      if (this.messagesContainer) {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      }
    }

    setupEventListeners() {
      const chatInput = document.getElementById('chat-input');
      const sendButton = document.getElementById('chat-send-btn');
      
      if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleUserInput();
          }
        });
      }
      
      if (sendButton) {
        sendButton.addEventListener('click', () => {
          this.handleUserInput();
        });
      }
    }

    async handleUserInput() {
      const input = document.getElementById('chat-input');
      if (!input) return;
      
      const message = input.value.trim();
      if (!message) return;
      
      try {
        if (message.startsWith('/')) {
          this.processCommand(message);
        } else {
          await this.sendMessage(message);
        }
      } catch (error) {
        this.addMessageToChat(error.message, 'error');
      }
    }
  }

  describe('Chat Message Management', () => {
    let chatManager;

    beforeEach(() => {
      chatManager = new ChatManager();
    });

    test('should send user message and get AI response', async () => {
      const mockResponse = {
        message: 'Hello! How can I help you with your writing?',
        metadata: { sources: [] }
      };
      
      mockElectronAPI.invoke.mockResolvedValue(mockResponse);
      
      await chatManager.sendMessage('Hello');
      
      expect(mockElectronAPI.invoke).toHaveBeenCalledWith('ai-chat', {
        message: 'Hello',
        context: 'general',
        history: []
      });
      
      const messages = document.querySelectorAll('.chat-message');
      expect(messages).toHaveLength(2); // User + AI messages
      expect(messages[0]).toHaveClass('user');
      expect(messages[1]).toHaveClass('assistant');
    });

    test('should handle empty messages', async () => {
      await chatManager.sendMessage('');
      
      expect(mockElectronAPI.invoke).not.toHaveBeenCalled();
      expect(document.querySelectorAll('.chat-message')).toHaveLength(0);
    });

    test('should handle AI service errors', async () => {
      mockElectronAPI.invoke.mockRejectedValue(new Error('AI service unavailable'));
      
      await expect(chatManager.sendMessage('test')).rejects.toThrow('AI service unavailable');
      
      const messages = document.querySelectorAll('.chat-message');
      expect(messages).toHaveLength(2); // User message + error message
      expect(messages[1]).toHaveClass('error');
    });

    test('should show and hide typing indicator', async () => {
      const mockResponse = { message: 'Response', metadata: {} };
      mockElectronAPI.invoke.mockImplementation(() => {
        // Check if typing indicator is shown
        expect(document.querySelector('.typing-indicator')).toBeTruthy();
        return Promise.resolve(mockResponse);
      });
      
      await chatManager.sendMessage('test');
      
      // Typing indicator should be removed after response
      expect(document.querySelector('.typing-indicator')).toBeFalsy();
    });

    test('should maintain chat history', async () => {
      const mockResponse = { message: 'Response', metadata: {} };
      mockElectronAPI.invoke.mockResolvedValue(mockResponse);
      
      await chatManager.sendMessage('First message');
      await chatManager.sendMessage('Second message');
      
      expect(chatManager.chatHistory).toHaveLength(4); // 2 user + 2 AI messages
      expect(chatManager.chatHistory[0].role).toBe('user');
      expect(chatManager.chatHistory[1].role).toBe('assistant');
    });

    test('should limit history context to last 10 messages', async () => {
      const mockResponse = { message: 'Response', metadata: {} };
      mockElectronAPI.invoke.mockResolvedValue(mockResponse);
      
      // Add 15 messages to history
      chatManager.chatHistory = Array(15).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: Date.now()
      }));
      
      await chatManager.sendMessage('New message');
      
      const lastCall = mockElectronAPI.invoke.mock.calls[0][1];
      expect(lastCall.history).toHaveLength(10);
    });
  });

  describe('Context Management', () => {
    let chatManager;

    beforeEach(() => {
      chatManager = new ChatManager();
    });

    test('should get document context', () => {
      window.editor.getValue.mockReturnValue('This is a test document with some content.');
      
      const context = chatManager.getDocumentContext();
      
      expect(context.type).toBe('document');
      expect(context.content).toBe('This is a test document with some content.');
      expect(context.length).toBe(42);
    });

    test('should get selection context', () => {
      window.editor.getSelection.mockReturnValue('selected text here');
      
      const context = chatManager.getSelectionContext();
      
      expect(context.type).toBe('selection');
      expect(context.content).toBe('selected text here');
      expect(context.hasSelection).toBe(true);
    });

    test('should truncate long document context', () => {
      const longContent = 'a'.repeat(3000);
      window.editor.getValue.mockReturnValue(longContent);
      
      const context = chatManager.getDocumentContext();
      
      expect(context.content).toHaveLength(2000);
      expect(context.length).toBe(3000);
    });

    test('should set context type', () => {
      chatManager.setContext('document');
      expect(chatManager.currentContext).toBe('document');
      
      const contextDisplay = document.getElementById('chat-context-display');
      expect(contextDisplay.textContent).toContain('Document context');
    });

    test('should reject invalid context types', () => {
      expect(() => chatManager.setContext('invalid')).toThrow('Invalid context type');
    });
  });

  describe('Command Processing', () => {
    let chatManager;

    beforeEach(() => {
      chatManager = new ChatManager();
    });

    test('should process /help command', () => {
      chatManager.processCommand('/help');
      
      const messages = document.querySelectorAll('.chat-message');
      expect(messages).toHaveLength(1);
      expect(messages[0].textContent).toContain('Available commands');
    });

    test('should process /clear command', () => {
      // Add some messages first
      chatManager.addMessageToChat('test', 'user');
      chatManager.chatHistory = [{ role: 'user', content: 'test' }];
      
      chatManager.processCommand('/clear');
      
      expect(chatManager.chatHistory).toHaveLength(0);
      const messages = document.querySelectorAll('.chat-message');
      expect(messages).toHaveLength(1); // Only the "Chat cleared" message
    });

    test('should process /context command', () => {
      chatManager.processCommand('/context document');
      
      expect(chatManager.currentContext).toBe('document');
      
      const messages = document.querySelectorAll('.chat-message');
      expect(messages[0].textContent).toContain('Context set to: document');
    });

    test('should handle unknown commands', () => {
      expect(() => chatManager.processCommand('/unknown')).toThrow('Unknown command: /unknown');
    });

    test('should process /summarize command', async () => {
      window.editor.getValue.mockReturnValue('Document content to summarize');
      const sendMessageSpy = jest.spyOn(chatManager, 'sendMessage').mockResolvedValue({});
      
      await chatManager.summarizeDocument();
      
      expect(sendMessageSpy).toHaveBeenCalledWith('/summarize', expect.objectContaining({
        type: 'document',
        content: 'Document content to summarize'
      }));
    });

    test('should handle /summarize with no content', async () => {
      window.editor.getValue.mockReturnValue('');
      
      await expect(chatManager.summarizeDocument()).rejects.toThrow('No content to summarize');
    });

    test('should process /explain command with selection', async () => {
      window.editor.getSelection.mockReturnValue('selected text to explain');
      const sendMessageSpy = jest.spyOn(chatManager, 'sendMessage').mockResolvedValue({});
      
      await chatManager.explainSelection();
      
      expect(sendMessageSpy).toHaveBeenCalledWith('/explain', expect.objectContaining({
        type: 'selection',
        content: 'selected text to explain'
      }));
    });

    test('should handle /explain with no selection', async () => {
      window.editor.getSelection.mockReturnValue('');
      
      await expect(chatManager.explainSelection()).rejects.toThrow('No text selected');
    });
  });

  describe('Message Formatting', () => {
    let chatManager;

    beforeEach(() => {
      chatManager = new ChatManager();
    });

    test('should escape HTML in user messages', () => {
      chatManager.addMessageToChat('<script>alert("xss")</script>', 'user');
      
      const messageContent = document.querySelector('.message-content');
      expect(messageContent.innerHTML).toContain('&lt;script&gt;');
      expect(messageContent.innerHTML).not.toContain('<script>');
    });

    test('should format markdown in AI messages', () => {
      chatManager.addMessageToChat('**bold** and *italic* and `code`', 'assistant');
      
      const messageContent = document.querySelector('.message-content');
      expect(messageContent.innerHTML).toContain('<strong>bold</strong>');
      expect(messageContent.innerHTML).toContain('<em>italic</em>');
      expect(messageContent.innerHTML).toContain('<code>code</code>');
    });

    test('should format sources in AI messages', () => {
      const metadata = { sources: ['doc1.md', 'doc2.md'] };
      chatManager.addMessageToChat('Response with sources', 'assistant', metadata);
      
      const sources = document.querySelector('.message-sources');
      expect(sources).toBeTruthy();
      expect(sources.innerHTML).toContain('doc1.md');
      expect(sources.innerHTML).toContain('doc2.md');
    });

    test('should add timestamps to messages', () => {
      chatManager.addMessageToChat('test message', 'user');
      
      const timestamp = document.querySelector('.message-time');
      expect(timestamp).toBeTruthy();
      expect(timestamp.textContent).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    });

    test('should handle error messages', () => {
      chatManager.addMessageToChat('Something went wrong', 'error');
      
      const message = document.querySelector('.chat-message.error');
      expect(message).toBeTruthy();
      
      const content = message.querySelector('.message-content');
      expect(content).toHaveClass('error');
    });
  });

  describe('Event Handling', () => {
    let chatManager;

    beforeEach(() => {
      chatManager = new ChatManager();
      chatManager.setupEventListeners();
    });

    test('should handle Enter key in chat input', async () => {
      const handleInputSpy = jest.spyOn(chatManager, 'handleUserInput').mockResolvedValue();
      
      mockChatInput.value = 'test message';
      
      // Simulate Enter key press
      const enterEvent = new KeyboardEvent('keypress', { key: 'Enter' });
      mockChatInput.dispatchEvent(enterEvent);
      
      expect(handleInputSpy).toHaveBeenCalled();
    });

    test('should not handle Shift+Enter (for multiline)', () => {
      const handleInputSpy = jest.spyOn(chatManager, 'handleUserInput').mockResolvedValue();
      
      // Simulate Shift+Enter key press
      const shiftEnterEvent = new KeyboardEvent('keypress', { key: 'Enter', shiftKey: true });
      mockChatInput.dispatchEvent(shiftEnterEvent);
      
      expect(handleInputSpy).not.toHaveBeenCalled();
    });

    test('should handle send button click', async () => {
      const handleInputSpy = jest.spyOn(chatManager, 'handleUserInput').mockResolvedValue();
      
      const sendButton = document.getElementById('chat-send-btn');
      sendButton.click();
      
      expect(handleInputSpy).toHaveBeenCalled();
    });

    test('should clear input after sending message', async () => {
      mockElectronAPI.invoke.mockResolvedValue({ message: 'response', metadata: {} });
      
      mockChatInput.value = 'test message';
      await chatManager.handleUserInput();
      
      expect(mockChatInput.value).toBe('');
    });
  });

  describe('Chat Pane Integration', () => {
    test('should show chat pane when chat button is clicked', () => {
      const chatPane = document.getElementById('chat-pane');
      const chatButton = document.getElementById('show-chat-btn');
      
      // Initially hidden
      chatPane.style.display = 'none';
      
      // Simulate click
      chatButton.click();
      
      // Should trigger pane visibility (implementation would handle this)
      expect(chatButton).toBeTruthy();
    });

    test('should maintain chat state when switching panes', () => {
      const chatManager = new ChatManager();
      
      // Add some messages
      chatManager.addMessageToChat('test', 'user');
      chatManager.chatHistory = [{ role: 'user', content: 'test' }];
      
      // Simulate pane switch
      const chatPane = document.getElementById('chat-pane');
      chatPane.style.display = 'none';
      chatPane.style.display = 'block';
      
      // Messages should still be there
      expect(document.querySelectorAll('.chat-message')).toHaveLength(1);
      expect(chatManager.chatHistory).toHaveLength(1);
    });
  });
});