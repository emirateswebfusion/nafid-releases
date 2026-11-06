/** Desktop login uses the configured API from main, avoiding file-origin CORS without weakening server policy. */
export async function loginCloud(value: unknown): Promise<{ success: true; status: number; data: unknown } | { success: false; error: string }> {
  if (!value || typeof value !== 'object') return { success: false, error: 'Email and password required' };
  const input = value as Record<string, unknown>;
  if (typeof input.email !== 'string' || !input.email.trim() || typeof input.password !== 'string' || !input.password) {
    return { success: false, error: 'Email and password required' };
  }
  try {
    const configured = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || '').replace(/\/$/, '');
    const url = new URL(`${configured}/auth/login`);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
      return { success: false, error: 'The configured cloud login address is invalid. Contact support.' };
    }
    const response = await fetch(url.href, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: input.email.trim(), password: input.password }),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    const data: unknown = await response.json().catch(() => null);
    return { success: true, status: response.status, data };
  } catch {
    return { success: false, error: 'Cannot reach the cloud login service. Check the connection or continue offline.' };
  }
}
