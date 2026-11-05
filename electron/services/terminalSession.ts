import { getOpenDb } from '../db/localDb.js';
import * as sql from '../db/statements/localAuth.js';

export interface TerminalSession {
  tenant_id: string;
  user_id: string;
  shop_name: string;
  user_name: string;
  role: string;
}

export function parseTerminalSession(value: unknown): TerminalSession | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.tenant_id !== 'string' || !row.tenant_id.trim() || typeof row.user_id !== 'string' || !row.user_id.trim()) return null;
  return { tenant_id: row.tenant_id, user_id: row.user_id,
    shop_name: typeof row.shop_name === 'string' ? row.shop_name : '',
    user_name: typeof row.user_name === 'string' ? row.user_name : '',
    role: typeof row.role === 'string' ? row.role : '' };
}

/** Device-local context only; it never grants access or stores a PIN/token. */
export function rememberTerminalSession(value: unknown): void {
  const session = parseTerminalSession(value);
  const db = getOpenDb();
  if (!session || !db) return;
  sql.saveTerminalSession(db).run(JSON.stringify(session));
}

export function readTerminalSession(): TerminalSession | null {
  const db = getOpenDb();
  if (!db) return null;
  const row = sql.readTerminalSession(db).get() as { value?: string } | undefined;
  try { return row?.value ? parseTerminalSession(JSON.parse(row.value)) : null; }
  catch { return null; }
}
