/**
 * ByteDance Doubao Model Implementation
 * Uses Volcano Engine API (ark.cn-beijing.volces.com)
 */

import { OpenAICompatibleModel } from '../BaseAIModel';
import { AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from '../AIModelProvider';

export class DoubaoModel extends OpenAICompatibleModel {
  readonly name = 'ByteDance Doubao';
  readonly provider: ModelProvider = 'doubao';

  protected getDefaultBaseUrl(): string {
    return 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  }

  protected getDefaultModel(): string {
    return 'doubao-pro-32k';
  }

  async initialize(config: AIConfig): Promise<boolean> {
    try {
      this.config = config;
      this.baseUrl = config.baseUrl || this.getDefaultBaseUrl();
      this.model = config.model || this.getDefaultModel();
      return await this.test();
    } catch (error) {
      console.error('Failed to initialize Doubao:', error);
      return false;
    }
  }

  getAvailableModels(): string[] {
    return [
      'doubao-pro-32k',
      'doubao-pro-128k',
      'doubao-lite-32k'
    ];
  }
}

// Singleton
let instance: DoubaoModel | null = null;

export function getDoubaoModel(): DoubaoModel {
  if (!instance) {
    instance = new DoubaoModel();
  }
  return instance;
}

export default DoubaoModel;
