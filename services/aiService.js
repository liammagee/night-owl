// AI Service - Abstracted interface for multiple AI providers
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Check if fetch is available, if not use a fallback or require node-fetch
let fetch;
try {
  fetch = globalThis.fetch;
  if (!fetch) {
    // For CommonJS with node-fetch v3 (ESM), we need to use dynamic import
    console.log('[AIService] Using node-fetch for API calls');
    fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
  }
} catch (error) {
  console.warn('[AIService] fetch not available, some providers may not work:', error.message);
}

class AIService {
  constructor() {
    this.providers = new Map();
    this.defaultProvider = null;
    this.conversationHistory = []; // Store conversation messages
    this.currentSystemMessage = null; // Track current system message
    
    // Log AI settings from environment
    console.log('[AIService] AI Settings from environment:');
    console.log(`  Temperature: ${process.env.AI_TEMPERATURE || '0.7 (default)'}`);
    console.log(`  Max Tokens: ${process.env.AI_MAX_TOKENS || '2000 (default)'}`);
    console.log(`  Default Provider: ${process.env.DEFAULT_AI_PROVIDER || 'auto-detect'}`);
    
    this.initializeProviders();
  }

  initializeProviders() {
    // Check for preferred default provider from environment
    const preferredProvider = process.env.DEFAULT_AI_PROVIDER;
    
    // OpenAI Provider
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        this.providers.set('openai', new OpenAIProvider(openai));
        console.log('[AIService] OpenAI provider initialized');
        
        // Set as default if it matches preference or no default is set
        if (preferredProvider === 'openai' || (!this.defaultProvider && !preferredProvider)) {
          this.defaultProvider = 'openai';
        }
      } catch (error) {
        console.error('[AIService] Error initializing OpenAI provider:', error);
      }
    }

    // Anthropic Provider
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        this.providers.set('anthropic', new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
        console.log('[AIService] Anthropic provider initialized');
        
        if (preferredProvider === 'anthropic' || (!this.defaultProvider && !preferredProvider)) {
          this.defaultProvider = 'anthropic';
        }
      } catch (error) {
        console.error('[AIService] Error initializing Anthropic provider:', error);
      }
    }

    // Groq Provider
    if (process.env.GROQ_API_KEY) {
      try {
        this.providers.set('groq', new GroqProvider(process.env.GROQ_API_KEY));
        console.log('[AIService] Groq provider initialized');
        
        if (preferredProvider === 'groq' || (!this.defaultProvider && !preferredProvider)) {
          this.defaultProvider = 'groq';
        }
      } catch (error) {
        console.error('[AIService] Error initializing Groq provider:', error);
      }
    }

    // OpenRouter Provider
    if (process.env.OPENROUTER_API_KEY) {
      try {
        this.providers.set('openrouter', new OpenRouterProvider(process.env.OPENROUTER_API_KEY));
        console.log('[AIService] OpenRouter provider initialized');
        
        if (preferredProvider === 'openrouter' || (!this.defaultProvider && !preferredProvider)) {
          this.defaultProvider = 'openrouter';
        }
      } catch (error) {
        console.error('[AIService] Error initializing OpenRouter provider:', error);
      }
    }

    // Local AI Provider (OpenAI-compatible)
    try {
      // Default URL if not configured - will be updated from settings later
      const localAIUrl = process.env.LOCAL_AI_URL || 'http://localhost:1234/';
      this.providers.set('local', new LocalAIProvider(localAIUrl));
      console.log('[AIService] Local AI provider initialized');
      console.log(`[AIService] Local AI URL: ${localAIUrl}`);
      
      if (preferredProvider === 'local' || (!this.defaultProvider && !preferredProvider)) {
        this.defaultProvider = 'local';
      }
    } catch (error) {
      console.error('[AIService] Error initializing Local AI provider:', error);
    }

    // Google Gemini Provider
    if (process.env.GOOGLE_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        this.providers.set('gemini', new GeminiProvider(genAI));
        console.log('[AIService] Google Gemini provider initialized');
        
        if (preferredProvider === 'gemini' || (!this.defaultProvider && !preferredProvider)) {
          this.defaultProvider = 'gemini';
        }
      } catch (error) {
        console.error('[AIService] Error initializing Google Gemini provider:', error);
      }
    }

    // Set default provider based on environment variable
    const envDefaultProvider = process.env.DEFAULT_AI_PROVIDER;
    if (envDefaultProvider && this.providers.has(envDefaultProvider)) {
      this.defaultProvider = envDefaultProvider;
      console.log(`[AIService] Default provider set from environment: ${this.defaultProvider}`);
    }
    
    console.log(`[AIService] Initialized ${this.providers.size} providers. Default: ${this.defaultProvider}`);
  }

  async sendMessage(message, options = {}) {
    // Check verbose logging setting early
    const verboseLogging = options.settings?.verboseLogging || false;
    
    // Extract options with defaults
    let provider = options.provider || this.defaultProvider;
    
    // Handle 'auto' provider by mapping to 'local' or first available provider
    if (provider === 'auto') {
      if (this.providers.has('local')) {
        provider = 'local';
        if (verboseLogging) console.log('[AIService] Auto provider mapped to: local');
      } else if (this.providers.size > 0) {
        // Fallback to first available provider
        provider = Array.from(this.providers.keys())[0];
        if (verboseLogging) console.log(`[AIService] Auto provider mapped to first available: ${provider}`);
      } else {
        // No providers available
        console.error('[AIService] No AI providers available');
        return {
          content: 'AI service is not available. Please check your configuration.',
          error: 'No AI providers configured'
        };
      }
    }
    
    const model = options.model;
    const systemMessage = options.systemMessage || 'You are a helpful assistant integrated into a Markdown editor for Hegelian philosophy and pedagogy. Provide thoughtful, educational responses.';
    const temperature = options.temperature !== undefined ? options.temperature : (parseFloat(process.env.AI_TEMPERATURE) || 0.7);
    const maxTokens = options.maxTokens !== undefined ? options.maxTokens : (parseInt(process.env.AI_MAX_TOKENS) || 2000);
    const settings = options.settings;
    const newConversation = options.newConversation || false;

    // Handle conversation state
    if (newConversation || this.currentSystemMessage !== systemMessage) {
      this.restartConversation(systemMessage);
    }

    // Add user message to history
    this.addToHistory('user', message);
    
    if (verboseLogging) {
      console.log(`[AIService] 🚀 sendMessage called with provider: ${provider}, model: ${model}`);
      console.log('[AIService] 📝 Full API Request Details:');
      console.log('[AIService] ============================================');
      console.log('[AIService] Provider:', provider || 'default');
      console.log('[AIService] Model:', model || 'provider default');
      console.log('[AIService] Temperature:', temperature);
      console.log('[AIService] Max Tokens:', maxTokens);
      console.log('[AIService] Message Length:', message.length, 'characters');
      console.log('[AIService] Conversation History Length:', this.conversationHistory.length, 'messages');
      console.log('[AIService] ============================================');
    } else {
      console.log(`[AIService] 🚀 AI request: ${provider}${model ? `/${model}` : ''} (${message.length} chars)`);
    }
    
    if (verboseLogging) {
      console.log('[AIService] 🔧 SYSTEM PROMPT:');
      console.log('[AIService] --------------------------------------------');
      console.log(systemMessage);
      console.log('[AIService] --------------------------------------------');
      
      console.log('[AIService] 💬 USER MESSAGE (FULL):');
      console.log('[AIService] --------------------------------------------');
      console.log(message);
      console.log('[AIService] --------------------------------------------');
      
      console.log('[AIService] 📊 Configuration Details:');
      console.log('[AIService] Available providers:', Array.from(this.providers.keys()));
      console.log('[AIService] Default provider (from service):', this.defaultProvider);
      console.log('[AIService] Actual provider (after options):', provider);
      console.log('[AIService] Model requested:', model || '(provider default)');
      console.log('[AIService] Options passed in:', JSON.stringify(options, null, 2));
      console.log('[AIService] Settings from main process:', settings ? JSON.stringify(settings, null, 2) : 'none');
      console.log('[AIService] ============================================');
    }

    if (!this.providers.has(provider)) {
      throw new Error(`Provider '${provider}' not available. Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
    }

    const providerInstance = this.providers.get(provider);
    console.log(`[AIService] Using provider instance:`, providerInstance.constructor.name);
    
    try {
      const response = await providerInstance.sendMessage(message, {
        model,
        systemMessage,
        temperature,
        maxTokens,
        conversationHistory: this.conversationHistory,
        verboseLogging
      });
      
      // Add assistant response to history
      this.addToHistory('assistant', response.content);
      
      if (verboseLogging) {
        console.log(`[AIService] ✅ Successfully got response from ${provider}`);
        console.log('[AIService] 📥 API Response Details:');
        console.log('[AIService] --------------------------------------------');
        console.log('[AIService] Provider:', provider);
        console.log('[AIService] Model Used:', response.model);
        console.log('[AIService] Response Length:', response.content?.length || 0, 'characters');
        if (response.usage) {
          console.log('[AIService] Token Usage:', JSON.stringify(response.usage, null, 2));
        }
        console.log('[AIService] 💬 AI RESPONSE (FULL):');
        console.log('[AIService] --------------------------------------------');
        console.log(response.content);
        console.log('[AIService] --------------------------------------------');
      } else {
        console.log(`[AIService] ✅ Response: ${provider}${response.model ? `/${response.model}` : ''} (${response.content?.length || 0} chars)`);
      }
      
      return {
        response: response.content,
        provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      // Remove the user message from history if the request failed
      if (this.conversationHistory.length > 0 && 
          this.conversationHistory[this.conversationHistory.length - 1].role === 'user') {
        this.conversationHistory.pop();
      }
      
      console.error(`[AIService] Error with ${provider}:`, error.message);
      console.error(`[AIService] Full error:`, error);
      
      // Provide user-friendly error messages for specific provider issues
      if (provider === 'local' && error.message.includes('fetch failed')) {
        const enhancedError = new Error(
          `🔌 Local AI Connection Failed\n\n` +
          `The local AI server appears to be unreachable. Please check:\n\n` +
          `• Is your local AI server (like Ollama, LocalAI, or LM Studio) running?\n` +
          `• Is it accessible at the configured URL?\n` +
          `• Does it support OpenAI-compatible API endpoints?\n\n` +
          `Original error: ${error.message}`
        );
        enhancedError.code = 'LOCAL_AI_CONNECTION_FAILED';
        throw enhancedError;
      }
      
      throw error;
    }
  }

  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }

  getProviderModels(provider) {
    if (!this.providers.has(provider)) {
      return [];
    }
    return this.providers.get(provider).getAvailableModels();
  }

  getDefaultProvider() {
    return this.defaultProvider;
  }

  setDefaultProvider(provider) {
    // Handle 'auto' provider
    if (provider === 'auto') {
      if (this.providers.has('local')) {
        this.defaultProvider = 'local';
        console.log('[AIService] Auto provider set to: local');
      } else if (this.providers.size > 0) {
        this.defaultProvider = Array.from(this.providers.keys())[0];
        console.log(`[AIService] Auto provider set to first available: ${this.defaultProvider}`);
      } else {
        console.error('[AIService] No providers available to set as default');
        this.defaultProvider = 'auto'; // Keep as auto, will be handled in sendMessage
      }
    } else if (this.providers.has(provider)) {
      this.defaultProvider = provider;
      console.log(`[AIService] Default provider set to: ${provider}`);
    } else {
      console.warn(`[AIService] Provider '${provider}' not available, keeping current default: ${this.defaultProvider}`);
    }
  }

  // Update Local AI URL configuration
  updateLocalAIUrl(newUrl) {
    try {
      if (this.providers.has('local')) {
        // Re-initialize the Local AI provider with new URL
        this.providers.set('local', new LocalAIProvider(newUrl));
        console.log(`[AIService] Local AI URL updated to: ${newUrl}`);
        return true;
      } else {
        console.warn('[AIService] Local AI provider not found, cannot update URL');
        return false;
      }
    } catch (error) {
      console.error('[AIService] Error updating Local AI URL:', error);
      return false;
    }
  }

  getCurrentConfiguration() {
    const provider = this.defaultProvider;
    const providerInstance = this.providers.get(provider);
    
    return {
      success: true,
      provider: provider || 'none',
      model: providerInstance ? this.getDefaultModelForProvider(provider) : 'unknown',
      availableProviders: this.getAvailableProviders(),
      availableModels: provider ? this.getProviderModels(provider) : []
    };
  }

  getDefaultModelForProvider(provider) {
    const defaults = {
      openai: process.env.OPENAI_MODEL || 'gpt-5',
      anthropic: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      groq: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
      openrouter: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
      local: process.env.LOCAL_AI_MODEL || 'local-model'
    };
    
    return defaults[provider] || 'auto';
  }

  // Conversation management methods
  clearConversation() {
    this.conversationHistory = [];
    this.currentSystemMessage = null;
    console.log('[AIService] Conversation history cleared');
  }

  restartConversation(systemMessage = null) {
    this.clearConversation();
    if (systemMessage) {
      this.currentSystemMessage = systemMessage;
    }
    console.log('[AIService] Conversation restarted');
  }

  getConversationHistory() {
    return [...this.conversationHistory]; // Return a copy
  }

  addToHistory(role, content) {
    this.conversationHistory.push({ role, content, timestamp: new Date().toISOString() });
    
    // Keep conversation history manageable (last 20 exchanges = 40 messages)
    const maxMessages = 40;
    if (this.conversationHistory.length > maxMessages) {
      this.conversationHistory = this.conversationHistory.slice(-maxMessages);
      console.log(`[AIService] Trimmed conversation history to last ${maxMessages} messages`);
    }
  }

  // Image generation method
  async generateImage(prompt, options = {}) {
    const provider = options.provider || this.defaultProvider;
    
    console.log(`[AIService] 🎨 Image generation requested`);
    console.log(`[AIService] Provider: ${provider}`);
    console.log(`[AIService] Prompt: ${prompt.substring(0, 100)}...`);
    
    if (!this.providers.has(provider)) {
      throw new Error(`Provider ${provider} not available`);
    }
    
    const providerInstance = this.providers.get(provider);
    
    // Check if provider supports image generation
    if (!providerInstance.generateImage) {
      throw new Error(`Provider ${provider} does not support image generation`);
    }
    
    try {
      const result = await providerInstance.generateImage(prompt, options);
      console.log(`[AIService] ✅ Image generated successfully`);
      return result;
    } catch (error) {
      console.error(`[AIService] ❌ Image generation failed:`, error);
      throw error;
    }
  }

  // Check if a provider supports image generation
  supportsImageGeneration(provider) {
    if (!this.providers.has(provider)) {
      return false;
    }
    const providerInstance = this.providers.get(provider);
    return providerInstance.imageGenerationSupport || false;
  }
}

// Base Provider Interface
class BaseProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async sendMessage(message, options) {
    throw new Error('sendMessage must be implemented by provider');
  }

  getAvailableModels() {
    throw new Error('getAvailableModels must be implemented by provider');
  }
}

// OpenAI Provider Implementation
class OpenAIProvider extends BaseProvider {
  constructor(openaiClient) {
    super();
    this.client = openaiClient;
    this.imageGenerationSupport = true; // OpenAI supports DALL-E image generation
  }

  async sendMessage(message, options) {
    const {
      model = process.env.OPENAI_MODEL || 'gpt-5',
      systemMessage,
      conversationHistory = [],
      verboseLogging = false
    } = options;
      // temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
      // maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,

    // Build messages array with conversation history
    const messages = [{ role: 'system', content: systemMessage }];
    
    // Add conversation history (excluding the current user message which is already in history)
    const historyMessages = conversationHistory.slice(0, -1); // Exclude last message (current user message)
    for (const historyMsg of historyMessages) {
      messages.push({ role: historyMsg.role, content: historyMsg.content });
    }
    
    // Add current user message
    messages.push({ role: 'user', content: message });

    console.log(`[OpenAIProvider] 📤 Sending to OpenAI API`);
    console.log(`[OpenAIProvider] Model: ${model}`);
    console.log(`[OpenAIProvider] Messages in conversation: ${messages.length}`);
    if (verboseLogging) {
      console.log(`[OpenAIProvider] Full API Payload:`, JSON.stringify({
        model,
        messages,
      }, null, 2));
    }
//       max_completion_tokens: maxTokens

    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages,
      });
//         max_completion_tokens: maxTokens

      console.log(`[OpenAIProvider] 📥 Received response from OpenAI`);
      console.log(`[OpenAIProvider] Choices count: ${completion.choices?.length}`);
      console.log(`[OpenAIProvider] Response model: ${completion.model}`);
      console.log(`[OpenAIProvider] Usage:`, completion.usage);

      return {
        content: completion.choices[0]?.message?.content,
        model: completion.model,
        usage: completion.usage
      };
    } catch (error) {
      console.error(`[OpenAIProvider] API call failed:`, error.message);
      if (error.response) {
        console.error(`[OpenAIProvider] API response status:`, error.response.status);
        console.error(`[OpenAIProvider] API response data:`, error.response.data);
      }
      throw error;
    }
  }

  async generateImage(prompt, options = {}) {
    const {
      model = 'dall-e-3', // or 'dall-e-2'
      size = '1024x1024', // '1024x1024', '1792x1024', '1024x1792' for dall-e-3
      quality = 'standard', // 'standard' or 'hd' for dall-e-3
      n = 1,
      style = 'vivid' // 'vivid' or 'natural' for dall-e-3
    } = options;

    console.log(`[OpenAIProvider] 🎨 Generating image with DALL-E`);
    console.log(`[OpenAIProvider] Model: ${model}`);
    console.log(`[OpenAIProvider] Size: ${size}`);
    console.log(`[OpenAIProvider] Quality: ${quality}`);
    
    try {
      const response = await this.client.images.generate({
        model,
        prompt,
        n,
        size,
        quality,
        style
      });

      console.log(`[OpenAIProvider] ✅ Image generated successfully`);
      
      // Return image data in a consistent format
      return {
        images: response.data.map(img => ({
          url: img.url,
          revised_prompt: img.revised_prompt, // DALL-E 3 returns this
          base64: img.b64_json // If response_format was set to 'b64_json'
        })),
        provider: 'openai',
        model
      };
    } catch (error) {
      console.error('[OpenAIProvider] Image generation error:', error);
      throw new Error(`OpenAI image generation failed: ${error.message}`);
    }
  }

  getAvailableModels() {
    return [
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-3.5-turbo'
    ];
  }
}

// Anthropic Provider Implementation
class AnthropicProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
    // Note: Would need to install @anthropic-ai/sdk
    // For now, we'll implement a placeholder that uses fetch
  }

  async sendMessage(message, options) {
    const {
      model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      systemMessage,
      temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
      maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
      conversationHistory = [],
      verboseLogging = false
    } = options;

    // Build messages array with conversation history
    const messages = [];
    
    // Add conversation history (excluding the current user message which is already in history)
    const historyMessages = conversationHistory.slice(0, -1); // Exclude last message (current user message)
    for (const historyMsg of historyMessages) {
      messages.push({ role: historyMsg.role, content: historyMsg.content });
    }
    
    // Add current user message
    messages.push({ role: 'user', content: message });

    const apiPayload = {
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemMessage,
      messages
    };

    console.log(`[AnthropicProvider] 📤 Sending to Anthropic API`);
    console.log(`[AnthropicProvider] Model: ${model}`);
    if (verboseLogging) {
      console.log(`[AnthropicProvider] Full API Payload:`, JSON.stringify(apiPayload, null, 2));
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(apiPayload)
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`[AnthropicProvider] 📥 Received response from Anthropic`);
    console.log(`[AnthropicProvider] Response model: ${data.model}`);
    console.log(`[AnthropicProvider] Usage:`, data.usage);
    console.log(`[AnthropicProvider] Content blocks: ${data.content?.length}`);
    
    return {
      content: data.content[0]?.text,
      model: data.model,
      usage: data.usage
    };
  }

  getAvailableModels() {
    return [
      'claude-opus-4-1-20250805',
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }
}

// Groq Provider Implementation
class GroqProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
  }

  async sendMessage(message, options) {
    const {
      model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
      systemMessage,
      temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
      maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
      conversationHistory = [],
      verboseLogging = false
    } = options;

    // Build messages array with conversation history
    const messages = [{ role: 'system', content: systemMessage }];
    
    // Add conversation history (excluding the current user message which is already in history)
    const historyMessages = conversationHistory.slice(0, -1); // Exclude last message (current user message)
    for (const historyMsg of historyMessages) {
      messages.push({ role: historyMsg.role, content: historyMsg.content });
    }
    
    // Add current user message
    messages.push({ role: 'user', content: message });

    const apiPayload = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    };

    console.log(`[GroqProvider] 📤 Sending to Groq API`);
    console.log(`[GroqProvider] Model: ${model}`);
    if (verboseLogging) {
      console.log(`[GroqProvider] Full API Payload:`, JSON.stringify(apiPayload, null, 2));
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(apiPayload)
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`[GroqProvider] 📥 Received response from Groq`);
    console.log(`[GroqProvider] Response model: ${data.model}`);
    console.log(`[GroqProvider] Usage:`, data.usage);
    console.log(`[GroqProvider] Choices count: ${data.choices?.length}`);
    
    return {
      content: data.choices[0]?.message?.content,
      model: data.model,
      usage: data.usage
    };
  }

  getAvailableModels() {
    return [
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'llama-3.2-90b-text-preview',
      'llama-3.2-11b-text-preview',
      'mixtral-8x7b-32768',
      'gemma2-9b-it'
    ];
  }
}

// OpenRouter Provider Implementation
class OpenRouterProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
  }

  async sendMessage(message, options) {
    const {
      model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
      systemMessage,
      temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
      maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
      conversationHistory = [],
      verboseLogging = false
    } = options;

    // Build messages array with conversation history
    const messages = [{ role: 'system', content: systemMessage }];
    
    // Add conversation history (excluding the current user message which is already in history)
    const historyMessages = conversationHistory.slice(0, -1); // Exclude last message (current user message)
    for (const historyMsg of historyMessages) {
      messages.push({ role: historyMsg.role, content: historyMsg.content });
    }
    
    // Add current user message
    messages.push({ role: 'user', content: message });

    const apiPayload = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    };

    console.log(`[OpenRouterProvider] 📤 Sending to OpenRouter API`);
    console.log(`[OpenRouterProvider] Model: ${model}`);
    if (verboseLogging) {
      console.log(`[OpenRouterProvider] Full API Payload:`, JSON.stringify(apiPayload, null, 2));
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/yourusername/hegel-pedagogy-ai',
        'X-Title': 'Hegel Pedagogy AI'
      },
      body: JSON.stringify(apiPayload)
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`[OpenRouterProvider] 📥 Received response from OpenRouter`);
    console.log(`[OpenRouterProvider] Response model: ${data.model}`);
    console.log(`[OpenRouterProvider] Usage:`, data.usage);
    console.log(`[OpenRouterProvider] Choices count: ${data.choices?.length}`);
    
    return {
      content: data.choices[0]?.message?.content,
      model: data.model,
      usage: data.usage
    };
  }

  getAvailableModels() {
    return [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'openai/gpt-4',
      'openai/gpt-4-turbo',
      'meta-llama/llama-3.1-70b-instruct',
      'google/gemini-pro-1.5',
      'mistralai/mistral-large'
    ];
  }
}

// Local AI Provider Implementation (OpenAI-compatible)
class LocalAIProvider extends BaseProvider {
  constructor(baseUrl) {
    super(); // No API key needed for local
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.apiUrl = this.baseUrl + 'v1/chat/completions';
  }

  async sendMessage(message, options) {
    const {
      model = process.env.LOCAL_AI_MODEL || 'local-model',
      systemMessage,
      temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
      maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
      conversationHistory = [],
      verboseLogging = false
    } = options;

    // Build messages array similar to OpenAI format
    const messages = [];
    
    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    }
    
    // Add conversation history
    for (const historyMsg of conversationHistory) {
      messages.push({ role: historyMsg.role, content: historyMsg.content });
    }
    
    // Add current user message if not already in history
    if (!conversationHistory.length || conversationHistory[conversationHistory.length - 1].content !== message) {
      messages.push({ role: 'user', content: message });
    }

    const apiPayload = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false
    };

    console.log(`[LocalAIProvider] 📤 Sending to Local AI`);
    console.log(`[LocalAIProvider] URL: ${this.apiUrl}`);
    console.log(`[LocalAIProvider] Model: ${model}`);
    console.log(`[LocalAIProvider] Messages in conversation: ${messages.length}`);
    if (verboseLogging) {
      console.log(`[LocalAIProvider] Full API Payload:`, JSON.stringify(apiPayload, null, 2));
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiPayload),
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local AI API request failed: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = await response.json();
      
      console.log(`[LocalAIProvider] 📥 Received response from Local AI`);
      console.log(`[LocalAIProvider] Response model: ${data.model}`);
      console.log(`[LocalAIProvider] Usage:`, data.usage);
      console.log(`[LocalAIProvider] Choices count: ${data.choices?.length}`);
      
      return {
        content: data.choices[0]?.message?.content,
        model: data.model || model,
        usage: data.usage
      };
    } catch (error) {
      console.error(`[LocalAIProvider] API call failed:`, error.message);
      console.error(`[LocalAIProvider] Target URL:`, this.apiUrl);
      console.error(`[LocalAIProvider] Base URL:`, this.baseUrl);
      
      // Enhanced error reporting
      let errorMessage = 'Local AI request failed: ';
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage += `Connection refused. Is your local AI server running at ${this.baseUrl}?`;
      } else if (error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo ENOTFOUND')) {
        errorMessage += `Host not found. Please check the server URL: ${this.baseUrl}`;
      } else if (error.code === 'ECONNRESET') {
        errorMessage += `Connection was reset by the server. The local AI service may be overloaded.`;
      } else if (error.message.includes('fetch failed')) {
        errorMessage += `Network request failed. Please verify:\n` +
          `• Local AI server is running at ${this.baseUrl}\n` +
          `• Server is accessible from this machine\n` +
          `• No firewall is blocking the connection\n` +
          `• Server supports OpenAI-compatible API at /v1/chat/completions`;
      } else if (error.name === 'TimeoutError') {
        errorMessage += `Request timed out after 30 seconds. The local AI server may be slow or unresponsive.`;
      } else {
        errorMessage += error.message;
      }
      
      if (error.response) {
        console.error(`[LocalAIProvider] API response status:`, error.response.status);
        console.error(`[LocalAIProvider] API response data:`, error.response.data);
      }
      
      throw new Error(errorMessage);
    }
  }

  async testConnection() {
    try {
      console.log(`[LocalAIProvider] Testing connection to ${this.baseUrl}`);
      
      // Try to fetch models endpoint first (simpler test)
      const modelsUrl = this.baseUrl + 'v1/models';
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[LocalAIProvider] ✅ Connection successful. Available models:`, data.data?.length || 'unknown');
        return { success: true, models: data.data };
      } else {
        console.log(`[LocalAIProvider] ⚠️ Models endpoint returned ${response.status}. Server may be running but not fully ready.`);
        return { success: false, error: `Server returned ${response.status}` };
      }
    } catch (error) {
      console.error(`[LocalAIProvider] ❌ Connection test failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  getAvailableModels() {
    // These are generic model names - the actual models depend on what's loaded in the local AI server
    return [
      'local-model',
      'llama',
      'codellama',
      'mistral',
      'neural-chat',
      'vicuna',
      'alpaca'
    ];
  }
}

// Google Gemini Provider Implementation
class GeminiProvider extends BaseProvider {
  constructor(genAI) {
    super();
    this.genAI = genAI;
    this.imageGenerationSupport = true; // Gemini supports image generation
  }

  async sendMessage(message, options) {
    const {
      model = process.env.GOOGLE_MODEL || 'gemini-1.5-flash',
      systemMessage,
      temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
      maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
      conversationHistory = [],
      verboseLogging = false,
      images = [] // Support for image inputs
    } = options;

    // Get the generative model
    const genModel = this.genAI.getGenerativeModel({ 
      model,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      }
    });

    // Build the conversation with proper formatting
    const chat = genModel.startChat({
      history: this.buildHistory(conversationHistory, systemMessage),
    });

    console.log(`[GeminiProvider] 📤 Sending to Google Gemini`);
    console.log(`[GeminiProvider] Model: ${model}`);
    console.log(`[GeminiProvider] Temperature: ${temperature}`);
    console.log(`[GeminiProvider] Max Tokens: ${maxTokens}`);
    if (images && images.length > 0) {
      console.log(`[GeminiProvider] Images attached: ${images.length}`);
    }

    try {
      // Prepare the message with images if provided
      let prompt = message;
      const parts = [{ text: message }];
      
      // Add images to the prompt if provided
      if (images && images.length > 0) {
        for (const image of images) {
          if (image.base64) {
            parts.push({
              inlineData: {
                mimeType: image.mimeType || 'image/jpeg',
                data: image.base64
              }
            });
          } else if (image.url) {
            // For URLs, we'd need to fetch and convert to base64
            console.warn('[GeminiProvider] URL images not yet supported, skipping');
          }
        }
      }

      // Send message and get response
      const result = await chat.sendMessage(parts);
      const response = await result.response;
      const text = response.text();

      console.log(`[GeminiProvider] 📥 Received response from Google Gemini`);
      console.log(`[GeminiProvider] Response length: ${text.length} characters`);

      return {
        content: text,
        provider: 'gemini',
        model,
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount,
          completionTokens: response.usageMetadata?.candidatesTokenCount,
          totalTokens: response.usageMetadata?.totalTokenCount
        }
      };
    } catch (error) {
      console.error('[GeminiProvider] Error:', error);
      throw new Error(`Gemini API request failed: ${error.message}`);
    }
  }

  buildHistory(conversationHistory, systemMessage) {
    const history = [];
    
    // Add system message as the first user message if provided
    if (systemMessage) {
      history.push({
        role: 'user',
        parts: [{ text: `System: ${systemMessage}` }]
      });
      history.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }]
      });
    }

    // Add conversation history
    for (const msg of conversationHistory) {
      history.push({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }]
      });
    }

    return history;
  }

  async generateImage(prompt, options = {}) {
    const {
      model = 'imagen-3', // Google's image generation model
      size = '1024x1024',
      quality = 'standard',
      n = 1
    } = options;

    console.log(`[GeminiProvider] 🎨 Generating image with Google Imagen`);
    console.log(`[GeminiProvider] Prompt: ${prompt}`);
    console.log(`[GeminiProvider] Size: ${size}`);
    
    // Note: Google's Imagen API is separate from Gemini and requires different setup
    // For now, we'll use Gemini's ability to understand and describe images
    // but actual image generation would require Imagen API access
    
    throw new Error('Image generation with Google Imagen not yet implemented. Please use OpenAI for image generation.');
  }

  getAvailableModels() {
    return [
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b', 
      'gemini-1.5-pro',
      'gemini-1.0-pro',
      'gemini-pro-vision' // For multimodal inputs
    ];
  }
}

module.exports = AIService;