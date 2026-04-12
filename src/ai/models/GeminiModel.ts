/**
 * Google Gemini Model Implementation
 * Uses Google AI API format (generateContent)
 */

import { BaseAIModel } from '../BaseAIModel';
import { AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from '../AIModelProvider';

export class GeminiModel extends BaseAIModel {
  readonly name = 'Google Gemini';
  readonly provider: ModelProvider = 'gemini';

  private apiKey: string = '';

  protected getDefaultBaseUrl(): string {
    return 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  protected getDefaultModel(): string {
    return 'gemini-2.0-flash';
  }

  async initialize(config: AIConfig): Promise<boolean> {
    try {
      this.config = config;
      this.apiKey = config.apiKey;
      this.baseUrl = config.baseUrl || this.getDefaultBaseUrl();
      this.model = config.model || this.getDefaultModel();
      return await this.test();
    } catch (error) {
      console.error('Failed to initialize Gemini:', error);
      return false;
    }
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error('Gemini not configured. Call initialize() first.');
    }

    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    // Convert messages to Gemini format
    const contents = options.messages
      .filter(m => m.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

    const systemInstruction = options.messages.find(m => m.role === 'system');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction.content }] } : undefined,
        generationConfig: {
          temperature: options.temperature ?? this.config?.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? this.config?.maxTokens ?? 2048
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content,
      model: this.model,
      provider: 'gemini',
      finishReason: data.candidates?.[0]?.finishReason
    };
  }

  async *streamChat(options: ChatCompletionOptions): AsyncGenerator<{ delta: string; done: boolean }> {
    if (!this.isConfigured()) {
      throw new Error('Gemini not configured. Call initialize() first.');
    }

    const url = `${this.baseUrl}/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    const contents = options.messages
      .filter(m => m.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: options.temperature ?? this.config?.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? this.config?.maxTokens ?? 2048
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const reader = (response.body as unknown as ReadableStream<Uint8Array>)?.getReader();
    if (!reader) throw new Error('Failed to get response reader');

    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (delta) yield { delta, done: false };
          } catch {}
        }
      }
    }

    yield { delta: '', done: true };
  }

  async test(): Promise<boolean> {
    if (!this.apiKey) return false;
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
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-pro'
    ];
  }
}

// Singleton
let instance: GeminiModel | null = null;

export function getGeminiModel(): GeminiModel {
  if (!instance) {
    instance = new GeminiModel();
  }
  return instance;
}

export default GeminiModel;
