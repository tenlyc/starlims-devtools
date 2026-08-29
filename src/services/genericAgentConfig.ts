import type { GenericAgentConfig } from '../types/agent';

export const GENERIC_PROFILES_STORE_KEY = 'genericAgentProfiles.v2';

type StoredProfiles = {
  activeProfileId?: string;
  profiles?: Array<GenericAgentConfig & { id: string; name?: string }>;
};

export async function loadActiveGenericAgentConfig(): Promise<GenericAgentConfig | null> {
  const api = window.electronAPI;
  if (!api) return null;
  const saved = await api.storeGet(GENERIC_PROFILES_STORE_KEY).catch(() => null) as StoredProfiles | null;
  const profiles = Array.isArray(saved?.profiles) ? saved.profiles : [];
  const profile = profiles.find((candidate) => candidate.id === saved?.activeProfileId) || profiles[0];
  if (!profile) return null;
  const apiKey = await api.secretsGet(`generic-agent-api-key:${profile.id}`).catch(() => null);
  if (!apiKey || !profile.baseUrl || !profile.model) return null;
  return { baseUrl: profile.baseUrl, apiKey, model: profile.model };
}
