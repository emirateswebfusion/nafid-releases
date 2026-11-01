export interface TrialClaims { tenant_id: string; trial: true; trial_expires_at: string; exp: number }
export function readTrialClaims(token: string): TrialClaims | null {
  try {
    const claims: unknown = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!claims || typeof claims !== 'object') return null;
    const value = claims as Record<string, unknown>;
    if (value.trial !== true) return null;
    if (typeof value.tenant_id !== 'string' || typeof value.exp !== 'number' || typeof value.trial_expires_at !== 'string' || !Number.isFinite(Date.parse(value.trial_expires_at))) throw new Error('Invalid trial session');
    return value as unknown as TrialClaims;
  } catch { return null; }
}

export function trialAccessError(claims: TrialClaims, now: number, lastSeen: number): string | null {
  if (now + 300000 < lastSeen) return 'The device clock changed. Connect to the internet and sign in again.';
  if (now >= Date.parse(claims.trial_expires_at)) return 'Your trial has expired. Contact Nafid to extend or activate your account.';
  if (now >= claims.exp * 1000) return 'Connect to the internet and sign in to renew trial access.';
  return null;
}
