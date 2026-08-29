import { useState, useEffect } from 'react';
import { useServerStore, ServerConfig } from '../../stores/serverStore';
import { normalizeStarlimsUrl } from '../../services/miscUtils';

interface ServerSelectorProps {
  onConnect: () => void;
}

export function ServerSelector({ onConnect }: ServerSelectorProps) {
  const {
    servers, addServer, updateServer, removeServer, selectServer,
    currentServer, setError, error, setPassword,
    password, isConnecting, connect
  } = useServerStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');

  // Form state
  const [formData, setFormData] = useState<ServerConfig>({
    name: '',
    url: '',
    user: '',
    urlSuffix: 'lims'
  });

  // Load servers and saved password on mount
  useEffect(() => {
    const loadServers = async () => {
      if (window.electronAPI) {
        const savedServers = await window.electronAPI.storeGet('servers');
        const selectedServer = await window.electronAPI.storeGet('selectedServer');
        if (savedServers) {
          useServerStore.getState().setServers(savedServers);
        }
        if (selectedServer) {
          useServerStore.getState().selectServer(selectedServer);
          // Load saved password for the selected server
          const savedPassword = await window.electronAPI.storeGet(`password_${selectedServer}`);
          if (savedPassword) {
            useServerStore.getState().setPassword(savedPassword);
            useServerStore.getState().setRememberPassword(true);
            setRememberPassword(true); // Also update local state for checkbox
            useServerStore.getState().setShowPasswordInput(true);
          } else {
            useServerStore.getState().setPassword('');
            useServerStore.getState().setRememberPassword(false);
            setRememberPassword(false); // Also update local state for checkbox
            useServerStore.getState().setShowPasswordInput(true);
          }
        }
      }
    };
    loadServers();
    window.electronAPI?.getAppVersion().then(setAppVersion).catch(() => undefined);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const resetServerForm = () => {
    setFormData({ name: '', url: '', user: '', urlSuffix: 'lims' });
    setEditingServerName(null);
    setShowAddForm(false);
  };

  const handleSaveServer = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      setError('Name and URL are required');
      return;
    }

    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeStarlimsUrl(formData.url);
    } catch {
      setError('Invalid URL format');
      return;
    }

    const server = {
      ...formData,
      name: formData.name.trim(),
      url: normalizedUrl,
      user: formData.user?.trim(),
      urlSuffix: formData.urlSuffix?.trim() || 'lims'
    };

    if (editingServerName) {
      const savedPassword = editingServerName !== server.name && window.electronAPI
        ? await window.electronAPI.storeGet(`password_${editingServerName}`)
        : null;
      if (!updateServer(editingServerName, server)) {
        setError(`A server named '${server.name}' already exists`);
        return;
      }
      if (editingServerName !== server.name && window.electronAPI) {
        if (savedPassword) await window.electronAPI.storeSet(`password_${server.name}`, savedPassword);
        await window.electronAPI.storeDelete(`password_${editingServerName}`);
      }
    } else {
      if (servers.some((item) => item.name === server.name)) {
        setError(`A server named '${server.name}' already exists`);
        return;
      }
      addServer(server);
    }

    resetServerForm();
    setError(null);
  };

  const handleDeleteServer = async (name: string) => {
    removeServer(name);
    await window.electronAPI?.storeDelete(`password_${name}`);
  };

  const handleEditServer = (server: ServerConfig) => {
    setEditingServerName(server.name);
    setFormData({ ...server, password: undefined });
    setShowAddForm(true);
    setError(null);
  };

  const handleSelectServer = async (server: ServerConfig) => {
    console.log('handleSelectServer called:', server.name);
    selectServer(server.name);
    setError(null);

    // Load saved password if exists
    if (window.electronAPI) {
      const savedPassword = await window.electronAPI.storeGet(`password_${server.name}`);
      console.log('Saved password found:', savedPassword ? 'yes (length=' + savedPassword.length + ')' : 'no');
      if (savedPassword) {
        setPassword(savedPassword);
        setRememberPassword(true);
        // Auto-fill password but don't auto-connect
        setShowPasswordInput(true);
      } else {
        setPassword('');
        setRememberPassword(false);
        setShowPasswordInput(true);
      }
    } else {
      console.log('electronAPI not available');
      setShowPasswordInput(true);
    }
  };

  const handleClearPassword = async () => {
    if (currentServer && window.electronAPI) {
      await window.electronAPI.storeDelete(`password_${currentServer.name}`);
      setPassword('');
      setRememberPassword(false);
      console.log('Password cleared for:', currentServer.name);
    }
  };

  const handleConnectClick = () => {
    if (!currentServer) {
      setError('Please select a server');
      return;
    }
    setShowPasswordInput(true);
  };

  const handlePasswordConnect = async () => {
    if (!password) {
      setError('Password is required');
      return;
    }

    const success = await connect();
    if (success) {
      // Save or delete password based on remember checkbox
      if (window.electronAPI && currentServer) {
        console.log('Saving password, rememberPassword:', rememberPassword, 'password length:', password.length);
        if (rememberPassword) {
          await window.electronAPI.storeSet(`password_${currentServer.name}`, password);
          console.log('Password saved for:', currentServer.name);
        } else {
          await window.electronAPI.storeDelete(`password_${currentServer.name}`);
          console.log('Password deleted for:', currentServer.name);
        }
      }
      setShowPasswordInput(false);
      onConnect();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && password) {
      handlePasswordConnect();
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-300 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h1 className="text-xl font-semibold text-slate-700 dark:text-white flex items-center gap-3">
            <span className="text-2xl">🔷</span>
            STARLIMS DevTools
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Connect to your STARLIMS server</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {!showPasswordInput ? (
            <>
              {/* Server list */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Select Server
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {servers.length === 0 ? (
                    <div className="text-slate-400 dark:text-slate-500 text-sm py-4 text-center">
                      No servers configured
                    </div>
                  ) : (
                    servers.map(server => (
                      <div
                        key={server.name}
                        className={`p-3 rounded border cursor-pointer transition-colors ${
                          currentServer?.name === server.name
                            ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-600'
                            : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
                        }`}
                        onClick={() => handleSelectServer(server)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-slate-700 dark:text-white">{server.name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-48">{server.url}</div>
                            {server.user && (
                              <div className="text-xs text-slate-400 dark:text-slate-500">User: {server.user}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1 text-slate-400 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                              onClick={(e) => { e.stopPropagation(); handleEditServer(server); }}
                              title="Edit server"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              className="p-1 text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                              onClick={(e) => { e.stopPropagation(); void handleDeleteServer(server.name); }}
                              title="Delete server"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add server form */}
              {showAddForm ? (
                <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded border border-slate-200 dark:border-slate-600 mb-4">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-white">
                    {editingServerName ? 'Edit Server' : 'Add New Server'}
                  </h3>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Server Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="input"
                      placeholder="Production Server"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">STARLIMS URL</label>
                    <input
                      type="text"
                      name="url"
                      value={formData.url}
                      onChange={handleInputChange}
                      className="input"
                      placeholder="https://my.starlims.server.com/STARLIMS/"
                    />
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Application root URL; a pasted starthtml.lims URL is normalized automatically.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Username (optional)</label>
                    <input
                      type="text"
                      name="user"
                      value={formData.user}
                      onChange={handleInputChange}
                      className="input"
                      placeholder="ADMIN"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">URL Suffix</label>
                    <input
                      type="text"
                      name="urlSuffix"
                      value={formData.urlSuffix}
                      onChange={handleInputChange}
                      className="input"
                      placeholder="lims"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary flex-1"
                      onClick={() => void handleSaveServer()}
                    >
                      {editingServerName ? 'Save Changes' : 'Add Server'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => { resetServerForm(); setError(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full btn btn-secondary mb-4"
                  onClick={() => {
                    setEditingServerName(null);
                    setFormData({ name: '', url: '', user: '', urlSuffix: 'lims' });
                    setShowAddForm(true);
                  }}
                >
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Server
                  </span>
                </button>
              )}

              {/* Connect button */}
              <button
                className="w-full btn btn-primary py-3 text-base"
                onClick={handleConnectClick}
                disabled={!currentServer}
              >
                Connect to STARLIMS
              </button>
            </>
          ) : (
            /* Password input */
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded border border-slate-200 dark:border-slate-600">
                <div className="text-sm text-slate-700 dark:text-white font-medium">{currentServer?.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{currentServer?.url}</div>
                {currentServer?.user && (
                  <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">User: {currentServer.user}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Enter Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={handlePasswordChange}
                    onKeyDown={handleKeyDown}
                    className="input pr-10"
                    placeholder="Password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {rememberPassword && (
                <button
                  type="button"
                  onClick={handleClearPassword}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 underline"
                >
                  Clear saved password
                </button>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberPassword"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                  className="w-4 h-4 rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="rememberPassword" className="text-sm text-slate-600 dark:text-slate-400">
                  Remember password
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  className="btn btn-primary flex-1 py-3"
                  onClick={handlePasswordConnect}
                  disabled={!password || isConnecting}
                >
                  {isConnecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Connecting...
                    </span>
                  ) : 'Connect'}
                </button>
                <button
                  className="btn btn-secondary py-3"
                  onClick={() => {
                    setShowPasswordInput(false);
                    setError(null);
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-500">
            {appVersion ? `Version ${appVersion} | ` : ''}Cross-platform STARLIMS Development Tools
          </p>
        </div>
      </div>
    </div>
  );
}
