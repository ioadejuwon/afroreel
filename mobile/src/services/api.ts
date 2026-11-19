import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

declare const process: { env?: Record<string, string | undefined> };
declare const __DEV__: boolean;

const API_TIMEOUT_MS = 10000;
export const AUTH_TOKEN_STORAGE_KEY = 'afroreel.authToken';
export const AUTH_REFRESH_TOKEN_STORAGE_KEY = 'afroreel.refreshToken';

let apiAuthToken: string | null = null;
let apiRefreshToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

function getExpoHost(): string | null {
  const constants = Constants as unknown as {
    expoConfig?: { hostUri?: string; extra?: { apiBaseUrl?: string } };
    manifest?: { debuggerHost?: string; hostUri?: string };
  };
  const hostUri = constants.expoConfig?.hostUri ?? constants.manifest?.hostUri ?? constants.manifest?.debuggerHost;

  return hostUri?.split(':')[0] || null;
}

function getConfiguredApiBaseUrl(): string | undefined {
  const constants = Constants as unknown as {
    expoConfig?: { extra?: { apiBaseUrl?: string } };
  };

  return process.env?.EXPO_PUBLIC_API_BASE_URL ?? constants.expoConfig?.extra?.apiBaseUrl;
}

function createLocalApiBaseUrl(): string {
  const expoHost = getExpoHost();
  const canUseExpoHost = expoHost && !expoHost.includes('exp.direct');

  return `http://${canUseExpoHost ? expoHost : '192.168.68.120'}:3000`;
}

const configuredApiBaseUrl = getConfiguredApiBaseUrl()?.replace(/\/+$/, '');
if (!__DEV__ && !configuredApiBaseUrl?.startsWith('https://')) {
  throw new Error('Production builds require an HTTPS EXPO_PUBLIC_API_BASE_URL.');
}
export const API_BASE_URL = configuredApiBaseUrl || createLocalApiBaseUrl();
const API_ORIGIN = API_BASE_URL.match(/^https?:\/\/[^/]+/)?.[0] ?? API_BASE_URL;

export function setApiAuthToken(token: string | null): void {
  apiAuthToken = token;
}

export function setApiRefreshToken(token: string | null): void {
  apiRefreshToken = token;
}

async function refreshSession(): Promise<boolean> {
  apiRefreshToken ||= await SecureStore.getItemAsync(AUTH_REFRESH_TOKEN_STORAGE_KEY);
  if (!apiRefreshToken) return false;
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: apiRefreshToken }),
  });
  if (!response.ok) return false;
  const payload = await response.json() as { token: string; refreshToken: string };
  apiAuthToken = payload.token;
  apiRefreshToken = payload.refreshToken;
  await Promise.all([
    SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, payload.token),
    SecureStore.setItemAsync(AUTH_REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken),
  ]);
  return true;
}

export async function fetchJson<T>(path: string, options?: RequestInit, hasRetried = false): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (apiAuthToken) {
    headers.authorization = `Bearer ${apiAuthToken}`;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...headers,
        ...(options?.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? `Timed out loading ${url}`
      : `Could not reach ${url}`;

    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 401 && !hasRetried && !path.includes('/auth/')) {
      refreshPromise ||= refreshSession().finally(() => { refreshPromise = null; });
      if (await refreshPromise) return fetchJson<T>(path, options, true);
    }
    let errorMessage = `Request failed: ${response.status} from ${url}`;

    try {
      const payload = await response.json() as { error?: string };
      errorMessage = payload.error || errorMessage;
    } catch {
      // Keep the transport error if the response is not JSON.
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

export function resolveMediaUrl(value: string | null): string | null {
  if (!value || value.startsWith('http')) {
    return value;
  }

  return `${API_ORIGIN}${value.startsWith('/') ? value : `/${value}`}`;
}
