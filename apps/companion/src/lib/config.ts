/**
 * the runtime stamps mortal.identity.json into each per-identity copy of the
 * companion at provision time. the unstamped template (as built, or as a
 * future store distribution) has no config and idles.
 */
export interface StampedConfig {
  identityId: string;
  runtimePort: number;
  token: string;
  name: string;
  color: string;
}

export async function loadConfig(): Promise<StampedConfig | null> {
  try {
    const res = await fetch(chrome.runtime.getURL("mortal.identity.json"));
    if (!res.ok) return null;
    const config = (await res.json()) as StampedConfig;
    if (
      typeof config.identityId !== "string" ||
      typeof config.runtimePort !== "number" ||
      typeof config.token !== "string"
    ) {
      return null;
    }
    return config;
  } catch {
    return null;
  }
}

export function apiBase(config: StampedConfig): string {
  return `http://127.0.0.1:${config.runtimePort}`;
}

export async function apiFetch(
  config: StampedConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${apiBase(config)}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${config.token}`,
      ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
    },
  });
}
