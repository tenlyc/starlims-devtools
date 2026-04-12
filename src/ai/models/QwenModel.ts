/**
 * Qwen (Alibaba) Model Implementation
 * API compatible with OpenAI's chat completions format
 */

import { OpenAICompatibleModel } from '../BaseAIModel';
import { AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from '../AIModelProvider';

export class QwenModel extends OpenAICompatibleModel {
  readonly name = 'Qwen';
  readonly provider: ModelProvider = 'qwen';

  protected getDefaultBaseUrl(): string {
    return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }

  protected getDefaultModel(): string {
    return 'qwen-plus';
  }

  getAvailableModels(): string[] {
    return [
      'qwen-plus',
      'qwen-plus-latest',
      'qwen-turbo',
      'qwen-turbo-latest',
      'qwen-max',
      'qwen-max-latest'
    ];
  }
}

// Singleton
let instance: QwenModel | null = null;

export function getQwenModel(): QwenModel {
  if (!instance) {
    instance = new QwenModel();
  }
  return instance;
}

export default QwenModel;
