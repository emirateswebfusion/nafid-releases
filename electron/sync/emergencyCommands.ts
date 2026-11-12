import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';
import * as syncSql from '../db/statements/sync.js';
import { dbEmergencyPurgeLocalData } from '../services/emergencyPurgeService.js';
import { appendEmergencyAudit } from '../services/emergencyAudit.js';
import { getEncryptedPath, getConfigPath, getOfflineSessionPath, getTerminalLockPath } from '../services/authStorage.js';
import { EMERGENCY_POLL_MS, takeTurn } from './requestBudget.js';

/**
 * Owner-issued emergency wipe commands (nafid-server routes/emergency.ts). The server lists only commands issued
 * by an owner who re-entered the password; they are never accepted through synced settings. The terminal
 * acknowledges first (while it still holds its token), writes the audit entry, then wipes.
 */
interface RemoteWipeCommand {
  command_id: string;
  target_terminal: string;
  wipe_mode: 'ALL_DATA' | 'SALES_AND_CASH_ONLY';
  issued_by_name?: string | null;
}

type CloudRequest = (urlPath: string, init: RequestInit) => Promise<Response>;

function readTerminalCode(): string {
  try {
    const row = syncSql.findTerminalCode(getDb()).get() as { value?: string } | undefined;
    // settings values are stored JSON-encoded ("\"ZJ8P\""); older rows may hold the bare code
    let code: unknown = row?.value;
    try { code = JSON.parse(String(row?.value)); } catch { /* bare value */ }
    return typeof code === 'string' && code.trim() ? code.trim() : 'POS1';
  } catch { return 'POS1'; }
}

/**
 * Checks for a pending command for this terminal and executes the first one. `onWiped` stops the sync worker.
 * Checks at most every EMERGENCY_POLL_MS (the first cycle after start always checks).
 */
export async function pollEmergencyCommands(token: string, request: CloudRequest, onWiped: () => void): Promise<void> {
  if (!takeTurn('emergency-commands', EMERGENCY_POLL_MS)) return;
  const terminalCode = readTerminalCode();
  try {
    const res = await request(`/api/sync/emergency-commands?terminal_code=${encodeURIComponent(terminalCode)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return;
    const { commands } = (await res.json()) as { commands?: RemoteWipeCommand[] };
    for (const cmd of commands ?? []) {
      const ack = await request(`/api/sync/emergency-commands/${encodeURIComponent(cmd.command_id)}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ terminal_code: terminalCode }),
        signal: AbortSignal.timeout(15000),
      });
      if (!ack.ok) continue;
      executeRemoteEmergencyWipe(cmd, terminalCode);
      onWiped();
      return;
    }
  } catch (err) {
    console.warn('[EmergencyCommands] Check failed:', err instanceof Error ? err.message : err);
  }
}

function executeRemoteEmergencyWipe(cmd: RemoteWipeCommand, terminalCode: string) {
  try {
    const lastExecutedPath = path.join(app.getPath('userData'), 'last_executed_wipe_id.txt');
    if (fs.existsSync(lastExecutedPath) && fs.readFileSync(lastExecutedPath, 'utf-8').trim() === cmd.command_id) return;

    console.warn(`[EmergencyCommands] Remote wipe command ${cmd.command_id} for ${cmd.target_terminal}`);
    try { fs.writeFileSync(lastExecutedPath, String(cmd.command_id), 'utf-8'); } catch { /* ignore */ }

    const wipeMode = cmd.wipe_mode === 'SALES_AND_CASH_ONLY' ? 'SALES_AND_CASH_ONLY' : 'ALL_DATA';
    appendEmergencyAudit({ source: 'REMOTE', wipe_mode: wipeMode, reason: 'REMOTE_OWNER_COMMAND', command_id: cmd.command_id, issued_by: cmd.issued_by_name || undefined, terminal_code: terminalCode });

    dbEmergencyPurgeLocalData(wipeMode);
    for (const file of [getEncryptedPath(), getConfigPath(), getOfflineSessionPath(), getTerminalLockPath()]) {
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* ignore */ }
    }

    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send('emergency:purged', { wipeMode, reason: 'REMOTE_CLOUD_COMMAND' });
        setTimeout(() => { if (!win.isDestroyed()) win.webContents.reloadIgnoringCache(); }, 800);
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('[EmergencyCommands] Remote wipe failed:', err);
  }
}
