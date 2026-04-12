/**
 * DeepSeek Model Implementation
 * API compatible with OpenAI's chat completions format
 */

import { OpenAICompatibleModel } from '../BaseAIModel';
import { AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from '../AIModelProvider';

export class DeepSeekModel extends OpenAICompatibleModel {
  readonly name = 'DeepSeek';
  readonly provider: ModelProvider = 'deepseek';

  protected getDefaultBaseUrl(): string {
    return 'https://api.deepseek.com/v1';
  }

  protected getDefaultModel(): string {
    return 'deepseek-chat';
  }

  getAvailableModels(): string[] {
    return [
      'deepseek-chat',
      'deepseek-coder'
    ];
  }
}

// Singleton
let instance: DeepSeekModel | null = null;

export function getDeepSeekModel(): DeepSeekModel {
  if (!instance) {
    instance = new DeepSeekModel();
  }
  return instance;
}

export default DeepSeekModel;
