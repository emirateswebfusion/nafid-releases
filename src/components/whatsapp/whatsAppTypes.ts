/** WhatsApp settings: device connection status and shop closing report history rows. */
import type { ShopClosingHistoryRow } from '../../data/whatsapp';

export type WhatsAppStatus = 'disconnected' | 'connecting' | 'syncing' | 'connected';

/** Alias of the full row returned by `shopClosing:getHistory`. */
export type ClosingHistoryRow = ShopClosingHistoryRow;
