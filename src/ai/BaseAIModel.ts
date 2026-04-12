/**
 * Base AIModel Classes
 * Provides common functionality for AI model implementations
 */

import {
  IAIModel,
  AIConfig,
  ChatCompletionOptions,
  ChatCompletionResponse,
  ModelProvider,
  StreamChunk
} from './AIModelProvider';

/**
 * Abstract base class for AI models
 */
export abstract class BaseAIModel implements IAIModel {
  abstract readonly name: string;
  abstract readonly provider: ModelProvider;

  protected config: AIConfig | null = null;
  protected baseUrl: string = '';
  protected model: string = '';

  abstract initialize(config: AIConfig): Promise<boolean>;

  abstract chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse>;

  abstract test(): Promise<boolean>;

  abstract getAvailableModels(): string[];

  isConfigured(): boolean {
    return this.config !== null && this.config.apiKey.length > 0;
  }

  getModelInfo(): { name: string; provider: ModelProvider; model: string } {
    return {
      name: this.name,
      provider: this.provider,
      model: this.model
    };
  }

  /**
   * Standard SSE streaming parser for OpenAI-compatible APIs
   */
  protected async *streamChatCommon(
    url: string,
    requestBody: Record<string, unknown>,
    apiKey: string
  ): AsyncGenerator<StreamChunk> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${errorText}`);
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
  }

  /**
   * Build standard chat completions request body
   */
  protected buildRequestBody(options: ChatCompletionOptions): Record<string, unknown> {
    return {
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
  }

  /**
   * Parse standard chat completions response
   */
  protected parseResponse(data: any): ChatCompletionResponse {
    const message = data.choices?.[0]?.message;
    const usage = data.usage;

    return {
      content: message?.content || '',
      model: data.model || this.model,
      provider: this.provider,
      usage: usage ? {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0
      } : undefined,
      finishReason: data.choices?.[0]?.finish_reason
    };
  }
}

/**
 * Base class for OpenAI-compatible API providers
 * Many Chinese AI providers (DeepSeek, Kimi, Qwen) use OpenAI-compatible APIs
 */
export abstract class OpenAICompatibleModel extends BaseAIModel {
  protected abstract getDefaultBaseUrl(): string;

  async initialize(config: AIConfig): Promise<boolean> {
    try {
      this.config = config;
      this.baseUrl = config.baseUrl || this.getDefaultBaseUrl();
      this.model = config.model || this.getDefaultModel();
      return await this.test();
    } catch (error) {
      console.error(`Failed to initialize ${this.name}:`, error);
      return false;
    }
  }

  protected abstract getDefaultModel(): string;

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error(`${this.name} not configured. Call initialize() first.`);
    }

    const url = `${this.baseUrl}/chat/completions`;
    const requestBody = this.buildRequestBody(options);

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
      console.error(`${this.name} API error:`, response.status, errorText);
      throw new Error(`${this.name} API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  async *streamChat(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    if (!this.isConfigured()) {
      throw new Error(`${this.name} not configured. Call initialize() first.`);
    }

    const url = `${this.baseUrl}/chat/completions`;
    const requestBody = this.buildRequestBody(options);
    requestBody.stream = true;

    yield* this.streamChatCommon(url, requestBody, this.config!.apiKey);
  }

  async test(): Promise<boolean> {
    if (!this.config?.apiKey) {
      return false;
    }

    try {
      const response = await this.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 10
      });
      return response.content.length > 0;
    } catch (error) {
      console.error(`${this.name} test failed:`, error);
      return false;
    }
  }
}
