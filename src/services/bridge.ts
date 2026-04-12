/**
 * STARLIMS Bridge Service
 * Handles communication with local STARLIMS Bridge (localhost:5468)
 * Used for SignalR communication and form launching
 */

// Using native browser fetch

const BRIDGE_URL = 'http://localhost:5468/';
const SIGNALR_URL = `${BRIDGE_URL}signalr/`;
const HUBS_URL = `${SIGNALR_URL}hubs`;

export interface BridgeRequestBody {
  webAddress: string;
  'aspnet-sessionid'?: string;
  'starlims-sessionid'?: string;
  langid?: string;
  needsGUID?: boolean;
  formParameters?: any[];
  [key: string]: any;
}

export interface XFDFormRequest {
  appName: string;
  formName: string;
  sessionInfo: {
    aspnetSessionId: string;
    starlimsSessionId: string;
    langid: string;
  };
  formParameters?: any[];
}

/**
 * Check if STARLIMS Bridge is running
 */
export async function isBridgeRunning(): Promise<boolean> {
  try {
    const response = await fetch(HUBS_URL, {
      method: 'GET'
    });
    await response.text();
    console.log(`STARLIMS Bridge running on ${BRIDGE_URL}`);
    return true;
  } catch (error) {
    console.log(`STARLIMS Bridge is not reachable on ${BRIDGE_URL}`);
    return false;
  }
}

/**
 * Connect to STARLIMS Bridge (SignalR hub)
 */
export async function connectBridge(
  _sessionInfo: { webAddress: string; aspnetSessionId: string; starlimsSessionId: string; langid: string }
): Promise<boolean> {
  const isRunning = await isBridgeRunning();
  if (!isRunning) {
    return false;
  }

  // In a full implementation, this would establish a SignalR connection
  // For now, we just verify the bridge is running
  console.log('Bridge connection verified');
  return true;
}

/**
 * Launch XFD Form via Bridge
 */
export async function launchXFDForm(
  starlimsUrl: string,
  appName: string,
  formName: string,
  sessionInfo: { aspnetSessionId: string; starlimsSessionId: string; langid: string }
): Promise<boolean> {
  try {
    const bridgeURL = `${BRIDGE_URL}xfdforms/${appName}/${formName}`;

    const requestBody: BridgeRequestBody = {
      webAddress: starlimsUrl,
      'aspnet-sessionid': sessionInfo.aspnetSessionId,
      'starlims-sessionid': sessionInfo.starlimsSessionId,
      langid: sessionInfo.langid,
      needsGUID: true,
      formParameters: []
    };

    const response = await fetch(bridgeURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error(`Bridge request failed: ${response.status} ${response.statusText}`);
      return false;
    }

    const result = await response.json();
    console.log('XFD Form launched successfully:', result);
    return true;
  } catch (error) {
    console.error('Failed to launch XFD Form via Bridge:', error);
    return false;
  }
}

/**
 * Launch HTML Form via Bridge
 */
export async function launchHTMLForm(
  starlimsUrl: string,
  formId: string,
  sessionInfo: { aspnetSessionId: string; starlimsSessionId: string; langid: string },
  action: 'open' | 'debug' | 'design' = 'open'
): Promise<boolean> {
  try {
    const endpoint = action === 'debug' ? 'debug' : action === 'design' ? 'design' : 'open';
    const bridgeURL = `${BRIDGE_URL}htmlforms/${endpoint}/${formId}`;

    const requestBody: BridgeRequestBody = {
      webAddress: starlimsUrl,
      'aspnet-sessionid': sessionInfo.aspnetSessionId,
      'starlims-sessionid': sessionInfo.starlimsSessionId,
      langid: sessionInfo.langid,
      needsGUID: false,
      formParameters: []
    };

    const response = await fetch(bridgeURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error(`Bridge request failed: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to launch HTML Form via Bridge:', error);
    return false;
  }
}

/**
 * Get Bridge status
 */
export async function getBridgeStatus(): Promise<{ running: boolean; version?: string }> {
  try {
    const response = await fetch(`${BRIDGE_URL}status`, {
      method: 'GET'
    });
    if (response.ok) {
      const status = await response.json();
      return { running: true, version: status.version };
    }
    return { running: false };
  } catch {
    return { running: false };
  }
}

export default {
  isBridgeRunning,
  connectBridge,
  launchXFDForm,
  launchHTMLForm,
  getBridgeStatus
};
