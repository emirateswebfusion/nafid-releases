/** WhatsApp settings: device connection status and shop closing report history rows. */
export type WhatsAppStatus = 'disconnected' | 'connecting' | 'syncing' | 'connected';

/** A shop closing report delivery row as the closing history IPC returns it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClosingHistoryRow = any;
