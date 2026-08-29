import { create } from 'zustand';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: Date;
}

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

export interface AIState {
  config: AIConfig | null;
  savedConfigs: Record<string, AIConfig>; // Configs saved per provider
  messages: AIMessage[];
  isConfigured: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setConfig: (config: AIConfig) => void;
  updateConfig: (updates: Partial<AIConfig>) => void;
  clearConfig: () => void;
  addMessage: (message: AIMessage) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  loadProviderConfig: (provider: ModelProvider) => void;
  saveCurrentConfig: () => void;
}

const legacyAiSecretKey = (provider: ModelProvider) => `legacy-ai-api-key:${provider}`;
const sanitizeConfig = (config: AIConfig): AIConfig => ({ ...config, apiKey: '' });
const sanitizeConfigs = (configs: Record<string, AIConfig>): Record<string, AIConfig> =>
  Object.fromEntries(Object.entries(configs).map(([provider, config]) => [provider, sanitizeConfig(config)]));

function persistConfigs(configs: Record<string, AIConfig>): void {
  void window.electronAPI?.storeSet('aiSavedConfigs', sanitizeConfigs(configs));
}

function persistApiKey(config: AIConfig): void {
  const operation = config.apiKey
    ? window.electronAPI?.secretsSet(legacyAiSecretKey(config.provider), config.apiKey)
    : window.electronAPI?.secretsDelete(legacyAiSecretKey(config.provider));
  void operation;
}

export const useAIStore = create<AIState>((set, get) => ({
  config: null,
  savedConfigs: {},
  messages: [],
  isConfigured: false,
  isLoading: false,
  error: null,

  setConfig: (config) => {
    set({ config, isConfigured: true, error: null });
    // Save to savedConfigs keyed by provider
    const { savedConfigs } = get();
    const newSavedConfigs = { ...savedConfigs, [config.provider]: config };
    set({ savedConfigs: newSavedConfigs });
    // Persist all saved configs
    persistConfigs(newSavedConfigs);
    persistApiKey(config);
    void window.electronAPI?.storeSet('aiProvider', config.provider);
  },

  updateConfig: (updates) => {
    const { config, savedConfigs } = get();
    if (config) {
      const newConfig = { ...config, ...updates };
      const newSavedConfigs = { ...savedConfigs, [config.provider]: newConfig };
      set({ config: newConfig, savedConfigs: newSavedConfigs });
      persistConfigs(newSavedConfigs);
      persistApiKey(newConfig);
    }
  },

  clearConfig: () => {
    const { config, savedConfigs } = get();
    const nextSavedConfigs = config
      ? Object.fromEntries(Object.entries(savedConfigs).filter(([provider]) => provider !== config.provider))
      : savedConfigs;
    if (config) void window.electronAPI?.secretsDelete(legacyAiSecretKey(config.provider));
    persistConfigs(nextSavedConfigs);
    set({ config: null, savedConfigs: nextSavedConfigs, isConfigured: false, error: null });
    void window.electronAPI?.storeDelete('aiConfig');
    void window.electronAPI?.storeDelete('aiProvider');
  },

  // Load config for a specific provider from saved configs
  loadProviderConfig: (provider) => {
    const { savedConfigs } = get();
    const providerConfig = savedConfigs[provider];
    if (providerConfig) {
      set({ config: providerConfig, isConfigured: true, error: null });
      void window.electronAPI?.storeSet('aiProvider', provider);
    } else {
      // No saved config for this provider, create empty config
      set({ config: { provider, apiKey: '', baseUrl: '', model: '' }, isConfigured: false, error: null });
      void window.electronAPI?.storeSet('aiProvider', provider);
    }
  },

  // Save current config to saved configs
  saveCurrentConfig: () => {
    const { config, savedConfigs } = get();
    if (config) {
      const newSavedConfigs = { ...savedConfigs, [config.provider]: config };
      set({ savedConfigs: newSavedConfigs, isConfigured: true });
      persistConfigs(newSavedConfigs);
      persistApiKey(config);
      void window.electronAPI?.storeSet('aiProvider', config.provider);
    }
  },

  addMessage: (message) => {
    set(state => ({
      messages: [...state.messages, message]
    }));
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  setError: (error) => {
    set({ error });
  }
}));

// Initialize AI store from electron store
export async function initializeAIStore() {
  const api = window.electronAPI;
  if (api) {
    const savedConfigs = await api.storeGet('aiSavedConfigs') as Record<string, AIConfig> | null;
    const selectedProvider = await api.storeGet('aiProvider');

    if (savedConfigs) {
      const migratedEntries = await Promise.all(Object.entries(savedConfigs).map(async ([provider, saved]) => {
        const typedProvider = provider as ModelProvider;
        const legacyKey = typeof saved.apiKey === 'string' ? saved.apiKey : '';
        if (legacyKey) await api.secretsSet(legacyAiSecretKey(typedProvider), legacyKey);
        const apiKey = legacyKey || await api.secretsGet(legacyAiSecretKey(typedProvider)) || '';
        return [provider, { ...saved, provider: typedProvider, apiKey }] as const;
      }));
      const hydratedConfigs = Object.fromEntries(migratedEntries) as Record<string, AIConfig>;
      useAIStore.setState({ savedConfigs: hydratedConfigs });
      await api.storeSet('aiSavedConfigs', sanitizeConfigs(hydratedConfigs));

      if (selectedProvider && hydratedConfigs[selectedProvider]) {
        useAIStore.setState({
          config: hydratedConfigs[selectedProvider],
          isConfigured: Boolean(hydratedConfigs[selectedProvider].apiKey),
          error: null
        });
      }
    }
  }
}
