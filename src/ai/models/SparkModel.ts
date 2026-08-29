/**
 * iFlytek Spark Model Implementation
 * Uses proprietary authentication and API format
 */

import { BaseAIModel } from '../BaseAIModel';
import { AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from '../AIModelProvider';

export class SparkModel extends BaseAIModel {
  readonly name = 'iFlytek Spark';
  readonly provider: ModelProvider = 'spark';

  private appId = '';
  private apiSecret = '';
  private apiKey = '';

  protected getDefaultBaseUrl(): string {
    return 'https://spark-api.xf-yun.com/v3.1/chat';
  }

  protected getDefaultModel(): string {
    return 'generalv3.5';
  }

  async initialize(config: AIConfig): Promise<boolean> {
    try {
      this.config = config;
      this.baseUrl = config.baseUrl || this.getDefaultBaseUrl();
      this.model = config.model || this.getDefaultModel();
      // Spark uses different auth - typically appId + apiSecret + apiKey
      // These would need to be passed in apiKey field in a combined format
      // or via baseUrl. For now, assume apiKey contains the necessary info
      return await this.test();
    } catch (error) {
      console.error('Failed to initialize Spark:', error);
      return false;
    }
  }

  private async getAuthToken(): Promise<string> {
    // iFlytek Spark uses HMAC-SHA256 authentication
    // This is a simplified version - full implementation would need
    // proper timestamp and signature generation
    return this.config?.apiKey || '';
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error('Spark not configured. Call initialize() first.');
    }

    const url = this.baseUrl;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        header: {
          app_id: this.appId || 'default',
          uid: 'user'
        },
        parameter: {
          chat: {
            domain: this.model,
            temperature: options.temperature ?? this.config?.temperature ?? 0.5,
            max_tokens: options.maxTokens ?? this.config?.maxTokens ?? 2048
          }
        },
        payload: {
          message: {
            text: options.messages.map(m => ({
              role: m.role === 'system' ? 'assistant' : m.role,
              content: m.content
            }))
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Spark API error:', response.status, errorText);
      throw new Error(`Spark API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.payload?.choices?.text?.[0]?.content || '';

    return {
      content,
      model: this.model,
      provider: 'spark'
    };
  }

  async *streamChat(options: ChatCompletionOptions): AsyncGenerator<{ delta: string; done: boolean }> {
    if (!this.isConfigured()) {
      throw new Error('Spark not configured. Call initialize() first.');
    }

    // Note: Spark streaming would need proper SSE handling
    // Simplified implementation
    const response = await this.chat(options);
    yield { delta: response.content, done: false };
    yield { delta: '', done: true };
  }

  async test(): Promise<boolean> {
    if (!this.config?.apiKey) return false;
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
    return [
      'generalv3.5',
      'generalv3',
      'generalv2',
      'generalv1'
    ];
  }
}

// Singleton
let instance: SparkModel | null = null;

export function getSparkModel(): SparkModel {
  if (!instance) {
    instance = new SparkModel();
  }
  return instance;
}

export default SparkModel;
