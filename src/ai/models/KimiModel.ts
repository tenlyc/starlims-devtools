/**
 * Kimi (Moonshot) Model Implementation
 * API compatible with OpenAI's chat completions format
 */

import { OpenAICompatibleModel } from '../BaseAIModel';
import { AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from '../AIModelProvider';

export class KimiModel extends OpenAICompatibleModel {
  readonly name = 'Kimi';
  readonly provider: ModelProvider = 'kimi';

  protected getDefaultBaseUrl(): string {
    return 'https://api.moonshot.cn/v1';
  }

  protected getDefaultModel(): string {
    return 'moonshot-v1-8k';
  }

  getAvailableModels(): string[] {
    return [
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k'
    ];
  }
}

// Singleton
let instance: KimiModel | null = null;

export function getKimiModel(): KimiModel {
  if (!instance) {
    instance = new KimiModel();
  }
  return instance;
}

export default KimiModel;
