/**
 * The only module allowed to call the network (`fetch`). Cloud repositories in `src/data/cloud/*` use it; UI code,
 * hooks and stores never call `fetch` directly (architecture guard R11).
 *
 * The data layer must not import stores, so the auth store registers how to get the session token and what to do
 * when the cloud rejects it (`registerCloudAuth`, called once when the store module loads).
 */

/** Cloud API base URL (VITE_CLOUD_API, no trailing slash). */
export const CLOUD_API = String(import.meta.env.VITE_CLOUD_API ?? '').replace(/\/$/, '');

export interface CloudAuthHandlers {
  /** The current session token, recovering a stored one if the in-memory session lost it. */
  getToken: () => Promise<string | null>;
  /** The cloud answered 401: pause cloud sync and ask the user to sign in again. */
  onUnauthorized: () => void;
}

let auth: CloudAuthHandlers = {
  getToken: async () => null,
  onUnauthorized: () => undefined,
};

export function registerCloudAuth(handlers: CloudAuthHandlers): void {
  auth = handlers;
}

/**
 * Authenticated JSON call to the cloud API (`endpoint` starts with `/`). Sends the bearer token and JSON content type
 * (unless the body is FormData), returns the parsed body, and throws `Error(body.error || 'An error occurred')` when
 * the response is not OK (after `onUnauthorized` for a 401).
 */
export async function cloudFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await auth.getToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${CLOUD_API}${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) auth.onUnauthorized();
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '';
    throw new Error(message || 'An error occurred');
  }
  return data as T;
}

/**
 * A raw request for callers that inspect the `Response` themselves (status codes, custom error bodies). `url` is
 * absolute, or a path (starting with `/`) on the cloud API. Adds nothing to `init`: pass headers explicitly.
 */
export function cloudRequest(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url.startsWith('/') ? `${CLOUD_API}${url}` : url, init);
}
