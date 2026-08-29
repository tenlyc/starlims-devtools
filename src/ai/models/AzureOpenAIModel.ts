/**
 * Azure OpenAI Model Implementation
 * Uses Azure-specific endpoint format and API version
 */

import { BaseAIModel } from '../BaseAIModel';
import { AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from '../AIModelProvider';

export class AzureOpenAIModel extends BaseAIModel {
  readonly name = 'Azure OpenAI';
  readonly provider: ModelProvider = 'azure-openai';

  protected getDefaultBaseUrl(): string {
    return '';
  }

  protected getDefaultModel(): string {
    return '';
  }

  async initialize(config: AIConfig): Promise<boolean> {
    try {
      this.config = config;
      this.model = config.model || '';
      // Azure URL is constructed from resource name and deployment
      return await this.test();
    } catch (error) {
      console.error('Failed to initialize Azure OpenAI:', error);
      return false;
    }
  }

  private buildAzureUrl(): string {
    if (!this.config) throw new Error('Not configured');
    const resourceName = this.config.resourceName || '';
    const deployment = this.config.model || '';
    const apiVersion = this.config.apiVersion || '2024-02-15-preview';
    return `https://${resourceName}.openai.azure.com/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error('Azure OpenAI not configured. Call initialize() first.');
    }

    const url = this.buildAzureUrl();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.config!.apiKey,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        messages: options.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: options.temperature ?? this.config?.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? this.config?.maxTokens ?? 2048,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure OpenAI API error:', response.status, errorText);
      throw new Error(`Azure OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  async *streamChat(options: ChatCompletionOptions): AsyncGenerator<{ delta: string; done: boolean }> {
    if (!this.isConfigured()) {
      throw new Error('Azure OpenAI not configured. Call initialize() first.');
    }

    const url = this.buildAzureUrl();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.config!.apiKey,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        messages: options.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: options.temperature ?? this.config?.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? this.config?.maxTokens ?? 2048,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI API error: ${response.status} ${errorText}`);
    }

    const reader = (response.body as unknown as ReadableStream<Uint8Array>)?.getReader();
    if (!reader) throw new Error('Failed to get response reader');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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
            if (delta) yield { delta, done: false };
          } catch {
            // Ignore incomplete SSE chunks and continue with the next event.
          }
        }
      }
    }

    yield { delta: '', done: true };
  }

  async test(): Promise<boolean> {
    if (!this.config?.apiKey || !this.config.resourceName || !this.config.model) {
      return false;
    }
    try {
      const response = await this.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 10
      });
      return response.content.length > 0;
    } catch {
      return false;
    }
  }

  getAvailableModels(): string[] {
    // Models depend on Azure deployments
    return [];
  }
}

// Singleton
let instance: AzureOpenAIModel | null = null;

export function getAzureOpenAIModel(): AzureOpenAIModel {
  if (!instance) {
    instance = new AzureOpenAIModel();
  }
  return instance;
}

export default AzureOpenAIModel;
