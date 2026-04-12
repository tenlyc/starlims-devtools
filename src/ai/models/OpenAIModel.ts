/**
 * OpenAI Model Implementation
 * Supports GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo, etc.
 */

import { OpenAICompatibleModel } from '../BaseAIModel';
import { AIConfig, ChatCompletionOptions, ChatCompletionResponse, ModelProvider } from '../AIModelProvider';

export class OpenAIModel extends OpenAICompatibleModel {
  readonly name = 'OpenAI';
  readonly provider: ModelProvider = 'openai';

  protected getDefaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  protected getDefaultModel(): string {
    return 'gpt-4o';
  }

  getAvailableModels(): string[] {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo'
    ];
  }
}

// Singleton
let instance: OpenAIModel | null = null;

export function getOpenAIModel(): OpenAIModel {
  if (!instance) {
    instance = new OpenAIModel();
  }
  return instance;
}

export default OpenAIModel;
