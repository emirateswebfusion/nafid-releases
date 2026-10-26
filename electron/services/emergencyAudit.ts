import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/**
 * Append-only audit trail of emergency wipes on this terminal. It is a JSON-lines file next to (not inside)
 * the database, so the wipe it records cannot erase it. Remote wipes are additionally recorded on the server
 * (emergency_wipe_commands + emergency_wipe_acks).
 */
export interface EmergencyAuditEntry {
  at: string;
  source: 'LOCAL' | 'REMOTE';
  wipe_mode: 'ALL_DATA' | 'SALES_AND_CASH_ONLY';
  reason: string;
  user_email?: string;
  user_id?: string;
  command_id?: string;
  issued_by?: string;
  terminal_code?: string;
}

export const auditFilePath = () => path.join(app.getPath('userData'), 'emergency-purge-audit.jsonl');

export function appendEmergencyAudit(entry: Omit<EmergencyAuditEntry, 'at'>): void {
  try {
    fs.appendFileSync(auditFilePath(), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf-8');
  } catch (err) {
    console.error('[EmergencyAudit] Could not write the audit entry:', err);
  }
}
