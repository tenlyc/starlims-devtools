const LOOPBACK_NO_PROXY = ['localhost', '127.0.0.1', '::1'];

function splitNoProxy(value: string | undefined): string[] {
  return (value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

/** Keep local MCP traffic away from HTTP/SOCKS proxies without changing external proxy settings. */
export function withLocalMcpNoProxy(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const entries = [...splitNoProxy(env.NO_PROXY), ...splitNoProxy(env.no_proxy), ...LOOPBACK_NO_PROXY];
  const noProxy = [...new Set(entries.map((entry) => entry.toLowerCase()))].join(',');
  return { ...env, NO_PROXY: noProxy, no_proxy: noProxy };
}
