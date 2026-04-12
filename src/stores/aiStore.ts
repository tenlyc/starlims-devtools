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
    window.electronAPI?.storeSet('aiSavedConfigs', newSavedConfigs);
    window.electronAPI?.storeSet('aiProvider', config.provider);
  },

  updateConfig: (updates) => {
    const { config, savedConfigs } = get();
    if (config) {
      const newConfig = { ...config, ...updates };
      const newSavedConfigs = { ...savedConfigs, [config.provider]: newConfig };
      set({ config: newConfig, savedConfigs: newSavedConfigs });
      window.electronAPI?.storeSet('aiSavedConfigs', newSavedConfigs);
    }
  },

  clearConfig: () => {
    set({ config: null, isConfigured: false, error: null });
    window.electronAPI?.storeDelete('aiConfig');
    window.electronAPI?.storeDelete('aiProvider');
  },

  // Load config for a specific provider from saved configs
  loadProviderConfig: (provider) => {
    const { savedConfigs } = get();
    const providerConfig = savedConfigs[provider];
    if (providerConfig) {
      set({ config: providerConfig, isConfigured: true, error: null });
      window.electronAPI?.storeSet('aiProvider', provider);
    } else {
      // No saved config for this provider, create empty config
      set({ config: { provider, apiKey: '', baseUrl: '', model: '' }, isConfigured: false, error: null });
      window.electronAPI?.storeSet('aiProvider', provider);
    }
  },

  // Save current config to saved configs
  saveCurrentConfig: () => {
    const { config, savedConfigs } = get();
    if (config) {
      const newSavedConfigs = { ...savedConfigs, [config.provider]: config };
      set({ savedConfigs: newSavedConfigs, isConfigured: true });
      window.electronAPI?.storeSet('aiSavedConfigs', newSavedConfigs);
      window.electronAPI?.storeSet('aiProvider', config.provider);
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
  if (window.electronAPI) {
    const savedConfigs = await window.electronAPI.storeGet('aiSavedConfigs');
    const selectedProvider = await window.electronAPI.storeGet('aiProvider');

    if (savedConfigs) {
      useAIStore.setState({ savedConfigs });
    }

    if (selectedProvider && savedConfigs && savedConfigs[selectedProvider]) {
      useAIStore.getState().loadProviderConfig(selectedProvider);
    }
  }
}
