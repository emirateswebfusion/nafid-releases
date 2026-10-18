import { useAuthStore } from '../store/authStore';

// API base URL — set VITE_CLOUD_API in .env
export const API_BASE = (import.meta.env.VITE_CLOUD_API as string).replace(/\/$/, '');

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  let token = useAuthStore.getState().token;
  
  // Auto-recover token from stored Electron config if state was cleared
  if (!token && typeof window !== 'undefined' && window.electronAPI?.authGetToken) {
    try {
      const stored = await window.electronAPI.authGetToken();
      if (stored?.jwt_token) {
        token = stored.jwt_token;
        useAuthStore.setState({ token: stored.jwt_token });
      }
    } catch {}
  }
  
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().setCloudSyncPaused(true, 'Token expired — Cloud Sync paused. Re-login to resume cloud sync.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-session-expired-modal'));
      }
    }
    throw new Error(data?.error || 'An error occurred');
  }

  return data;
}
