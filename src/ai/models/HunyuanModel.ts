/**
 * Tencent Hunyuan Model Implementation
 * Uses Tencent Cloud authentication
 */

import { OpenAICompatibleModel } from '../BaseAIModel';
import { AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from '../AIModelProvider';

export class HunyuanModel extends OpenAICompatibleModel {
  readonly name = 'Tencent Hunyuan';
  readonly provider: ModelProvider = 'hunyuan';

  protected getDefaultBaseUrl(): string {
    return 'https://hunyuan.cloud.tencent.com/api/v1/chat/completions';
  }

  protected getDefaultModel(): string {
    return 'hunyuan-vision';
  }

  async initialize(config: AIConfig): Promise<boolean> {
    try {
      this.config = config;
      this.baseUrl = config.baseUrl || this.getDefaultBaseUrl();
      this.model = config.model || this.getDefaultModel();
      return await this.test();
    } catch (error) {
      console.error('Failed to initialize Hunyuan:', error);
      return false;
    }
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error('Hunyuan not configured. Call initialize() first.');
    }

    // Tencent uses Bearer auth with SecretId/SecretKey signing
    // Simplified - assumes apiKey contains the auth token
    const url = this.baseUrl;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config!.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
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
      console.error('Hunyuan API error:', response.status, errorText);
      throw new Error(`Hunyuan API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
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
      'hunyuan-vision',
      'hunyuan'
    ];
  }
}

// Singleton
let instance: HunyuanModel | null = null;

export function getHunyuanModel(): HunyuanModel {
  if (!instance) {
    instance = new HunyuanModel();
  }
  return instance;
}

export default HunyuanModel;
