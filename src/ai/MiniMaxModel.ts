/**
 * MiniMax AI Model Implementation
 * Supports MiniMax M2.7 and other MiniMax models
 * API Documentation: https://platform.minimaxi.com/docs/guides/text-ai-coding-tools
 */

import { IAIModel, AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from './AIModelProvider';
// Using native browser fetch

export class MiniMaxModel implements IAIModel {
  readonly name: string = 'MiniMax';
  readonly provider: ModelProvider = 'minimax';

  private config: AIConfig | null = null;
  private baseUrl = 'https://api.minimax.chat/v1';  // MiniMax API endpoint
  private model = 'MiniMax-M2.7';  // MiniMax M2.7 model

  /**
   * Initialize the MiniMax model with API configuration
   */
  async initialize(config: AIConfig): Promise<boolean> {
    try {
      this.config = config;

      if (config.baseUrl) {
        this.baseUrl = config.baseUrl;
      }

      if (config.model) {
        this.model = config.model;
      } else {
        // Default to M2.7
        this.model = 'MiniMax-M2.7';
      }

      // Validate configuration by making a test request
      return await this.test();
    } catch (error) {
      console.error('Failed to initialize MiniMax model:', error);
      return false;
    }
  }

  /**
   * Check if model is properly configured
   */
  isConfigured(): boolean {
    return this.config !== null &&
           this.config.apiKey.length > 0 &&
           this.config.provider === 'minimax';
  }

  /**
   * Send a chat completion request to MiniMax API
   * MiniMax API is compatible with OpenAI's API format
   */
  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error('MiniMax model not configured. Call initialize() first.');
    }

    const url = `${this.baseUrl}/chat/completions`;

    const requestBody = {
      model: this.model,
      messages: options.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: options.temperature ?? this.config?.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this.config?.maxTokens ?? 2048,
      stream: false,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config!.apiKey}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('MiniMax API error:', response.status, errorText);
        throw new Error(`MiniMax API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Parse MiniMax/OpenAI compatible response
      const message = data.choices?.[0]?.message;
      const usage = data.usage;

      return {
        content: message?.content || '',
        model: data.model || this.model,
        provider: 'minimax',
        usage: usage ? {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0
        } : undefined,
        finishReason: data.choices?.[0]?.finish_reason
      };
    } catch (error: any) {
      console.error('MiniMax chat error:', error);
      throw new Error(`MiniMax chat failed: ${error.message}`);
    }
  }

  /**
   * Stream chat completion (if supported by MiniMax)
   */
  async *streamChat(options: ChatCompletionOptions): AsyncGenerator<{ delta: string; done: boolean }> {
    if (!this.isConfigured()) {
      throw new Error('MiniMax model not configured. Call initialize() first.');
    }

    const url = `${this.baseUrl}/chat/completions`;

    const requestBody = {
      model: this.model,
      messages: options.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: options.temperature ?? this.config?.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this.config?.maxTokens ?? 2048,
      stream: true
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config!.apiKey}`,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MiniMax API error: ${response.status} ${errorText}`);
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
                const delta = parsed.choices?.[0]?.delta?.content || '';
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
      console.error('MiniMax stream error:', error);
      throw new Error(`MiniMax streaming failed: ${error.message}`);
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
      // Simple test: try to get model info
      const response = await this.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 10
      });

      return response.content.length > 0;
    } catch (error) {
      console.error('MiniMax test failed:', error);
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
let miniMaxInstance: MiniMaxModel | null = null;

export function getMiniMaxModel(): MiniMaxModel {
  if (!miniMaxInstance) {
    miniMaxInstance = new MiniMaxModel();
  }
  return miniMaxInstance;
}

export default MiniMaxModel;
