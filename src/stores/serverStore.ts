import { create } from 'zustand';
import { EnterpriseService, getEnterpriseService } from '../services/enterpriseService';
import { useOutputLogStore } from '../services/outputLogStore';

export interface ServerConfig {
  name: string;
  url: string;
  user?: string;
  urlSuffix?: string;
  password?: string;
}

export interface ServerState {
  // Server list
  servers: ServerConfig[];
  currentServer: ServerConfig | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  password: string;
  rememberPassword: boolean;
  showPasswordInput: boolean;

  // Actions
  setServers: (servers: ServerConfig[]) => void;
  addServer: (server: ServerConfig) => void;
  updateServer: (originalName: string, server: ServerConfig) => boolean;
  removeServer: (name: string) => void;
  selectServer: (name: string) => void;
  setPassword: (password: string) => void;
  setRememberPassword: (remember: boolean) => void;
  setShowPasswordInput: (show: boolean) => void;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  currentServer: null,
  isConnected: false,
  isConnecting: false,
  error: null,
  password: '',
  rememberPassword: false,
  showPasswordInput: false,

  setServers: (servers) => {
    set({ servers });
    window.electronAPI?.storeSet('servers', servers);
  },

  addServer: (server) => {
    const { servers } = get();
    const exists = servers.find(s => s.name === server.name);
    if (!exists) {
      const newServers = [...servers, server];
      set({ servers: newServers });
      window.electronAPI?.storeSet('servers', newServers);
    }
  },

  updateServer: (originalName, server) => {
    const { servers, currentServer } = get();
    if (servers.some((item) => item.name === server.name && item.name !== originalName)) {
      return false;
    }
    const index = servers.findIndex((item) => item.name === originalName);
    if (index < 0) return false;

    const newServers = [...servers];
    newServers[index] = server;
    const wasSelected = currentServer?.name === originalName;
    if (wasSelected) getEnterpriseService().disconnect();
    set({
      servers: newServers,
      currentServer: wasSelected ? server : currentServer,
      isConnected: wasSelected ? false : get().isConnected
    });
    window.electronAPI?.storeSet('servers', newServers);
    if (wasSelected) window.electronAPI?.storeSet('selectedServer', server.name);
    return true;
  },

  removeServer: (name) => {
    const { servers, currentServer } = get();
    const newServers = servers.filter(s => s.name !== name);
    set({
      servers: newServers,
      currentServer: currentServer?.name === name ? null : currentServer,
      isConnected: currentServer?.name === name ? false : get().isConnected
    });
    window.electronAPI?.storeSet('servers', newServers);
  },

  selectServer: (name) => {
    const { servers } = get();
    const server = servers.find(s => s.name === name);
    set({ currentServer: server || null, error: null });
  },

  setPassword: (password) => set({ password }),
  setRememberPassword: (remember) => set({ rememberPassword: remember }),
  setShowPasswordInput: (show) => set({ showPasswordInput: show }),

  setConnected: (connected) => set({ isConnected: connected }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
  setError: (error) => set({ error }),

  connect: async () => {
    const { currentServer, password } = get();
    if (!currentServer) {
      set({ error: 'No server selected' });
      return false;
    }

    if (!password) {
      set({ error: 'Password is required' });
      return false;
    }

    set({ isConnecting: true, error: null });
    useOutputLogStore.getState().addEntry({
      channel: 'starlims-operation', level: 'info', source: 'Connection',
      message: `Connecting to ${currentServer.name} as ${currentServer.user || ''}`
    });

    try {
      // Save selected server
      await window.electronAPI?.storeSet('selectedServer', currentServer.name);

      // Get enterprise service and connect
      const enterpriseService = getEnterpriseService();

      // Update service config
      enterpriseService.updateConfig(currentServer, password);

      // Attempt connection
      const success = await enterpriseService.connect(currentServer, password);
      const { rememberPassword } = get();

      if (success) {
        // Save or delete password based on remember checkbox
        if (window.electronAPI) {
          if (rememberPassword) {
            await window.electronAPI.secretsSet(`password_${currentServer.name}`, password);
            await window.electronAPI.storeDelete(`password_${currentServer.name}`);
          } else {
            await window.electronAPI.secretsDelete(`password_${currentServer.name}`);
            await window.electronAPI.storeDelete(`password_${currentServer.name}`);
          }
        }
        set({ isConnected: true, isConnecting: false, error: null });
        useOutputLogStore.getState().addEntry({
          channel: 'starlims-operation', level: 'success', source: 'Connection',
          message: `Connected to ${currentServer.name}`
        });
        return true;
      } else {
        set({
          isConnected: false,
          isConnecting: false,
          error: 'Failed to connect to STARLIMS. Please check your credentials.'
        });
        useOutputLogStore.getState().addEntry({
          channel: 'starlims-operation', level: 'error', source: 'Connection',
          message: `Failed to connect to ${currentServer.name}`
        });
        return false;
      }
    } catch (err: any) {
      console.error('Connection error:', err);
      set({
        isConnected: false,
        isConnecting: false,
        error: err.message || 'Failed to connect to STARLIMS'
      });
      useOutputLogStore.getState().addEntry({
        channel: 'starlims-operation', level: 'error', source: 'Connection',
        message: err.message || 'Failed to connect to STARLIMS'
      });
      return false;
    }
  },

  disconnect: () => {
    const serverName = get().currentServer?.name;
    const enterpriseService = getEnterpriseService();
    enterpriseService.disconnect();
    set({ isConnected: false, currentServer: null, error: null, password: '', rememberPassword: false, showPasswordInput: false });
    useOutputLogStore.getState().addEntry({
      channel: 'starlims-operation', level: 'info', source: 'Connection',
      message: `Disconnected${serverName ? ` from ${serverName}` : ''}`
    });
  }
}));

// Initialize store from electron store on load
export async function initializeServerStore() {
  if (window.electronAPI) {
    const servers = await window.electronAPI.storeGet('servers');
    const selectedServer = await window.electronAPI.storeGet('selectedServer');

    if (servers) {
      useServerStore.getState().setServers(servers);
    }
    if (selectedServer) {
      useServerStore.getState().selectServer(selectedServer);
    }
  }
}
