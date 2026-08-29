/**
 * Claude AI Model Implementation (Reserved for future use)
 * This is a placeholder for Claude API integration
 */

import { IAIModel, AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from './AIModelProvider';
// Using native browser fetch

/**
 * Claude Model implementation
 * Note: This is a placeholder. Full Claude API integration requires:
 * 1. Installing @anthropic-ai/sdk or similar
 * 2. Proper API key handling
 * 3. Anthropic API endpoint configuration
 */
export class ClaudeModel implements IAIModel {
  readonly name: string = 'Claude';
  readonly provider: ModelProvider = 'claude';

  private config: AIConfig | null = null;
  private baseUrl = 'https://api.anthropic.com/v1';
  private model = 'claude-3-5-sonnet-20241022';

  /**
   * Available Claude models
   */
  static readonly AVAILABLE_MODELS = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
  ];

  /**
   * Initialize the Claude model with API configuration
   */
  async initialize(config: AIConfig): Promise<boolean> {
    try {
      this.config = config;

      if (config.baseUrl) {
        this.baseUrl = config.baseUrl;
      }

      if (config.model) {
        this.model = config.model;
      }

      // Validate configuration by making a test request
      return await this.test();
    } catch (error) {
      console.error('Failed to initialize Claude model:', error);
      return false;
    }
  }

  /**
   * Check if model is properly configured
   */
  isConfigured(): boolean {
    return this.config !== null &&
           this.config.apiKey.length > 0 &&
           this.config.provider === 'claude';
  }

  /**
   * Send a chat completion request to Claude API
   * Note: Claude uses a different API format than OpenAI
   */
  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error('Claude model not configured. Call initialize() first.');
    }

    // Claude API format
    const url = `${this.baseUrl}/messages`;

    const requestBody = {
      model: this.model,
      messages: options.messages.map(msg => ({
        role: msg.role === 'system' ? 'user' : msg.role, // Claude doesn't support system role in messages
        content: msg.content
      })),
      temperature: options.temperature ?? this.config?.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this.config?.maxTokens ?? 4096,
      stream: false
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config!.apiKey,
          'anthropic-version': '2023-06-01',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Claude API error:', response.status, errorText);
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        content: data.content?.[0]?.text || '',
        model: data.model || this.model,
        provider: 'claude',
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens || 0,
          completionTokens: data.usage.output_tokens || 0,
          totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
        } : undefined,
        finishReason: data.stop_reason
      };
    } catch (error: any) {
      console.error('Claude chat error:', error);
      throw new Error(`Claude chat failed: ${error.message}`);
    }
  }

  /**
   * Stream chat completion
   */
  async *streamChat(options: ChatCompletionOptions): AsyncGenerator<{ delta: string; done: boolean }> {
    if (!this.isConfigured()) {
      throw new Error('Claude model not configured. Call initialize() first.');
    }

    const url = `${this.baseUrl}/messages`;

    const requestBody = {
      model: this.model,
      messages: options.messages.map(msg => ({
        role: msg.role === 'system' ? 'user' : msg.role,
        content: msg.content
      })),
      temperature: options.temperature ?? this.config?.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this.config?.maxTokens ?? 4096,
      stream: true
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config!.apiKey,
          'anthropic-version': '2023-06-01',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} ${errorText}`);
      }

      const reader = (response.body as unknown as ReadableStream<Uint8Array>)?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          buffer += decoder.decode(value, { stream: !done });

          // Parse SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                yield { delta: '', done: true };
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.content?.[0]?.text || '';
                if (delta) {
                  yield { delta, done: false };
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      yield { delta: '', done: true };
    } catch (error: any) {
      console.error('Claude stream error:', error);
      throw new Error(`Claude streaming failed: ${error.message}`);
    }
  }

  /**
   * Test the API connection
   */
  async test(): Promise<boolean> {
    if (!this.config?.apiKey) {
      return false;
    }

    try {
      // Simple test: send a minimal request
      const response = await this.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 10
      });

      return response.content.length > 0;
    } catch (error) {
      console.error('Claude test failed:', error);
      return false;
    }
  }

  /**
   * Get model info
   */
  getModelInfo(): { name: string; provider: ModelProvider; model: string } {
    return {
      name: this.name,
      provider: this.provider,
      model: this.model
    };
  }
}

// Singleton instance
let claudeInstance: ClaudeModel | null = null;

export function getClaudeModel(): ClaudeModel {
  if (!claudeInstance) {
    claudeInstance = new ClaudeModel();
  }
  return claudeInstance;
}

export default ClaudeModel;
