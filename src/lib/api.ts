/**
 * Thin client for the SURAKSHA-X server API. Two distinct failure kinds so
 * callers can react correctly:
 *  - NetworkError: the server could not be reached (offline, server down)
 *  - ApiError: the server answered with an error (401, 409, 400 …)
 */
const TOKEN_KEY = 'suraksha_token';

export class NetworkError extends Error {
  constructor(message = 'Server unreachable') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / storage disabled — session just won't persist */
  }
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(),
        ...(headers as Record<string, string> | undefined),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: rest.signal ?? AbortSignal.timeout(10_000),
    });
  } catch {
    throw new NetworkError();
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** A random id that works on plain-http LAN origins too (crypto.randomUUID needs a secure context). */
export function randomId(bytes = 12): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable per-device id so a citizen's SOS history survives restarts. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('suraksha_device_id');
    if (!id) {
      id = randomId(12);
      localStorage.setItem('suraksha_device_id', id);
    }
    return id;
  } catch {
    return randomId(12);
  }
}
