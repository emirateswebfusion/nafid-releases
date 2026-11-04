import { getDb } from '../db/localDb.js';
import { getSyncEndpoints } from '../sync/syncTransport.js';
import { LAN_KEY_HEADER, getLanPairingKey } from './lanPairing.js';
import { claimLocal, terminalId, type ClaimResult } from './restaurantOrderService.js';
import { asInput, failure, requiredText } from './restaurantInput.js';

/**
 * Billing claim across terminals (design §10). A LAN secondary asks the primary, which applies the claim in its own
 * database (`POST /api/restaurant/claim` in localHostServer.ts), then claims locally too so its screen agrees until the
 * next sync. The primary, a cloud-only terminal or an unreachable primary claim locally.
 */

/** Path of the LAN claim endpoint served by the primary. */
export const LAN_CLAIM_PATH = '/api/restaurant/claim';

/** IPC `restaurant:claimForBilling` — `{ order_id }`. `offline: true` means the primary could not be asked. */
export async function claimForBilling(payload: unknown): Promise<ClaimResult> {
  try {
    const orderId = requiredText(asInput(payload), 'order_id');
    const terminal = terminalId(getDb());
    const endpoints = getSyncEndpoints();
    if (endpoints.primaryRoute !== 'LAN' || endpoints.isLanPrimary || endpoints.disabled) {
      return claimLocal({ order_id: orderId, terminal });
    }
    let remote: ClaimResult;
    try {
      const response = await fetch(`${endpoints.primaryUrl}${LAN_CLAIM_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [LAN_KEY_HEADER]: getLanPairingKey() },
        body: JSON.stringify({ order_id: orderId, terminal }),
        signal: AbortSignal.timeout(3000),
      });
      remote = await response.json() as ClaimResult;
    } catch {
      const local = claimLocal({ order_id: orderId, terminal });
      return local.success ? { success: true, offline: true } : local;
    }
    if (!remote.success) {
      // The primary does not know the order yet (not synced): our own copy decides.
      if (remote.error === 'Order not found') return claimLocal({ order_id: orderId, terminal });
      return remote;
    }
    claimLocal({ order_id: orderId, terminal });
    return { success: true };
  } catch (error) {
    return failure('claimForBilling', error);
  }
}
