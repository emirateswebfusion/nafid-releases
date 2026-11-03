import { bindEvents } from './client';

/** Push subscriptions from the main process (sync, hardware, updater, WhatsApp). Channel catalog — the only way UI code reaches these IPC channels. */
export const bridgeEvents = bindEvents({
  onDeepLink: 'onDeepLink',
  onEmergencyPurged: 'onEmergencyPurged',
  onWhatsAppStatusUpdate: 'onWhatsAppStatusUpdate',
  onShopClosingUpdated: 'onShopClosingUpdated',
  onUpdateStatus: 'onUpdateStatus',
  onUpdateProgress: 'onUpdateProgress',
  onUpdateInfo: 'onUpdateInfo',
  onBarcodeScanned: 'onBarcodeScanned',
  onScaleWeight: 'onScaleWeight',
  onCardTerminalStatus: 'onCardTerminalStatus',
  onSyncDataUpdated: 'onSyncDataUpdated',
  onSyncCycleComplete: 'onSyncCycleComplete',
  onOnlineStatus: 'onOnlineStatus',
  onCloudStateChanged: 'onCloudStateChanged',
  onSyncProgress: 'onSyncProgress',
  onTokenExpired: 'onTokenExpired',
});
