/**
 * AI Model Provider Interface
 * Abstract interface for AI model implementations
 */

import { MiniMaxModel } from './MiniMaxModel';
import { ClaudeModel } from './ClaudeModel';
import { OpenAIModel } from './models/OpenAIModel';
import { DeepSeekModel } from './models/DeepSeekModel';
import { KimiModel } from './models/KimiModel';
import { QwenModel } from './models/QwenModel';
import { AzureOpenAIModel } from './models/AzureOpenAIModel';
import { GeminiModel } from './models/GeminiModel';
import { SparkModel } from './models/SparkModel';
import { HunyuanModel } from './models/HunyuanModel';
import { DoubaoModel } from './models/DoubaoModel';

export type ModelProvider =
  | 'minimax'
  | 'claude'
  | 'openai'
  | 'azure-openai'
  | 'gemini'
  | 'deepseek'
  | 'kimi'
  | 'qwen'
  | 'spark'
  | 'hunyuan'
  | 'doubao'
  | 'copilot';

export interface AIConfig {
  provider: ModelProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  // Provider-specific configs
  resourceName?: string;      // Azure OpenAI
  apiVersion?: string;       // Azure OpenAI
  projectId?: string;        // Google Cloud
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  provider: ModelProvider;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'content_filter' | 'error';
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

/**
 * AI Model Interface
 */
export interface IAIModel {
  readonly name: string;
  readonly provider: ModelProvider;

  /**
   * Initialize the model with configuration
   */
  initialize(config: AIConfig): Promise<boolean>;

  /**
   * Check if model is properly configured
   */
  isConfigured(): boolean;

  /**
   * Send a chat completion request
   */
  chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse>;

  /**
   * Stream chat completion (if supported)
   */
  streamChat?(options: ChatCompletionOptions): AsyncGenerator<StreamChunk>;

  /**
   * Test the connection
   */
  test(): Promise<boolean>;

  /**
   * Get model info
   */
  getModelInfo(): { name: string; provider: ModelProvider; model: string };
}

/**
 * AI Service that manages multiple model providers
 */
export interface AIService {
  /**
   * Get current model
   */
  getCurrentModel(): IAIModel | null;

  /**
   * Set the active model provider
   */
  setModel(model: IAIModel): void;

  /**
   * Get available providers
   */
  getAvailableProviders(): ModelProvider[];

  /**
   * Register a model provider
   */
  registerProvider(provider: ModelProvider, model: IAIModel): void;

  /**
   * Unregister a model provider
   */
  unregisterProvider(provider: ModelProvider): void;
}

// Singleton instances for each provider
let miniMaxModelInstance: MiniMaxModel | null = null;
let claudeModelInstance: ClaudeModel | null = null;
let openaiModelInstance: OpenAIModel | null = null;
let azureOpenaiModelInstance: AzureOpenAIModel | null = null;
let geminiModelInstance: GeminiModel | null = null;
let deepseekModelInstance: DeepSeekModel | null = null;
let kimiModelInstance: KimiModel | null = null;
let qwenModelInstance: QwenModel | null = null;
let sparkModelInstance: SparkModel | null = null;
let hunyuanModelInstance: HunyuanModel | null = null;
let doubaoModelInstance: DoubaoModel | null = null;
let copilotModelInstance: IAIModel | null = null;

/**
 * Create a new AI model instance based on provider
 */
export function createAIModel(provider: ModelProvider): IAIModel {
  switch (provider) {
    case 'minimax':
      if (!miniMaxModelInstance) {
        miniMaxModelInstance = new MiniMaxModel();
      }
      return miniMaxModelInstance;

    case 'claude':
      if (!claudeModelInstance) {
        claudeModelInstance = new ClaudeModel();
      }
      return claudeModelInstance;

    case 'openai':
      if (!openaiModelInstance) {
        openaiModelInstance = new OpenAIModel();
      }
      return openaiModelInstance;

    case 'azure-openai':
      if (!azureOpenaiModelInstance) {
        azureOpenaiModelInstance = new AzureOpenAIModel();
      }
      return azureOpenaiModelInstance;

    case 'gemini':
      if (!geminiModelInstance) {
        geminiModelInstance = new GeminiModel();
      }
      return geminiModelInstance;

    case 'deepseek':
      if (!deepseekModelInstance) {
        deepseekModelInstance = new DeepSeekModel();
      }
      return deepseekModelInstance;

    case 'kimi':
      if (!kimiModelInstance) {
        kimiModelInstance = new KimiModel();
      }
      return kimiModelInstance;

    case 'qwen':
      if (!qwenModelInstance) {
        qwenModelInstance = new QwenModel();
      }
      return qwenModelInstance;

    case 'spark':
      if (!sparkModelInstance) {
        sparkModelInstance = new SparkModel();
      }
      return sparkModelInstance;

    case 'hunyuan':
      if (!hunyuanModelInstance) {
        hunyuanModelInstance = new HunyuanModel();
      }
      return hunyuanModelInstance;

    case 'doubao':
      if (!doubaoModelInstance) {
        doubaoModelInstance = new DoubaoModel();
      }
      return doubaoModelInstance;

    case 'copilot':
      if (!copilotModelInstance) {
        copilotModelInstance = {
          name: 'Copilot',
          provider: 'copilot',
          async initialize() { return false; },
          isConfigured() { return false; },
          async chat() { throw new Error('Not implemented'); },
          async test() { return false; },
          getModelInfo() { return { name: 'Copilot', provider: 'copilot', model: '' }; }
        };
      }
      return copilotModelInstance;

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

export default IAIModel;
