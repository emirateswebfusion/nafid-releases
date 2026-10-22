import { bindBridge } from './client';

/** WhatsApp connection, invoice sending and shop-closing reports. Channel catalog — the only way UI code reaches these IPC channels. */
export const whatsappApi = bindBridge({
  getStatus: 'whatsappGetStatus',
  connect: 'whatsappConnect',
  disconnect: 'whatsappDisconnect',
  sendInvoice: 'whatsappSendInvoice',
  shopClosingGetConfig: 'shopClosingGetConfig',
  shopClosingSaveConfig: 'shopClosingSaveConfig',
  shopClosingGetPreview: 'shopClosingGetPreview',
  shopClosingSendReport: 'shopClosingSendReport',
  shopClosingGetHistory: 'shopClosingGetHistory',
  shopClosingRetry: 'shopClosingRetry',
});
