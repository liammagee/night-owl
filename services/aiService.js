// AI Service - Abstracted interface for multiple AI providers
const { OpenAI } = require('openai');

class AIService {
  constructor() {
    this.providers = new Map();
    this.defaultProvider = null;
    this.initializeProviders();
  }

  initializeProviders() {
    // OpenAI Provider
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        this.providers.set('openai', new OpenAIProvider(openai));
        console.log('[AIService] OpenAI provider initialized');
        
        // Set as default if no default is set
        if (!this.defaultProvider) {
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
        
        if (!this.defaultProvider) {
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
        
        if (!this.defaultProvider) {
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
        
        if (!this.defaultProvider) {
          this.defaultProvider = 'openrouter';
        }
      } catch (error) {
        console.error('[AIService] Error initializing OpenRouter provider:', error);
      }
    }

    console.log(`[AIService] Initialized ${this.providers.size} providers. Default: ${this.defaultProvider}`);
  }

  async sendMessage(message, options = {}) {
    const {
      provider = this.defaultProvider,
      model,
      systemMessage = 'You are a helpful assistant integrated into a Markdown editor for Hegelian philosophy and pedagogy. Provide thoughtful, educational responses.',
      temperature = 0.7,
      maxTokens = 2000
    } = options;

    if (!this.providers.has(provider)) {
      throw new Error(`Provider '${provider}' not available. Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
    }

    const providerInstance = this.providers.get(provider);
    
    try {
      const response = await providerInstance.sendMessage(message, {
        model,
        systemMessage,
        temperature,
        maxTokens
      });
      
      console.log(`[AIService] Successfully got response from ${provider}`);
      return {
        response: response.content,
        provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      console.error(`[AIService] Error with ${provider}:`, error);
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
    if (this.providers.has(provider)) {
      this.defaultProvider = provider;
      console.log(`[AIService] Default provider set to: ${provider}`);
    } else {
      throw new Error(`Provider '${provider}' not available`);
    }
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
  }

  async sendMessage(message, options) {
    const {
      model = process.env.OPENAI_MODEL || 'gpt-4',
      systemMessage,
      temperature = 0.7,
      maxTokens = 2000
    } = options;

    const completion = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: message }
      ],
      temperature,
      max_tokens: maxTokens
    });

    return {
      content: completion.choices[0]?.message?.content,
      model: completion.model,
      usage: completion.usage
    };
  }

  getAvailableModels() {
    return [
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
      temperature = 0.7,
      maxTokens = 2000
    } = options;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessage,
        messages: [
          { role: 'user', content: message }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.content[0]?.text,
      model: data.model,
      usage: data.usage
    };
  }

  getAvailableModels() {
    return [
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
      temperature = 0.7,
      maxTokens = 2000
    } = options;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: message }
        ],
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
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
      temperature = 0.7,
      maxTokens = 2000
    } = options;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/yourusername/hegel-pedagogy-ai',
        'X-Title': 'Hegel Pedagogy AI'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: message }
        ],
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
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

module.exports = AIService;